using Microsoft.Xna.Framework;
using Microsoft.Xna.Framework.Graphics;
using Rta.Formats;
using NumVector3 = System.Numerics.Vector3;

namespace Rta.Game;

internal sealed class FieldTexturedMesh : IDisposable
{
    private readonly List<SubMesh> _subMeshes;
    private readonly List<BillboardBatch> _billboardBatches;
    private readonly List<TextureResource> _textureResources;
    private readonly BoundingBox _bounds;

    public FieldTexturedMesh(
        GraphicsDevice graphicsDevice,
        IReadOnlyList<FieldRenderPrimitive> primitives,
        GsLocalMemory gsMemory)
    {
        ArgumentNullException.ThrowIfNull(graphicsDevice);
        ArgumentNullException.ThrowIfNull(primitives);
        ArgumentNullException.ThrowIfNull(gsMemory);

        // Preserve HG2's original 8x8 spatial chunk partition rather than merging a
        // texture across the entire 1600x1600 field. The first renderer intentionally
        // grouped only by material because it was simple, but that makes camera
        // frustum culling effectively impossible: one common ground texture can span
        // most of a sector. Chunk + material batching gives us useful ~200-unit
        // culling cells while still keeping draw-call counts modest.
        var staticGroups = new Dictionary<StaticGroupKey, StaticGroupBuilder>();
        var billboardGroups = new Dictionary<BillboardGroupKey, List<FieldRenderPrimitive>>();

        foreach (FieldRenderPrimitive primitive in primitives)
        {
            if (primitive.PrimitiveType != 4 || primitive.Vertices.Count < 3)
                continue;

            // The current runtime is deliberately daytime-only. FLD/220 carries
            // 62 authored bridge corona/lamp billboards whose night colours are much
            // brighter than their day colours; original PAL captures confirm the
            // sprites themselves are absent during the day. Retain them in the decoded
            // primitive stream for a future clock renderer, but do not submit them now.
            if (primitive.IsNightLightBillboard)
                continue;

            TextureKey key = TextureKey.FromMaterial(primitive.Material);
            if (primitive.PlacementOffset is not null)
            {
                BillboardGroupKey groupKey = BillboardGroupKey.FromPrimitive(primitive, key);
                if (!billboardGroups.TryGetValue(groupKey, out List<FieldRenderPrimitive>? billboardPrimitives))
                {
                    billboardPrimitives = new List<FieldRenderPrimitive>();
                    billboardGroups.Add(groupKey, billboardPrimitives);
                }
                billboardPrimitives.Add(primitive);
                continue;
            }

            var staticKey = new StaticGroupKey(primitive.ChunkIndex, key, primitive.TextureMappingEnabled);
            if (!staticGroups.TryGetValue(staticKey, out StaticGroupBuilder? group))
            {
                group = new StaticGroupBuilder();
                staticGroups.Add(staticKey, group);
            }

            AppendTriangleList(group, primitive, cameraPosition: null);
        }

        var resources = new Dictionary<TextureKey, TextureResource>();
        TextureResource GetResource(TextureKey key)
        {
            (Texture2D texture, bool hasTransparency) = CreateTexture(graphicsDevice, gsMemory, key);
            SamplerState sampler = CreateSamplerState(key);
            var resource = new TextureResource(key, texture, sampler, hasTransparency);
            resources.Add(key, resource);
            return resource;
        }

        TextureResource ResourceFor(TextureKey key) =>
            resources.TryGetValue(key, out TextureResource? resource) ? resource : GetResource(key);

        _subMeshes = new List<SubMesh>(staticGroups.Count);
        // HG2's global static layer contains facade/backing fills that are deliberately
        // coplanar with spatial-chunk cutout details. Original PAL captures around Fuji
        // confirm the backing belongs underneath the lattice, so submit it first.
        foreach ((StaticGroupKey groupKey, StaticGroupBuilder group) in
            staticGroups.OrderBy(pair => pair.Key.ChunkIndex == 64 ? 0 : 1))
        {
            List<VertexPositionColorTexture> vertices = group.Vertices;
            VertexBuffer vertexBuffer = new(
                graphicsDevice,
                VertexPositionColorTexture.VertexDeclaration,
                vertices.Count,
                BufferUsage.WriteOnly);
            VertexPositionColorTexture[] vertexArray = vertices.ToArray();
            vertexBuffer.SetData(vertexArray);
            _subMeshes.Add(new SubMesh(
                groupKey,
                ResourceFor(groupKey.Texture),
                vertexBuffer,
                vertices.Count / 3,
                BoundsFor(vertexArray)));
        }

        _billboardBatches = new List<BillboardBatch>(billboardGroups.Count);
        foreach ((BillboardGroupKey groupKey, List<FieldRenderPrimitive> billboardPrimitives) in billboardGroups)
        {
            int maximumVertexCount = billboardPrimitives.Sum(EstimateTriangleListVertices);
            _billboardBatches.Add(new BillboardBatch(
                groupKey,
                ResourceFor(groupKey.Texture),
                billboardPrimitives,
                new VertexPositionColorTexture[maximumVertexCount],
                BillboardBoundsFor(billboardPrimitives)));
        }

        _textureResources = resources.Values.ToList();
        _bounds = UnionBounds(
            _subMeshes.Select(mesh => mesh.Bounds)
                .Concat(_billboardBatches.Select(batch => batch.Bounds)));
    }

