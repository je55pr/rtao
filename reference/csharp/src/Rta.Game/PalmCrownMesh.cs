using Microsoft.Xna.Framework;
using Microsoft.Xna.Framework.Graphics;
using Rta.Formats;
using NumVector3 = System.Numerics.Vector3;

namespace Rta.Game;

/// <summary>
/// Runtime renderer for HG2's dynamic coastal palm crowns. The source asset is the
/// six-frond MSCALF-4 object stored in field Extra[1]; placement comes from the six
/// authored trunk-top markers in the ordinary field mesh. A small phase-shifted sway
/// keeps the dynamic path distinct from static terrain while preserving the original
/// radial frond geometry rather than fabricating replacement foliage.
/// </summary>
internal sealed class PalmCrownMesh : IDisposable
{
    private readonly IReadOnlyList<GroupMesh> _groups;
    private readonly IReadOnlyList<Vector3> _anchors;
    private readonly Texture2D _texture;
    private readonly SamplerState _sampler;
    private readonly float _radius;

    public PalmCrownMesh(
        GraphicsDevice graphicsDevice,
        FieldPalmCrownAsset asset,
        IReadOnlyList<NumVector3> sourceAnchors,
        FieldMaterial material,
        GsLocalMemory gsMemory)
    {
        ArgumentNullException.ThrowIfNull(graphicsDevice);
        ArgumentNullException.ThrowIfNull(asset);
        ArgumentNullException.ThrowIfNull(sourceAnchors);
        ArgumentNullException.ThrowIfNull(gsMemory);

        _anchors = sourceAnchors.Select(RtaWorldCoordinates.Position).ToArray();
        _groups = asset.FrondGroups.Select(group => CreateGroup(graphicsDevice, group)).ToArray();
        _radius = _groups.Count == 0 ? 0f : _groups.Max(group => group.Radius);
        _texture = CreateIndexed8Texture(graphicsDevice, gsMemory, material.Tex0);
        _sampler = new SamplerState
        {
            Filter = TextureFilter.Linear,
            AddressU = ToAddressMode(material.Clamp.WrapModeS),
            AddressV = ToAddressMode(material.Clamp.WrapModeT),
            AddressW = TextureAddressMode.Clamp,
            MaxMipLevel = 0,
            MaxAnisotropy = 1
        };
    }

    public int InstanceCount => _anchors.Count;
    public int PrimitiveCount => _groups.Sum(group => group.TriangleCount);
    public int MaximumDrawCallCount => _anchors.Count * _groups.Count;

    public FieldDrawStats Draw(
        GraphicsDevice graphicsDevice,
        AlphaTestEffect effect,
        Matrix sectorWorld,
        BoundingFrustum? frustum,
        float timeSeconds)
    {
        var stats = new FieldDrawStats();
        if (_anchors.Count == 0 || _groups.Count == 0)
            return stats;

        Matrix previousWorld = effect.World;
        Texture2D? previousTexture = effect.Texture;
        graphicsDevice.SamplerStates[0] = _sampler;
        effect.Texture = _texture;

        try
        {
            for (int instanceIndex = 0; instanceIndex < _anchors.Count; instanceIndex++)
            {
                Vector3 anchor = _anchors[instanceIndex];
                Vector3 worldAnchor = anchor + sectorWorld.Translation;
                float phase = instanceIndex * 0.73f + anchor.X * 0.011f + anchor.Z * 0.007f;

                stats.CandidateBatches += _groups.Count;
                if (frustum is not null && frustum.Contains(new BoundingSphere(worldAnchor, MathF.Max(4f, _radius + 1f))) == ContainmentType.Disjoint)
                {
                    stats.CulledBatches += _groups.Count;
                    continue;
                }

                for (int groupIndex = 0; groupIndex < _groups.Count; groupIndex++)
                {
                    GroupMesh group = _groups[groupIndex];

                    // The source object is split into 1/2/3-frond groups rather than
                    // one static six-frond mesh. Treat that split as authored dynamic
                    // grouping: all fronds share the wind cycle but each group trails
                    // by a small phase, producing the gentle back-and-forth motion seen
                    // in the PAL reference footage without deforming the source quads.
                    float groupPhase = phase + groupIndex * 0.42f;
                    float sway = MathF.Sin(timeSeconds * 1.45f + groupPhase);
                    float crossSway = MathF.Sin(timeSeconds * 1.07f + groupPhase + 1.1f);
                    Matrix wind =
                        Matrix.CreateRotationZ(sway * 0.045f) *
                        Matrix.CreateRotationX(crossSway * 0.022f);
                    effect.World = wind * Matrix.CreateTranslation(anchor) * sectorWorld;
                    graphicsDevice.SetVertexBuffer(group.VertexBuffer);
                    foreach (EffectPass pass in effect.CurrentTechnique.Passes)
                    {
                        pass.Apply();
                        graphicsDevice.DrawPrimitives(PrimitiveType.TriangleList, 0, group.TriangleCount);
                        stats.DrawCalls++;
                    }
                    stats.DrawnTriangles += group.TriangleCount;
                }
            }
        }
        finally
        {
            effect.World = previousWorld;
            effect.Texture = previousTexture;
        }

        return stats;
    }

