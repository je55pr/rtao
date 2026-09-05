using Microsoft.Xna.Framework;
using Microsoft.Xna.Framework.Graphics;
using Rta.Formats;
using NumVector3 = System.Numerics.Vector3;

namespace Rta.Game;

/// <summary>
/// Runtime wheel renderer reconstructed from CARS/TIRE.BIN. HG2 stores individual
/// steering front wheels, a paired rear-wheel mesh, and a complete four-wheel distant
/// LOD. The latter conveniently preserves the authored wheel centres used here.
/// </summary>
internal sealed class WheelDebugMesh : IDisposable
{
    private static readonly Vector3 FrontLeftCenter = new(-0.741544f, 0.330000f, 0.680000f);
    private static readonly Vector3 FrontRightCenter = new(0.741544f, 0.330000f, 0.680000f);
    private static readonly Vector3 RearLeftCenter = new(-0.724481f, 0.380000f, -0.660000f);
    private static readonly Vector3 RearRightCenter = new(0.724481f, 0.380000f, -0.660000f);
    private const float RearSourceCenterX = 0.7229365f;

    private readonly WheelPart _frontLeft;
    private readonly WheelPart _frontRight;
    private readonly WheelPart _rearLeft;
    private readonly WheelPart _rearRight;
    private readonly Texture2D _texture;

    public WheelDebugMesh(
        GraphicsDevice graphicsDevice,
        IReadOnlyList<CarRenderPrimitive> frontLeft,
        IReadOnlyList<CarRenderPrimitive> frontRight,
        IReadOnlyList<CarRenderPrimitive> rearPair,
        IReadOnlyDictionary<ushort, FieldTextureUpload> uploads)
    {
        _frontLeft = new WheelPart(graphicsDevice, frontLeft, NumVector3.Zero);
        _frontRight = new WheelPart(graphicsDevice, frontRight, NumVector3.Zero);

        IReadOnlyList<CarRenderPrimitive> rearLeft = rearPair
            .Where(p => p.Vertices.Average(v => v.Position.X) < 0f)
            .ToArray();
        IReadOnlyList<CarRenderPrimitive> rearRight = rearPair
            .Where(p => p.Vertices.Average(v => v.Position.X) >= 0f)
            .ToArray();
        _rearLeft = new WheelPart(graphicsDevice, rearLeft, new NumVector3(-RearSourceCenterX, 0f, 0f));
        _rearRight = new WheelPart(graphicsDevice, rearRight, new NumVector3(RearSourceCenterX, 0f, 0f));

        _texture = CreateTireTexture(graphicsDevice, uploads);
    }

    public int TriangleCount =>
        _frontLeft.TriangleCount + _frontRight.TriangleCount +
        _rearLeft.TriangleCount + _rearRight.TriangleCount;
    public int DrawCallCount =>
        _frontLeft.DrawCallCount + _frontRight.DrawCallCount +
        _rearLeft.DrawCallCount + _rearRight.DrawCallCount;

    public void Draw(GraphicsDevice graphicsDevice, BasicEffect effect, Matrix carWorld, float steeringAngle, float spinAngle)
    {
        Matrix frontSpin = Matrix.CreateRotationX(spinAngle);
        Matrix rearSpin = Matrix.CreateRotationX(spinAngle);
        Matrix steering = Matrix.CreateRotationY(steeringAngle);

        DrawPart(_frontLeft, FrontLeftCenter, frontSpin * steering, graphicsDevice, effect, carWorld);
        DrawPart(_frontRight, FrontRightCenter, frontSpin * steering, graphicsDevice, effect, carWorld);
        DrawPart(_rearLeft, RearLeftCenter, rearSpin, graphicsDevice, effect, carWorld);
        DrawPart(_rearRight, RearRightCenter, rearSpin, graphicsDevice, effect, carWorld);
    }

    public void Dispose()
    {
        _frontLeft.Dispose();
        _frontRight.Dispose();
        _rearLeft.Dispose();
        _rearRight.Dispose();
        _texture.Dispose();
    }

    private void DrawPart(
        WheelPart part,
        Vector3 center,
        Matrix localRotation,
        GraphicsDevice graphicsDevice,
        BasicEffect effect,
        Matrix carWorld)
    {
        Matrix world = localRotation * Matrix.CreateTranslation(center) * carWorld;
        part.Draw(graphicsDevice, effect, world, _texture);
    }