    public int SubMeshCount => _subMeshes.Count + _billboardBatches.Count;
    public int TextureResourceCount => _textureResources.Count;
    public BoundingBox Bounds => _bounds;
    public int TriangleCount =>
        _subMeshes.Sum(mesh => mesh.TriangleCount) +
        _billboardBatches.Sum(batch => batch.Primitives.Sum(p => Math.Max(0, p.Vertices.Count - 2)));

    public int OpaqueBatchCount =>
        _subMeshes.Count(mesh => !mesh.UsesTransparency) +
        _billboardBatches.Count(batch => !batch.Resource.HasTransparency);

    public int AlphaBatchCount =>
        _subMeshes.Count(mesh => mesh.UsesTransparency) +
        _billboardBatches.Count(batch => batch.Resource.HasTransparency);

    public FieldDrawStats DrawPhase(
        GraphicsDevice graphicsDevice,
        BasicEffect effect,
        AlphaTestEffect? alphaEffect,
        Vector3 cameraPosition,
        Matrix world,
        BoundingFrustum? frustum,
        FieldRenderPhase phase)
    {
        var stats = new FieldDrawStats();
        Matrix previousWorld = effect.World;
        effect.World = world;
        try
        {
            if (phase == FieldRenderPhase.Opaque)
            {
                foreach (SubMesh subMesh in _subMeshes.Where(mesh => !mesh.UsesTransparency))
                    DrawSubMesh(graphicsDevice, effect, subMesh, world, frustum, stats);
            }
            else
            {
                // HG2's cutout/translucent materials are intentionally submitted only
                // after *every visible sector* has established opaque depth. The old
                // per-sector opaque->alpha ordering allowed a seam-adjacent tree or
                // bunting edge to blend against sky, write depth, and then reject the
                // opaque hill/building from a later sector. RtaGame owns the global
                // two-phase ordering; this method only submits one requested phase.
                BlendState previousBlend = graphicsDevice.BlendState;
                graphicsDevice.BlendState = BlendState.AlphaBlend;
                try
                {
                    foreach (SubMesh subMesh in _subMeshes.Where(mesh => mesh.UsesTransparency))
                    {
                        if (alphaEffect is not null)
                            DrawAlphaSubMesh(graphicsDevice, alphaEffect, subMesh, world, frustum, stats);
                        else
                            DrawSubMesh(graphicsDevice, effect, subMesh, world, frustum, stats);
                    }
                }
                finally
                {
                    graphicsDevice.BlendState = previousBlend;
                }
            }

            DrawBillboardPhase(graphicsDevice, effect, alphaEffect, cameraPosition, world, frustum, phase, stats);
            return stats;
        }
        finally
        {
            effect.World = previousWorld;
        }
    }