    public void Dispose()
    {
        foreach (GroupMesh group in _groups)
            group.VertexBuffer.Dispose();
        _texture.Dispose();
        _sampler.Dispose();
    }

    private static GroupMesh CreateGroup(GraphicsDevice graphicsDevice, IReadOnlyList<CarRenderPrimitive> primitives)
    {
        var vertices = new List<VertexPositionColorTexture>();
        float radiusSquared = 0f;

        foreach (CarRenderPrimitive primitive in primitives)
        {
            if (primitive.PrimitiveType != 4 || primitive.Vertices.Count < 3)
                continue;

            for (int i = 0; i < primitive.Vertices.Count - 2; i++)
            {
                int a = (i & 1) == 0 ? i : i + 1;
                int b = (i & 1) == 0 ? i + 1 : i;
                int c = i + 2;
                Append(vertices, primitive.Vertices[a], ref radiusSquared);
                Append(vertices, primitive.Vertices[b], ref radiusSquared);
                Append(vertices, primitive.Vertices[c], ref radiusSquared);
            }
        }

        var vertexBuffer = new VertexBuffer(
            graphicsDevice,
            VertexPositionColorTexture.VertexDeclaration,
            vertices.Count,
            BufferUsage.WriteOnly);
        vertexBuffer.SetData(vertices.ToArray());
        return new GroupMesh(vertexBuffer, vertices.Count / 3, MathF.Sqrt(radiusSquared));
    }

    private static void Append(List<VertexPositionColorTexture> output, CarRenderVertex source, ref float radiusSquared)
    {
        // Dynamic object coordinates are local vectors, so apply the same field-X
        // handedness reflection used by ordinary field geometry before translating
        // the crown to its authored trunk-top marker.
        Vector3 position = RtaWorldCoordinates.LocalVector(source.Position);
        radiusSquared = MathF.Max(radiusSquared, position.LengthSquared());
        output.Add(new VertexPositionColorTexture(
            position,
            Color.White,
            new Vector2(source.TextureCoordinate.X, source.TextureCoordinate.Y)));
    }

    private static Texture2D CreateIndexed8Texture(GraphicsDevice graphicsDevice, GsLocalMemory gsMemory, GsTex0 tex0)
    {
        if (tex0.PixelStorageFormat != GsPixelStorageFormat.PsmT8)
            throw new InvalidDataException($"Palm crown expected PSMT8, got {tex0.PixelStorageFormat}.");

        byte[] image = gsMemory.ReadTexture(tex0);
        byte[] clut = gsMemory.ReadCsm1Clut(tex0);
        var pixels = new Color[tex0.Width * tex0.Height];
        int count = Math.Min(pixels.Length, image.Length);
        for (int i = 0; i < count; i++)
        {
            int paletteOffset = image[i] * 4;
            if (paletteOffset + 3 >= clut.Length)
            {
                pixels[i] = Color.Magenta;
                continue;
            }
            pixels[i] = new Color(
                clut[paletteOffset],
                clut[paletteOffset + 1],
                clut[paletteOffset + 2],
                Ps2AlphaToByte(clut[paletteOffset + 3]));
        }

        var texture = new Texture2D(graphicsDevice, tex0.Width, tex0.Height, false, SurfaceFormat.Color);
        texture.SetData(pixels);
        return texture;
    }

    private static byte Ps2AlphaToByte(byte value) =>
        value == 0 ? (byte)0 : (byte)Math.Min(255, value * 2);

    private static TextureAddressMode ToAddressMode(byte wrapMode) =>
        wrapMode == 0 ? TextureAddressMode.Wrap : TextureAddressMode.Clamp;

    private sealed record GroupMesh(VertexBuffer VertexBuffer, int TriangleCount, float Radius);
}
