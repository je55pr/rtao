using Microsoft.Xna.Framework;
using Microsoft.Xna.Framework.Graphics;
using Rta.Formats;
using NumVector3 = System.Numerics.Vector3;

namespace Rta.Game;

/// <summary>
/// Clean-room world-road reconstruction using HG2's own post-collision minimap ribbon.
/// The minimap stores road X/Z in field coordinates; we project it onto the decoded
/// field surface and then apply the road texture uploads that are otherwise unused by
/// the prebuilt field meshes.
/// </summary>
internal sealed class FieldRoadMesh : IDisposable
{
    private const float MarkingLift = 0.025f;

    // FLD/223 exposes five road marking styles, each with a half-resolution follow-up
    // upload that appears to act as a mip level. The current renderer uses these in
    // a clean-room, topology-driven approximation of Peach Town's runtime road pass.
    private static readonly RoadTextureSpec StandardRoad = new(14705, 14721);
    private static readonly RoadTextureSpec OffsetJunctionRoad = new(14726, 14742);
    private static readonly RoadTextureSpec TransitionRoad = new(14747, 14763);
    private static readonly RoadTextureSpec TJunctionRoad = new(14768, 14784);
    private static readonly RoadTextureSpec WideRoad = new(14789, 14805);

    private readonly VertexPositionColor[] _plainVertices;
    private readonly List<TexturedRoadBatch> _texturedBatches = new();
    private VertexBuffer? _plainVertexBuffer;

    public FieldRoadMesh(
        GraphicsDevice graphicsDevice,
        FieldRoadNetwork roadNetwork,
        IReadOnlyDictionary<ushort, FieldTextureUpload> uploads)
    {
        ArgumentNullException.ThrowIfNull(graphicsDevice);
        ArgumentNullException.ThrowIfNull(roadNetwork);
        var plain = new List<VertexPositionColor>();
        var textured = new Dictionary<RoadTextureSpec, List<VertexPositionColorTexture>>();
        int sourceVertices = 0;
        int roadStripCount = 0;
        int texturedStripCount = 0;

        foreach (FieldRoadRibbon ribbon in roadNetwork.Ribbons)
        {
            roadStripCount++;
            sourceVertices += ribbon.Source.Vertices.Count;

            // Dirt routes (including the peach-tree approach) are already authored in
            // the field geometry. The minimap still calls them roads, but HG2 does not
            // paint the runtime tarmac/marking layer over them.
            if (ribbon.Surface == RoadSurfaceKind.Dirt)
                continue;

            RoadTextureSpec? textureSpec = ClassifyRibbon(ribbon.Id, ribbon.Source);
            if (textureSpec is RoadTextureSpec spec && uploads.ContainsKey(spec.TextureBasePointer) && uploads.ContainsKey(spec.ClutBasePointer))
            {
                texturedStripCount++;
                if (!textured.TryGetValue(spec, out List<VertexPositionColorTexture>? batch))
                {
                    batch = new List<VertexPositionColorTexture>();
                    textured.Add(spec, batch);
                }
                AppendTexturedStrip(batch, ribbon.Source, ribbon.ProjectedVertices);
            }
            else
            {
                AppendPlainStrip(plain, ribbon.ProjectedVertices);
            }
        }

        _plainVertices = plain.ToArray();
        foreach ((RoadTextureSpec spec, List<VertexPositionColorTexture> vertices) in textured)
        {
            Texture2D texture = CreateRoadTexture(graphicsDevice, uploads, spec);
            var vertexBuffer = new VertexBuffer(
                graphicsDevice,
                VertexPositionColorTexture.VertexDeclaration,
                vertices.Count,
                BufferUsage.WriteOnly);
            vertexBuffer.SetData(vertices.ToArray());
            _texturedBatches.Add(new TexturedRoadBatch(spec, texture, vertexBuffer, vertices.Count / 3));
        }

        RoadStripCount = roadStripCount;
        TexturedStripCount = texturedStripCount;
        SourceVertexCount = sourceVertices;
        UnresolvedVertexCount = roadNetwork.UnresolvedVertexCount;
    }

    public int RoadStripCount { get; }
    public int TexturedStripCount { get; }
    public int SourceVertexCount { get; }
    public int UnresolvedVertexCount { get; }
    public int TriangleCount =>
        _plainVertices.Length / 3 +
        _texturedBatches.Sum(batch => batch.TriangleCount);
    public int DrawCallCount =>
        (_plainVertexBuffer is not null && _plainVertices.Length >= 3 ? 1 : 0) +
        _texturedBatches.Count;

    private static Color TarmacColor => new(55, 57, 58);

    public void Load(GraphicsDevice graphicsDevice)
    {
        if (_plainVertices.Length == 0)
            return;

        _plainVertexBuffer?.Dispose();
        _plainVertexBuffer = new VertexBuffer(
            graphicsDevice,
            VertexPositionColor.VertexDeclaration,
            _plainVertices.Length,
            BufferUsage.WriteOnly);
        _plainVertexBuffer.SetData(_plainVertices);
    }