    private void DrawBillboardPhase(
        GraphicsDevice graphicsDevice,
        BasicEffect effect,
        AlphaTestEffect? alphaEffect,
        Vector3 cameraPosition,
        Matrix world,
        BoundingFrustum? frustum,
        FieldRenderPhase phase,
        FieldDrawStats stats)
    {
        if (_billboardBatches.Count == 0)
            return;

        // Billboard vertices remain in field-local coordinates and are then translated
        // by effect.World. The caller supplies cameraPosition in this sector's local
        // frame. Opaque billboards participate in the global opaque phase; cutout or
        // translucent billboards participate in the later alpha phase.
        graphicsDevice.SetVertexBuffer(null);

        foreach (BillboardBatch batch in _billboardBatches)
        {
            bool usesTransparency = batch.Resource.HasTransparency;
            if ((phase == FieldRenderPhase.Alpha) != usesTransparency)
                continue;

            stats.CandidateBatches++;
            if (frustum is not null && frustum.Contains(TranslateBounds(batch.Bounds, world.Translation)) == ContainmentType.Disjoint)
            {
                stats.CulledBatches++;
                continue;
            }

            int vertexCount = FillBillboardVertices(batch.Vertices, batch.Primitives, cameraPosition);
            if (vertexCount == 0)
                continue;

            graphicsDevice.SamplerStates[0] = batch.Resource.SamplerState;
            if (usesTransparency && alphaEffect is not null)
            {
                Matrix previousAlphaWorld = alphaEffect.World;
                BlendState previousBillboardBlend = graphicsDevice.BlendState;
                graphicsDevice.BlendState = BlendState.AlphaBlend;
                alphaEffect.World = world;
                alphaEffect.Texture = batch.Resource.Texture;
                try
                {
                    foreach (EffectPass pass in alphaEffect.CurrentTechnique.Passes)
                    {
                        pass.Apply();
                        graphicsDevice.DrawUserPrimitives(
                            PrimitiveType.TriangleList,
                            batch.Vertices,
                            0,
                            vertexCount / 3);
                        stats.DrawCalls++;
                    }
                }
                finally
                {
                    alphaEffect.World = previousAlphaWorld;
                    graphicsDevice.BlendState = previousBillboardBlend;
                }
            }
            else
            {
                effect.TextureEnabled = batch.Key.TextureEnabled;
                if (batch.Key.TextureEnabled)
                    effect.Texture = batch.Resource.Texture;
                foreach (EffectPass pass in effect.CurrentTechnique.Passes)
                {
                    pass.Apply();
                    graphicsDevice.DrawUserPrimitives(
                        PrimitiveType.TriangleList,
                        batch.Vertices,
                        0,
                        vertexCount / 3);
                    stats.DrawCalls++;
                }
            }
            stats.DrawnTriangles += vertexCount / 3;
        }
    }

    private static void DrawSubMesh(
        GraphicsDevice graphicsDevice,
        BasicEffect effect,
        SubMesh subMesh,
        Matrix world,
        BoundingFrustum? frustum,
        FieldDrawStats stats)
    {
        stats.CandidateBatches++;
        if (frustum is not null && frustum.Contains(TranslateBounds(subMesh.Bounds, world.Translation)) == ContainmentType.Disjoint)
        {
            stats.CulledBatches++;
            return;
        }

        effect.TextureEnabled = subMesh.Key.TextureEnabled;
        if (subMesh.Key.TextureEnabled)
            effect.Texture = subMesh.Resource.Texture;
        graphicsDevice.SetVertexBuffer(subMesh.VertexBuffer);
        graphicsDevice.SamplerStates[0] = subMesh.Resource.SamplerState;
        foreach (EffectPass pass in effect.CurrentTechnique.Passes)
        {
            pass.Apply();
            graphicsDevice.DrawPrimitives(PrimitiveType.TriangleList, 0, subMesh.TriangleCount);
            stats.DrawCalls++;
        }
        stats.DrawnTriangles += subMesh.TriangleCount;
    }


