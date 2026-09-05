using Microsoft.Xna.Framework;
using Microsoft.Xna.Framework.Graphics;
using Rta.Formats;
using NumVector3 = System.Numerics.Vector3;

namespace Rta.Game;

/// <summary>
/// First in-engine HG2 car renderer. It intentionally renders only the high-detail
/// primary body mesh; wheels and the separate light/brake overlays remain runtime
/// pieces to be added next.
/// </summary>
internal sealed class CarDebugMesh : IDisposable
{
    private readonly DynamicVertexBuffer? _solidBuffer;
    private readonly DynamicVertexBuffer? _texturedBuffer;
    private readonly SolidSourceVertex[] _solidVertices;
    private readonly TexturedSourceVertex[] _texturedVertices;
    private readonly VertexPositionColor[] _solidDrawVertices;
    private readonly VertexPositionColorTexture[] _texturedDrawVertices;
    private readonly Texture2D? _texture;
    private readonly int _solidTriangles;
    private readonly int _texturedTriangles;
    private readonly Color _primaryPaint;
    private readonly Color _secondaryPaint;
    private readonly float _localRadiusXZ;

    public CarDebugMesh(
        GraphicsDevice graphicsDevice,
        IReadOnlyList<CarRenderPrimitive> primitives,
        IReadOnlyDictionary<ushort, FieldTextureUpload> uploads,
        Color? primaryPaint = null,
        Color? secondaryPaint = null)
    {
        _primaryPaint = primaryPaint ?? new Color(238, 151, 179);
        _secondaryPaint = secondaryPaint ?? new Color(226, 129, 165);
        var solid = new List<SolidSourceVertex>();
        var textured = new List<TexturedSourceVertex>();
        float radiusSquared = 0f;

        foreach (CarRenderPrimitive primitive in primitives)
        {
            if (primitive.PrimitiveType != 4 || primitive.Vertices.Count < 3)
                continue;

            foreach (CarRenderVertex vertex in primitive.Vertices)
                radiusSquared = MathF.Max(radiusSquared, vertex.Position.X * vertex.Position.X + vertex.Position.Z * vertex.Position.Z);

            for (int i = 0; i < primitive.Vertices.Count - 2; i++)
            {
                int a = (i & 1) == 0 ? i : i + 1;
                int b = (i & 1) == 0 ? i + 1 : i;
                int c = i + 2;
                if (primitive.UsesTexture)
                {
                    textured.Add(ToTexturedSource(primitive.Vertices[a], primitive.ColorSelection));
                    textured.Add(ToTexturedSource(primitive.Vertices[b], primitive.ColorSelection));
                    textured.Add(ToTexturedSource(primitive.Vertices[c], primitive.ColorSelection));
                }
                else
                {
                    solid.Add(ToSolidSource(primitive.Vertices[a], primitive.ColorSelection));
                    solid.Add(ToSolidSource(primitive.Vertices[b], primitive.ColorSelection));
                    solid.Add(ToSolidSource(primitive.Vertices[c], primitive.ColorSelection));
                }
            }
        }

        _solidVertices = solid.ToArray();
        _texturedVertices = textured.ToArray();
        _solidDrawVertices = new VertexPositionColor[_solidVertices.Length];
        _texturedDrawVertices = new VertexPositionColorTexture[_texturedVertices.Length];

        if (solid.Count > 0)
        {
            _solidBuffer = new DynamicVertexBuffer(graphicsDevice, VertexPositionColor.VertexDeclaration, solid.Count, BufferUsage.WriteOnly);
            _solidTriangles = solid.Count / 3;
        }

        if (textured.Count > 0)
        {
            _texturedBuffer = new DynamicVertexBuffer(graphicsDevice, VertexPositionColorTexture.VertexDeclaration, textured.Count, BufferUsage.WriteOnly);
            _texturedTriangles = textured.Count / 3;
            _texture = CreateCarTexture(graphicsDevice, uploads);
        }

        _localRadiusXZ = MathF.Sqrt(radiusSquared);
    }

    public int TriangleCount => _solidTriangles + _texturedTriangles;
    public int DrawCallCount => (_solidBuffer is not null && _solidTriangles > 0 ? 1 : 0) +
                                (_texturedBuffer is not null && _texturedTriangles > 0 ? 1 : 0);
    public float LocalRadiusXZ => _localRadiusXZ;