    public void Draw(GraphicsDevice graphicsDevice, BasicEffect effect) =>
        Draw(graphicsDevice, effect, Matrix.Identity);

    public void Draw(GraphicsDevice graphicsDevice, BasicEffect effect, Matrix world)
    {
        bool previousTextureEnabled = effect.TextureEnabled;
        bool previousVertexColorEnabled = effect.VertexColorEnabled;
        Matrix previousWorld = effect.World;
        effect.World = world;
        try
        {
            if (_plainVertexBuffer is not null && _plainVertices.Length >= 3)
            {
                effect.TextureEnabled = false;
                effect.VertexColorEnabled = true;
                graphicsDevice.SetVertexBuffer(_plainVertexBuffer);
                foreach (EffectPass pass in effect.CurrentTechnique.Passes)
                {
                    pass.Apply();
                    graphicsDevice.DrawPrimitives(PrimitiveType.TriangleList, 0, _plainVertices.Length / 3);
                }
            }

            effect.TextureEnabled = true;
            effect.VertexColorEnabled = true;
            graphicsDevice.SamplerStates[0] = RoadSampler;
            foreach (TexturedRoadBatch batch in _texturedBatches)
            {
                effect.Texture = batch.Texture;
                graphicsDevice.SetVertexBuffer(batch.VertexBuffer);
                foreach (EffectPass pass in effect.CurrentTechnique.Passes)
                {
                    pass.Apply();
                    graphicsDevice.DrawPrimitives(PrimitiveType.TriangleList, 0, batch.TriangleCount);
                }
            }
        }
        finally
        {
            effect.World = previousWorld;
            effect.TextureEnabled = previousTextureEnabled;
            effect.VertexColorEnabled = previousVertexColorEnabled;
        }
    }

    public void Dispose()
    {
        _plainVertexBuffer?.Dispose();
        foreach (TexturedRoadBatch batch in _texturedBatches)
        {
            batch.VertexBuffer.Dispose();
            batch.Texture.Dispose();
        }
    }

    private static readonly SamplerState RoadSampler = new()
    {
        Filter = TextureFilter.Linear,
        AddressU = TextureAddressMode.Clamp,
        AddressV = TextureAddressMode.Wrap,
        AddressW = TextureAddressMode.Wrap,
        MaxMipLevel = 0,
        MaxAnisotropy = 1
    };

    private static void AppendPlainStrip(List<VertexPositionColor> output, IReadOnlyList<Vector3> projected)
    {
        for (int i = 0; i < projected.Count - 2; i++)
        {
            int a = (i & 1) == 0 ? i : i + 1;
            int b = (i & 1) == 0 ? i + 1 : i;
            int c = i + 2;
            output.Add(new VertexPositionColor(projected[a], TarmacColor));
            output.Add(new VertexPositionColor(projected[b], TarmacColor));
            output.Add(new VertexPositionColor(projected[c], TarmacColor));
        }
    }

    private static void AppendTexturedStrip(
        List<VertexPositionColorTexture> output,
        FieldMinimapPrimitive primitive,
        IReadOnlyList<Vector3> projected)
    {
        Vector2[] uv = BuildRibbonUvs(primitive);
        for (int i = 0; i < projected.Count - 2; i++)
        {
            int a = (i & 1) == 0 ? i : i + 1;
            int b = (i & 1) == 0 ? i + 1 : i;
            int c = i + 2;
            output.Add(new VertexPositionColorTexture(projected[a] + Vector3.Up * MarkingLift, Color.White, uv[a]));
            output.Add(new VertexPositionColorTexture(projected[b] + Vector3.Up * MarkingLift, Color.White, uv[b]));
            output.Add(new VertexPositionColorTexture(projected[c] + Vector3.Up * MarkingLift, Color.White, uv[c]));
        }
    }

    private static Vector2[] BuildRibbonUvs(FieldMinimapPrimitive primitive)
    {
        int count = primitive.Vertices.Count;
        var uv = new Vector2[count];
        int pairCount = count / 2;
        if (pairCount == 0)
            return uv;

        var centers = new Vector2[pairCount];
        var widths = new float[pairCount];
        for (int pair = 0; pair < pairCount; pair++)
        {
            NumVector3 a = primitive.Vertices[pair * 2].Position;
            NumVector3 b = primitive.Vertices[pair * 2 + 1].Position;
            centers[pair] = new Vector2((a.X + b.X) * 0.5f, (a.Z + b.Z) * 0.5f);
            widths[pair] = Vector2.Distance(new Vector2(a.X, a.Z), new Vector2(b.X, b.Z));
        }

        float meanWidth = widths.Average();
        // Repeating the 64-pixel-long source every ~2 road widths produces dash
        // spacing close to the PS2 screenshots while remaining scale-aware on the
        // 10m and 20m road classes. This is provisional until the CPU road UV logic
        // itself is recovered.
        float repeatLength = Math.Max(8f, meanWidth * 2f);
        var distance = new float[pairCount];
        for (int pair = 1; pair < pairCount; pair++)
            distance[pair] = distance[pair - 1] + Vector2.Distance(centers[pair - 1], centers[pair]);

        for (int i = 0; i < count; i++)
        {
            int pair = Math.Min(i / 2, pairCount - 1);
            float u = (i & 1) == 0 ? 0f : 1f;
            float v = distance[pair] / repeatLength;
            uv[i] = new Vector2(u, v);
        }
        return uv;
    }