    private static void DrawAlphaSubMesh(
        GraphicsDevice graphicsDevice,
        AlphaTestEffect effect,
        SubMesh subMesh,
        Matrix world,
        BoundingFrustum? frustum,
        FieldDrawStats stats)
    {
        stats.CandidateBatches++;
        if (frustum is not null && frustum.Contains(TranslateBounds(subMesh.Bounds, world.Translation)) == ContainmentType.Disjoint)
        {
            stats.CulledBatches++;
            return;
        }

        Matrix previousWorld = effect.World;
        effect.World = world;
        effect.Texture = subMesh.Resource.Texture;
        graphicsDevice.SetVertexBuffer(subMesh.VertexBuffer);
        graphicsDevice.SamplerStates[0] = subMesh.Resource.SamplerState;
        foreach (EffectPass pass in effect.CurrentTechnique.Passes)
        {
            pass.Apply();
            graphicsDevice.DrawPrimitives(PrimitiveType.TriangleList, 0, subMesh.TriangleCount);
            stats.DrawCalls++;
        }
        stats.DrawnTriangles += subMesh.TriangleCount;
        effect.World = previousWorld;
    }

    public void Dispose()
    {
        foreach (SubMesh subMesh in _subMeshes)
            subMesh.VertexBuffer.Dispose();

        foreach (TextureResource resource in _textureResources)
            resource.Dispose();
    }

    private static BoundingBox BoundsFor(ReadOnlySpan<VertexPositionColorTexture> vertices)
    {
        if (vertices.Length == 0)
            return new BoundingBox(Vector3.Zero, Vector3.Zero);

        Vector3 min = vertices[0].Position;
        Vector3 max = min;
        for (int i = 1; i < vertices.Length; i++)
        {
            min = Vector3.Min(min, vertices[i].Position);
            max = Vector3.Max(max, vertices[i].Position);
        }
        return new BoundingBox(min, max);
    }

    private static BoundingBox BillboardBoundsFor(IReadOnlyList<FieldRenderPrimitive> primitives)
    {
        Vector3 min = new(float.PositiveInfinity);
        Vector3 max = new(float.NegativeInfinity);
        foreach (FieldRenderPrimitive primitive in primitives)
        {
            if (primitive.PlacementOffset is not NumVector3 anchorNumerics)
                continue;

            Vector3 anchor = RtaWorldCoordinates.Position(anchorNumerics);
            float horizontalRadius = 0f;
            float minY = 0f;
            float maxY = 0f;
            foreach (FieldRenderVertex vertex in primitive.Vertices)
            {
                Vector3 local = RtaWorldCoordinates.LocalVector(vertex.Position - anchorNumerics);
                horizontalRadius = MathF.Max(horizontalRadius, MathF.Sqrt(local.X * local.X + local.Z * local.Z));
                minY = MathF.Min(minY, local.Y);
                maxY = MathF.Max(maxY, local.Y);
            }

            min = Vector3.Min(min, new Vector3(anchor.X - horizontalRadius, anchor.Y + minY, anchor.Z - horizontalRadius));
            max = Vector3.Max(max, new Vector3(anchor.X + horizontalRadius, anchor.Y + maxY, anchor.Z + horizontalRadius));
        }

        if (float.IsPositiveInfinity(min.X))
            return new BoundingBox(Vector3.Zero, Vector3.Zero);
        return new BoundingBox(min, max);
    }

    private static BoundingBox UnionBounds(IEnumerable<BoundingBox> boxes)
    {
        using IEnumerator<BoundingBox> enumerator = boxes.GetEnumerator();
        if (!enumerator.MoveNext())
            return new BoundingBox(Vector3.Zero, Vector3.Zero);
        BoundingBox result = enumerator.Current;
        while (enumerator.MoveNext())
        {
            BoundingBox next = enumerator.Current;
            result = new BoundingBox(Vector3.Min(result.Min, next.Min), Vector3.Max(result.Max, next.Max));
        }
        return result;
    }