    public void Draw(GraphicsDevice graphicsDevice, BasicEffect effect, Matrix world)
    {
        Matrix oldWorld = effect.World;
        bool oldTexture = effect.TextureEnabled;
        bool oldVertexColor = effect.VertexColorEnabled;
        Texture2D? oldTextureResource = effect.Texture;
        SamplerState oldSampler = graphicsDevice.SamplerStates[0];
        effect.World = world;
        effect.VertexColorEnabled = true;
        Hg2CarLighting lighting = CreateDaylightLighting(world, effect.View);

        if (_solidBuffer is not null && _solidTriangles > 0)
        {
            for (int i = 0; i < _solidVertices.Length; i++)
            {
                SolidSourceVertex source = _solidVertices[i];
                _solidDrawVertices[i] = new VertexPositionColor(
                    source.Position,
                    Shade(source.Normal, source.Color, source.SurfaceParameter, source.ColorSelection, lighting));
            }
            _solidBuffer.SetData(_solidDrawVertices, 0, _solidDrawVertices.Length, SetDataOptions.Discard);
            effect.TextureEnabled = false;
            graphicsDevice.SetVertexBuffer(_solidBuffer);
            foreach (EffectPass pass in effect.CurrentTechnique.Passes)
            {
                pass.Apply();
                graphicsDevice.DrawPrimitives(PrimitiveType.TriangleList, 0, _solidTriangles);
            }
        }

        if (_texturedBuffer is not null && _texture is not null && _texturedTriangles > 0)
        {
            for (int i = 0; i < _texturedVertices.Length; i++)
            {
                TexturedSourceVertex source = _texturedVertices[i];
                _texturedDrawVertices[i] = new VertexPositionColorTexture(
                    source.Position,
                    Shade(source.Normal, source.Color, source.SurfaceParameter, source.ColorSelection, lighting),
                    source.TextureCoordinate);
            }
            _texturedBuffer.SetData(_texturedDrawVertices, 0, _texturedDrawVertices.Length, SetDataOptions.Discard);
            effect.TextureEnabled = true;
            effect.Texture = _texture;
            graphicsDevice.SamplerStates[0] = CarSampler;
            graphicsDevice.SetVertexBuffer(_texturedBuffer);
            foreach (EffectPass pass in effect.CurrentTechnique.Passes)
            {
                pass.Apply();
                graphicsDevice.DrawPrimitives(PrimitiveType.TriangleList, 0, _texturedTriangles);
            }
        }

        effect.World = oldWorld;
        effect.TextureEnabled = oldTexture;
        effect.VertexColorEnabled = oldVertexColor;
        effect.Texture = oldTextureResource;
        graphicsDevice.SamplerStates[0] = oldSampler;
    }

    public void Dispose()
    {
        _solidBuffer?.Dispose();
        _texturedBuffer?.Dispose();
        _texture?.Dispose();
    }

    private static readonly SamplerState CarSampler = new()
    {
        Filter = TextureFilter.Linear,
        AddressU = TextureAddressMode.Clamp,
        AddressV = TextureAddressMode.Clamp,
        AddressW = TextureAddressMode.Clamp,
        MaxMipLevel = 0,
        MaxAnisotropy = 1
    };

    private static SolidSourceVertex ToSolidSource(CarRenderVertex vertex, byte colorSelection) => new(
        ToXna(vertex.Position),
        vertex.Normal,
        vertex.Color,
        vertex.SurfaceParameter,
        colorSelection);

    private static TexturedSourceVertex ToTexturedSource(CarRenderVertex vertex, byte colorSelection) => new(
        ToXna(vertex.Position),
        vertex.Normal,
        vertex.Color,
        vertex.SurfaceParameter,
        colorSelection,
        new Vector2(vertex.TextureCoordinate.X, 1f - vertex.TextureCoordinate.Y));

    private Color Shade(NumVector3 normal, NumVector3 authoredColor, float surfaceParameter, byte colorSelection, in Hg2CarLighting lighting)
    {
        var primary = new NumVector3(_primaryPaint.R / 255f, _primaryPaint.G / 255f, _primaryPaint.B / 255f);
        var secondary = new NumVector3(_secondaryPaint.R / 255f, _secondaryPaint.G / 255f, _secondaryPaint.B / 255f);
        NumVector3 paintFactor = Hg2CarShading.SelectPaintFactor(colorSelection, primary, secondary);
        NumVector3 shaded = Hg2CarShading.Shade(normal, authoredColor, paintFactor, surfaceParameter, lighting);
        return new Color(ToByte(shaded.X), ToByte(shaded.Y), ToByte(shaded.Z), (byte)255);
    }