    private static RoadTextureSpec? ClassifyRibbon(int roadId, FieldMinimapPrimitive primitive)
    {
        int pairCount = primitive.Vertices.Count / 2;
        if (pairCount < 1)
            return null;

        float widthSum = 0f;
        float maxWidth = 0f;
        for (int pair = 0; pair < pairCount; pair++)
        {
            NumVector3 a = primitive.Vertices[pair * 2].Position;
            NumVector3 b = primitive.Vertices[Math.Min(pair * 2 + 1, primitive.Vertices.Count - 1)].Position;
            float width = Vector2.Distance(new Vector2(a.X, a.Z), new Vector2(b.X, b.Z));
            widthSum += width;
            maxWidth = Math.Max(maxWidth, width);
        }

        float meanWidth = widthSum / pairCount;

        // The minimap road mesh already separates Peach Town into 30 strips, and the
        // tiny cluster around the town centre corresponds to the roundabout/junction
        // patches rather than ordinary through-roads. Until HG2's CPU road-style
        // selector is fully recovered, use a field-specific provisional mapping that
        // still relies on clean-room decoded strip topology.
        return roadId switch
        {
            // Main narrow roads / short connectors.
            0 or 1 or 2 or 3 or 5 or 6 or 7 or 8 or 9 or 10 or 11 or 20 or 29 => StandardRoad,

            // Broad approaches and outer wider roads.
            19 or 21 or 22 or 26 or 27 or 28 => WideRoad,

            // Small offset roundabout/junction inserts.
            12 or 13 or 14 or 17 or 24 => OffsetJunctionRoad,

            // Short transitions and odd little connector caps.
            4 or 15 or 16 or 18 or 23 => TransitionRoad,

            // Larger local junction patches around the centre.
            25 => TJunctionRoad,

            _ => meanWidth <= 15f && maxWidth <= 20f ? StandardRoad :
                 pairCount >= 3 && meanWidth is >= 16f and <= 28f && maxWidth <= 32f ? WideRoad :
                 pairCount <= 2 && meanWidth is >= 15f and <= 19.5f ? OffsetJunctionRoad :
                 pairCount <= 2 && meanWidth is > 19.5f and <= 32f ? TJunctionRoad :
                 null
        };
    }

    private static Texture2D CreateRoadTexture(
        GraphicsDevice graphicsDevice,
        IReadOnlyDictionary<ushort, FieldTextureUpload> uploads,
        RoadTextureSpec spec)
    {
        FieldTextureUpload image = uploads[spec.TextureBasePointer];
        FieldTextureUpload clut = uploads[spec.ClutBasePointer];
        if (image.DestinationPixelStorageFormat != GsPixelStorageFormat.PsmT4)
            throw new NotSupportedException($"Road texture TBP {spec.TextureBasePointer} is not PSMT4.");

        Color[] palette = DecodePsmT4Palette(clut);
        var pixels = new Color[image.Width * image.Height];
        int pixel = 0;
        foreach (byte packed in image.Data)
        {
            if (pixel < pixels.Length)
                pixels[pixel++] = palette[packed & 0x0F];
            if (pixel < pixels.Length)
                pixels[pixel++] = palette[(packed >> 4) & 0x0F];
        }

        var texture = new Texture2D(graphicsDevice, image.Width, image.Height, false, SurfaceFormat.Color);
        texture.SetData(pixels);
        return texture;
    }

    private static Color[] DecodePsmT4Palette(FieldTextureUpload clut)
    {
        int physicalCount = clut.Data.Length / 4;
        var physical = new Color[physicalCount];
        for (int i = 0; i < physicalCount; i++)
        {
            int offset = i * 4;
            byte alpha = clut.Data[offset + 3] == 0
                ? (byte)0
                : (byte)Math.Min(255, clut.Data[offset + 3] * 2);
            physical[i] = new Color(clut.Data[offset], clut.Data[offset + 1], clut.Data[offset + 2], alpha);
        }

        var logical = new Color[16];
        for (int i = 0; i < logical.Length; i++)
        {
            int physicalIndex = (i & ~0x18) | ((i & 0x08) << 1) | ((i & 0x10) >> 1);
            logical[i] = physicalIndex < physical.Length ? physical[physicalIndex] : Color.Magenta;
        }
        return logical;
    }

    private readonly record struct RoadTextureSpec(ushort TextureBasePointer, ushort ClutBasePointer);
    private sealed record TexturedRoadBatch(
        RoadTextureSpec Spec,
        Texture2D Texture,
        VertexBuffer VertexBuffer,
        int TriangleCount);
}