    private static BoundingBox TranslateBounds(BoundingBox bounds, Vector3 translation) =>
        new(bounds.Min + translation, bounds.Max + translation);

    private static void AppendTriangleList(
        StaticGroupBuilder output,
        FieldRenderPrimitive primitive,
        Vector3? cameraPosition)
    {
        if (primitive.PrimitiveType != 4)
            return;

        for (int i = 0; i < primitive.Vertices.Count - 2; i++)
        {
            int a = (i & 1) == 0 ? i : i + 1;
            int b = (i & 1) == 0 ? i + 1 : i;
            int c = i + 2;
            VertexPositionColorTexture va = ToVertex(primitive.Vertices[a]);
            VertexPositionColorTexture vb = ToVertex(primitive.Vertices[b]);
            VertexPositionColorTexture vc = ToVertex(primitive.Vertices[c]);

            // A tiny fraction of HG2 strips are repeated with sub-millimetre float
            // noise but identical rendered colour/UV. The PS2 effectively collapses
            // these to one surface; modern depth precision makes the copies shimmer.
            // Suppress only renderer-indistinguishable repeats inside one material/chunk.
            if (!output.Triangles.Add(TriangleKey.From(va, vb, vc)))
                continue;

            output.Vertices.Add(va);
            output.Vertices.Add(vb);
            output.Vertices.Add(vc);
        }
    }

    private static int FillBillboardVertices(
        VertexPositionColorTexture[] output,
        IReadOnlyList<FieldRenderPrimitive> primitives,
        Vector3 cameraPosition)
    {
        int outputIndex = 0;
        foreach (FieldRenderPrimitive primitive in primitives)
        {
            if (primitive.PlacementOffset is not NumVector3 anchorNumerics)
                continue;

            Vector3 anchor = RtaWorldCoordinates.Position(anchorNumerics);
            Vector3 toCamera = cameraPosition - anchor;
            toCamera.Y = 0f;
            if (toCamera.LengthSquared() < 0.000001f)
                toCamera = Vector3.Forward;
            else
                toCamera.Normalize();

            Vector3 right = Vector3.Cross(Vector3.Up, toCamera);
            if (right.LengthSquared() < 0.000001f)
                right = Vector3.Right;
            else
                right.Normalize();
            Vector3 forward = Vector3.Cross(right, Vector3.Up);
            if (forward.LengthSquared() > 0.000001f)
                forward.Normalize();

            for (int i = 0; i < primitive.Vertices.Count - 2; i++)
            {
                int a = (i & 1) == 0 ? i : i + 1;
                int b = (i & 1) == 0 ? i + 1 : i;
                int c = i + 2;
                output[outputIndex++] = ToBillboardVertex(primitive.Vertices[a], anchorNumerics, anchor, right, forward);
                output[outputIndex++] = ToBillboardVertex(primitive.Vertices[b], anchorNumerics, anchor, right, forward);
                output[outputIndex++] = ToBillboardVertex(primitive.Vertices[c], anchorNumerics, anchor, right, forward);
            }
        }

        return outputIndex;
    }

    private static VertexPositionColorTexture ToBillboardVertex(
        FieldRenderVertex source,
        NumVector3 anchorNumerics,
        Vector3 anchor,
        Vector3 right,
        Vector3 forward)
    {
        NumVector3 sourcePosition = source.Position;
        NumVector3 sourceLocal = sourcePosition - anchorNumerics;
        Vector3 local = RtaWorldCoordinates.LocalVector(sourceLocal);
        Vector3 worldPosition =
            anchor +
            right * local.X +
            Vector3.Up * local.Y +
            forward * local.Z;
        return ToBillboardVertexData(source, worldPosition);
    }

    private static int EstimateTriangleListVertices(FieldRenderPrimitive primitive) =>
        primitive.PrimitiveType == 4 ? Math.Max(0, primitive.Vertices.Count - 2) * 3 : 0;