    private static Texture2D CreateTireTexture(GraphicsDevice graphicsDevice, IReadOnlyDictionary<ushort, FieldTextureUpload> uploads)
    {
        FieldTextureUpload? image = uploads.Values.FirstOrDefault(upload => upload.DestinationPixelStorageFormat == GsPixelStorageFormat.PsmT4);
        FieldTextureUpload? clut = uploads.Values.FirstOrDefault(upload => upload.DestinationPixelStorageFormat == GsPixelStorageFormat.PsmCt16);
        if (image is null || clut is null)
            return CreateFallbackTexture(graphicsDevice);

        Color[] palette = DecodePsmCt16Csm1Palette(clut);
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

    private static Color[] DecodePsmCt16Csm1Palette(FieldTextureUpload clut)
    {
        int physicalCount = clut.Data.Length / 2;
        var physical = new Color[physicalCount];
        for (int i = 0; i < physicalCount; i++)
        {
            ushort packed = (ushort)(clut.Data[i * 2] | (clut.Data[i * 2 + 1] << 8));
            byte r = Expand5(packed & 0x1F);
            byte g = Expand5((packed >> 5) & 0x1F);
            byte b = Expand5((packed >> 10) & 0x1F);

            // HG2's wheel atlas uses vivid pure green as the transparent surround;
            // the greyscale wheel-face entries themselves have no useful alpha bit.
            byte a = g > 240 && r < 20 && b < 20 ? (byte)0 : (byte)255;
            physical[i] = new Color(r, g, b, a);
        }

        var logical = new Color[16];
        for (int i = 0; i < logical.Length; i++)
        {
            int physicalIndex = (i & ~0x18) | ((i & 0x08) << 1) | ((i & 0x10) >> 1);
            logical[i] = physicalIndex < physical.Length ? physical[physicalIndex] : Color.Magenta;
        }
        return logical;
    }

    private static byte Expand5(int value) => (byte)((value << 3) | (value >> 2));

    private static Texture2D CreateFallbackTexture(GraphicsDevice graphicsDevice)
    {
        var texture = new Texture2D(graphicsDevice, 1, 1, false, SurfaceFormat.Color);
        texture.SetData(new[] { Color.Magenta });
        return texture;
    }

    private sealed class WheelPart : IDisposable
    {
        private readonly VertexBuffer? _solidBuffer;
        private readonly VertexBuffer? _texturedBuffer;
        private readonly int _solidTriangles;
        private readonly int _texturedTriangles;

        public WheelPart(GraphicsDevice graphicsDevice, IReadOnlyList<CarRenderPrimitive> primitives, NumVector3 sourceCenter)
        {
            var solid = new List<VertexPositionColor>();
            var textured = new List<VertexPositionColorTexture>();

            foreach (CarRenderPrimitive primitive in primitives)
            {
                if (primitive.PrimitiveType != 4 || primitive.Vertices.Count < 3)
                    continue;

                for (int i = 0; i < primitive.Vertices.Count - 2; i++)
                {
                    int a = (i & 1) == 0 ? i : i + 1;
                    int b = (i & 1) == 0 ? i + 1 : i;
                    int c = i + 2;
                    if (primitive.UsesTexture)
                    {
                        textured.Add(ToTextured(primitive.Vertices[a], sourceCenter));
                        textured.Add(ToTextured(primitive.Vertices[b], sourceCenter));
                        textured.Add(ToTextured(primitive.Vertices[c], sourceCenter));
                    }
                    else
                    {
                        solid.Add(ToSolid(primitive.Vertices[a], sourceCenter));
                        solid.Add(ToSolid(primitive.Vertices[b], sourceCenter));
                        solid.Add(ToSolid(primitive.Vertices[c], sourceCenter));
                    }
                }
            }

            if (solid.Count > 0)
            {
                _solidBuffer = new VertexBuffer(graphicsDevice, VertexPositionColor.VertexDeclaration, solid.Count, BufferUsage.WriteOnly);
                _solidBuffer.SetData(solid.ToArray());
                _solidTriangles = solid.Count / 3;
            }

            if (textured.Count > 0)
            {
                _texturedBuffer = new VertexBuffer(graphicsDevice, VertexPositionColorTexture.VertexDeclaration, textured.Count, BufferUsage.WriteOnly);
                _texturedBuffer.SetData(textured.ToArray());
                _texturedTriangles = textured.Count / 3;
            }
        }

        public int TriangleCount => _solidTriangles + _texturedTriangles;
        public int DrawCallCount => (_solidBuffer is not null && _solidTriangles > 0 ? 1 : 0) +
                                    (_texturedBuffer is not null && _texturedTriangles > 0 ? 1 : 0);

        public void Draw(GraphicsDevice graphicsDevice, BasicEffect effect, Matrix world, Texture2D texture)
        {
            Matrix oldWorld = effect.World;
            bool oldTexture = effect.TextureEnabled;
            bool oldVertexColor = effect.VertexColorEnabled;
            effect.World = world;
            effect.VertexColorEnabled = true;

            if (_solidBuffer is not null && _solidTriangles > 0)
            {
                effect.TextureEnabled = false;
                graphicsDevice.SetVertexBuffer(_solidBuffer);
                foreach (EffectPass pass in effect.CurrentTechnique.Passes)
                {
                    pass.Apply();
                    graphicsDevice.DrawPrimitives(PrimitiveType.TriangleList, 0, _solidTriangles);
                }
            }

            if (_texturedBuffer is not null && _texturedTriangles > 0)
            {
                effect.TextureEnabled = true;
                effect.Texture = texture;
                graphicsDevice.SamplerStates[0] = WheelSampler;
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
        }

        public void Dispose()
        {
            _solidBuffer?.Dispose();
            _texturedBuffer?.Dispose();
        }

        private static VertexPositionColor ToSolid(CarRenderVertex vertex, NumVector3 center)
        {
            NumVector3 p = vertex.Position - center;
            return new VertexPositionColor(
                new Vector3(p.X, p.Y, p.Z),
                new Color(ToByte(vertex.Color.X), ToByte(vertex.Color.Y), ToByte(vertex.Color.Z)));
        }

        private static VertexPositionColorTexture ToTextured(CarRenderVertex vertex, NumVector3 center)
        {
            NumVector3 p = vertex.Position - center;
            return new VertexPositionColorTexture(
                new Vector3(p.X, p.Y, p.Z),
                Color.White,
                new Vector2(vertex.TextureCoordinate.X, vertex.TextureCoordinate.Y));
        }

        private static byte ToByte(float value) => (byte)Math.Clamp((int)MathF.Round(value), 0, 255);
    }

    private static readonly SamplerState WheelSampler = new()
    {
        Filter = TextureFilter.Linear,
        AddressU = TextureAddressMode.Clamp,
        AddressV = TextureAddressMode.Clamp,
        AddressW = TextureAddressMode.Clamp,
        MaxMipLevel = 0,
        MaxAnisotropy = 1
    };
}