    private static Hg2CarLighting CreateDaylightLighting(Matrix world, Matrix view)
    {
        // The original's shared normal block is not the view matrix. Its first two
        // columns are fixed diffuse directions and 0x227128 updates column three to
        // normalize(primaryLight - cameraForward), the Blinn half-vector. This port
        // reflects source X once to match RtaWorldCoordinates' renderer handedness.
        NumVector3 primary = ReflectSourceX(Hg2CarShading.PalPrimaryLightDirection);
        NumVector3 secondary = ReflectSourceX(Hg2CarShading.PalSecondaryLightDirection);
        Matrix cameraWorld = Matrix.Invert(view);
        NumVector3 cameraForward = ToNumerics(cameraWorld.Forward);
        if (cameraForward.LengthSquared() > 0.000001f)
            cameraForward = NumVector3.Normalize(cameraForward);
        else
            cameraForward = NumVector3.UnitZ;
        NumVector3 halfVector = primary - cameraForward;
        if (halfVector.LengthSquared() > 0.000001f)
            halfVector = NumVector3.Normalize(halfVector);
        else
            halfVector = NumVector3.UnitZ;

        var lightBasis = new Matrix(
            primary.X, secondary.X, halfVector.X, 0f,
            primary.Y, secondary.Y, halfVector.Y, 0f,
            primary.Z, secondary.Z, halfVector.Z, 0f,
            0f, 0f, 0f, 1f);
        Matrix normalMatrix = world * lightBasis;
        return Hg2CarShading.CreatePalDaylight(
            new NumVector3(normalMatrix.M11, normalMatrix.M12, normalMatrix.M13),
            new NumVector3(normalMatrix.M21, normalMatrix.M22, normalMatrix.M23),
            new NumVector3(normalMatrix.M31, normalMatrix.M32, normalMatrix.M33));
    }

    private static NumVector3 ReflectSourceX(NumVector3 value) => new(-value.X, value.Y, value.Z);
    private static NumVector3 ToNumerics(Vector3 value) => new(value.X, value.Y, value.Z);

    private static Texture2D CreateCarTexture(GraphicsDevice graphicsDevice, IReadOnlyDictionary<ushort, FieldTextureUpload> uploads)
    {
        FieldTextureUpload? image = uploads.Values.FirstOrDefault(upload => upload.DestinationPixelStorageFormat == GsPixelStorageFormat.PsmT8);
        FieldTextureUpload? clut = uploads.Values.FirstOrDefault(upload => upload.DestinationPixelStorageFormat == GsPixelStorageFormat.PsmCt32);
        if (image is null || clut is null)
            return CreateFallbackTexture(graphicsDevice);

        Color[] palette = DecodePsmT8Palette(clut);
        var pixels = new Color[image.Width * image.Height];
        int count = Math.Min(pixels.Length, image.Data.Length);
        for (int i = 0; i < count; i++)
            pixels[i] = palette[image.Data[i]];

        var texture = new Texture2D(graphicsDevice, image.Width, image.Height, false, SurfaceFormat.Color);
        texture.SetData(pixels);
        return texture;
    }

    private static Color[] DecodePsmT8Palette(FieldTextureUpload clut)
    {
        int physicalCount = clut.Data.Length / 4;
        var physical = new Color[physicalCount];
        for (int i = 0; i < physicalCount; i++)
        {
            int offset = i * 4;
            byte alpha = clut.Data[offset + 3] == 0 ? (byte)0 : (byte)Math.Min(255, clut.Data[offset + 3] * 2);
            physical[i] = new Color(clut.Data[offset], clut.Data[offset + 1], clut.Data[offset + 2], alpha);
        }

        var logical = new Color[256];
        for (int i = 0; i < logical.Length; i++)
        {
            int physicalIndex = (i & ~0x18) | ((i & 0x08) << 1) | ((i & 0x10) >> 1);
            logical[i] = physicalIndex < physical.Length ? physical[physicalIndex] : Color.Magenta;
        }
        return logical;
    }

    private static Texture2D CreateFallbackTexture(GraphicsDevice graphicsDevice)
    {
        var texture = new Texture2D(graphicsDevice, 1, 1, false, SurfaceFormat.Color);
        texture.SetData(new[] { Color.Magenta });
        return texture;
    }

    private static Vector3 ToXna(NumVector3 value) => new(value.X, value.Y, value.Z);
    private static byte ToByte(float value) => (byte)Math.Clamp((int)MathF.Round(value), 0, 255);

    private readonly record struct SolidSourceVertex(
        Vector3 Position,
        NumVector3 Normal,
        NumVector3 Color,
        float SurfaceParameter,
        byte ColorSelection);

    private readonly record struct TexturedSourceVertex(
        Vector3 Position,
        NumVector3 Normal,
        NumVector3 Color,
        float SurfaceParameter,
        byte ColorSelection,
        Vector2 TextureCoordinate);
}