    private static (Texture2D Texture, bool HasTransparency) CreateTexture(
        GraphicsDevice graphicsDevice,
        GsLocalMemory gsMemory,
        TextureKey key)
    {
        try
        {
            byte[] image = gsMemory.ReadTexture(key.Tex0);
            byte[]? clut = key.Indexed ? gsMemory.ReadCsm1Clut(key.Tex0) : null;
            Color[] pixels = DecodePixels(key, image, clut);
            bool hasTransparency = pixels.Any(pixel => pixel.A < 255);
            if (hasTransparency)
                PremultiplyAlpha(pixels);

            var texture = new Texture2D(graphicsDevice, key.Width, key.Height, false, SurfaceFormat.Color);
            texture.SetData(pixels);
            return (texture, hasTransparency);
        }
        catch (Exception ex) when (ex is NotSupportedException or InvalidDataException or InvalidOperationException)
        {
            return (CreateFallbackTexture(graphicsDevice, 16, 16, Color.Magenta, Color.Black), false);
        }
    }

    private static void PremultiplyAlpha(Span<Color> pixels)
    {
        // Desktop GPUs bilinearly filter RGBA before blending. HG2's indexed cutout
        // textures keep arbitrary RGB in transparent/near-transparent palette entries;
        // filtering those as straight alpha lets the hidden RGB bleed into tree and
        // bunting silhouettes. Store alpha-bearing field textures premultiplied and
        // render them with BlendState.AlphaBlend so interpolation remains alpha-weighted.
        for (int i = 0; i < pixels.Length; i++)
        {
            Color pixel = pixels[i];
            if (pixel.A == 255)
                continue;
            float alpha = pixel.A / 255f;
            pixels[i] = new Color(
                (byte)MathF.Round(pixel.R * alpha),
                (byte)MathF.Round(pixel.G * alpha),
                (byte)MathF.Round(pixel.B * alpha),
                pixel.A);
        }
    }

    private static Color[] DecodePixels(TextureKey key, ReadOnlySpan<byte> image, byte[]? clut)
    {
        return key.PixelStorageFormat switch
        {
            GsPixelStorageFormat.PsmCt24 => DecodeRgb24(key, image),
            GsPixelStorageFormat.PsmT8 => DecodeIndexed8(key, image, clut),
            GsPixelStorageFormat.PsmT4 => DecodeIndexed4(key, image, clut),
            _ => CreateSolidPixels(key.Width, key.Height, new Color(255, 0, 255, 255))
        };
    }

    private static Color[] DecodeRgb24(TextureKey key, ReadOnlySpan<byte> source)
    {
        Color[] output = new Color[key.Width * key.Height];
        int pixelCount = Math.Min(output.Length, source.Length / 3);
        for (int i = 0; i < pixelCount; i++)
        {
            int offset = i * 3;
            output[i] = new Color(source[offset], source[offset + 1], source[offset + 2], (byte)255);
        }
        return output;
    }

    private static Color[] DecodeIndexed8(TextureKey key, ReadOnlySpan<byte> source, byte[]? clut)
    {
        Color[] palette = DecodeLogicalPalette(clut, 256);
        Color[] output = new Color[key.Width * key.Height];
        int pixelCount = Math.Min(output.Length, source.Length);
        for (int i = 0; i < pixelCount; i++)
            output[i] = palette[source[i]];
        return output;
    }

    private static Color[] DecodeIndexed4(TextureKey key, ReadOnlySpan<byte> source, byte[]? clut)
    {
        Color[] palette = DecodeLogicalPalette(clut, 16);
        Color[] output = new Color[key.Width * key.Height];
        int pixelIndex = 0;
        for (int i = 0; i < source.Length && pixelIndex < output.Length; i++)
        {
            byte packed = source[i];
            output[pixelIndex++] = palette[packed & 0x0F];
            if (pixelIndex < output.Length)
                output[pixelIndex++] = palette[(packed >> 4) & 0x0F];
        }
        return output;
    }

    private static Color[] DecodeLogicalPalette(byte[]? clut, int expectedEntries)
    {
        if (clut is null)
            return CreateSolidPixels(expectedEntries, 1, Color.White);

        int availableEntries = Math.Min(expectedEntries, clut.Length / 4);
        var logical = CreateSolidPixels(expectedEntries, 1, Color.Magenta);
        for (int i = 0; i < availableEntries; i++)
        {
            int offset = i * 4;
            logical[i] = new Color(
                clut[offset],
                clut[offset + 1],
                clut[offset + 2],
                Ps2AlphaToByte(clut[offset + 3]));
        }
        return logical;
    }

    private static byte Ps2AlphaToByte(byte value)
    {
        if (value == 0)
            return 0;
        int expanded = value * 2;
        return (byte)Math.Min(expanded, 255);
    }

    private static SamplerState CreateSamplerState(TextureKey key)
    {
        return new SamplerState
        {
            Filter = TextureFilter.Linear,
            AddressU = ToAddressMode(key.WrapModeS),
            AddressV = ToAddressMode(key.WrapModeT),
            AddressW = TextureAddressMode.Wrap,
            MaxMipLevel = 0,
            MipMapLevelOfDetailBias = 0f,
            MaxAnisotropy = 1
        };
    }

    private static TextureAddressMode ToAddressMode(byte wrapMode) =>
        wrapMode == 0 ? TextureAddressMode.Wrap : TextureAddressMode.Clamp;

    private static Texture2D CreateFallbackTexture(GraphicsDevice graphicsDevice, int width, int height, Color a, Color b)
    {
        var pixels = new Color[width * height];
        for (int y = 0; y < height; y++)
        {
            for (int x = 0; x < width; x++)
            {
                bool even = ((x / 4) + (y / 4)) % 2 == 0;
                pixels[y * width + x] = even ? a : b;
            }
        }

        var texture = new Texture2D(graphicsDevice, width, height, false, SurfaceFormat.Color);
        texture.SetData(pixels);
        return texture;
    }

    private static Color[] CreateSolidPixels(int width, int height, Color color)
    {
        var pixels = new Color[width * height];
        Array.Fill(pixels, color);
        return pixels;
    }

    private static VertexPositionColorTexture ToVertex(FieldRenderVertex source) =>
        ToVertex(source, RtaWorldCoordinates.Position(source.Position));

    private static VertexPositionColorTexture ToVertex(FieldRenderVertex source, Vector3 position)
    {
        NumVector3 c = source.DayColor;
        NumVector3 stq = source.TextureCoordinate;
        float q = Math.Abs(stq.Z) < 0.0001f ? 1f : stq.Z;
        return new VertexPositionColorTexture(
            position,
            new Color(ToByte(c.X), ToByte(c.Y), ToByte(c.Z)),
            new Vector2(stq.X / q, stq.Y / q));
    }

    private static VertexPositionColorTexture ToBillboardVertexData(FieldRenderVertex source, Vector3 position)
    {
        NumVector3 c = source.DayColor;
        NumVector3 stq = source.TextureCoordinate;
        float q = Math.Abs(stq.Z) < 0.0001f ? 1f : stq.Z;
        // HG2's VU1 programs consume source STQ directly. The ordinary MSCALF 8
        // path and billboard MSCALF 6 path therefore use the same S/Q,T/Q mapping;
        // OBJ-style UV flips are export-tool conventions, not part of the game.
        return new VertexPositionColorTexture(
            position,
            new Color(ToByte(c.X), ToByte(c.Y), ToByte(c.Z)),
            new Vector2(stq.X / q, stq.Y / q));
    }

    private static byte ToByte(float value) =>
        (byte)Math.Clamp((int)MathF.Round(value * (255f / 128f)), 0, 255);

    private sealed class StaticGroupBuilder
    {
        public List<VertexPositionColorTexture> Vertices { get; } = new();
        public HashSet<TriangleKey> Triangles { get; } = new();
    }

    private readonly record struct TriangleKey(RenderVertexKey A, RenderVertexKey B, RenderVertexKey C)
    {
        public static TriangleKey From(
            VertexPositionColorTexture a,
            VertexPositionColorTexture b,
            VertexPositionColorTexture c) =>
            new(RenderVertexKey.From(a), RenderVertexKey.From(b), RenderVertexKey.From(c));
    }

    private readonly record struct RenderVertexKey(
        int XMillimetres,
        int YMillimetres,
        int ZMillimetres,
        uint PackedColor,
        int U100K,
        int V100K)
    {
        public static RenderVertexKey From(VertexPositionColorTexture vertex) =>
            new(
                Quantize(vertex.Position.X, 1000f),
                Quantize(vertex.Position.Y, 1000f),
                Quantize(vertex.Position.Z, 1000f),
                vertex.Color.PackedValue,
                Quantize(vertex.TextureCoordinate.X, 100000f),
                Quantize(vertex.TextureCoordinate.Y, 100000f));

        private static int Quantize(float value, float scale) =>
            checked((int)MathF.Round(value * scale));
    }

    private sealed record SubMesh(
        StaticGroupKey Key,
        TextureResource Resource,
        VertexBuffer VertexBuffer,
        int TriangleCount,
        BoundingBox Bounds)
    {
        public bool UsesTransparency => Key.TextureEnabled && Resource.HasTransparency;
    }

    private sealed record BillboardBatch(
        BillboardGroupKey Key,
        TextureResource Resource,
        IReadOnlyList<FieldRenderPrimitive> Primitives,
        VertexPositionColorTexture[] Vertices,
        BoundingBox Bounds);

    private sealed record TextureResource(TextureKey Key, Texture2D Texture, SamplerState SamplerState, bool HasTransparency) : IDisposable
    {
        public void Dispose()
        {
            Texture.Dispose();
            SamplerState.Dispose();
        }
    }

    private readonly record struct StaticGroupKey(int ChunkIndex, TextureKey Texture, bool TextureEnabled);

    private readonly record struct BillboardGroupKey(int CellX, int CellZ, TextureKey Texture, bool TextureEnabled)
    {
        private const float CellExtent = RtaWorldCoordinates.FieldExtent / 8f;

        public static BillboardGroupKey FromPrimitive(FieldRenderPrimitive primitive, TextureKey texture)
        {
            if (primitive.PlacementOffset is not NumVector3 anchorNumerics)
                return new BillboardGroupKey(0, 0, texture, primitive.TextureMappingEnabled);
            Vector3 anchor = RtaWorldCoordinates.Position(anchorNumerics);
            int cellX = Math.Clamp((int)MathF.Floor(anchor.X / CellExtent), 0, 7);
            int cellZ = Math.Clamp((int)MathF.Floor(anchor.Z / CellExtent), 0, 7);
            return new BillboardGroupKey(cellX, cellZ, texture, primitive.TextureMappingEnabled);
        }
    }

    private readonly record struct TextureKey(GsTex0 Tex0, byte WrapModeS, byte WrapModeT)
    {
        public ushort TextureBasePointer => Tex0.TextureBasePointer;
        public ushort ClutBasePointer => Tex0.ClutBasePointer;
        public GsPixelStorageFormat PixelStorageFormat => Tex0.PixelStorageFormat;
        public int Width => Tex0.Width;
        public int Height => Tex0.Height;
        public bool Indexed => Tex0.PixelStorageFormat is GsPixelStorageFormat.PsmT8 or GsPixelStorageFormat.PsmT4;

        public static TextureKey FromMaterial(FieldMaterial material) =>
            new(material.Tex0, material.Clamp.WrapModeS, material.Clamp.WrapModeT);
    }
}

internal enum FieldRenderPhase
{
    Opaque,
    Alpha
}

internal sealed class FieldDrawStats
{
    public int CandidateBatches { get; set; }
    public int CulledBatches { get; set; }
    public int DrawCalls { get; set; }
    public int DrawnTriangles { get; set; }

    public void Add(FieldDrawStats other)
    {
        CandidateBatches += other.CandidateBatches;
        CulledBatches += other.CulledBatches;
        DrawCalls += other.DrawCalls;
        DrawnTriangles += other.DrawnTriangles;
    }
}
