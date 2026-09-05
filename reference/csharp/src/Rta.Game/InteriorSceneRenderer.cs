using Microsoft.Xna.Framework;
using Microsoft.Xna.Framework.Graphics;

namespace Rta.Game;

/// <summary>
/// Runtime compositor for HG2 SHOP interiors. Q's Factory is the first reconstructed
/// layout. Geometry, camera and presentation positions below come from SLES_513.56;
/// the SHOP package supplies the indexed material/scenery atlas.
/// </summary>
internal sealed class InteriorSceneRenderer : IDisposable
{
    public const int AuthoredWidth = 640;
    public const int AuthoredHeight = 384;

    private static readonly Rectangle FloorSource = new(512, 320, 64, 64);
    private static readonly Rectangle PlatformUnderlaySource = new(576, 256, 64, 64);
    private static readonly Rectangle PlatformRingSource = new(576, 320, 64, 64);
    private const int SceneryCutoutHeight = 224;

    // SLES_513.56 0x2A4630. The packed angle vector is converted by vitof4 before
    // multiplication by pi/2048, so the actual angles are 23.90625 and -41.484375
    // degrees (not the earlier 22.5/+56.25 interpretation).
    private static readonly Vector3 ShopCameraOffset = new(2.2f, 1.1f, -45f);
    private const float ShopCameraX = 23.90625f * MathF.PI / 180f;
    private const float ShopCameraY = -41.484375f * MathF.PI / 180f;
    private const float ShopFocalLength = 3564f;
    private const float ShopHorizontalScale = 0.80f;
    private const float ShopVerticalScale = 0.53f;

    // SLES_513.56 0x2A4650 / 0x2A4690 / 0x2A46D0.
    private static readonly Vector3 FloorCorner = new(-10f, 0f, 10f);
    private static readonly Vector3 FloorExtent = new(20f, 0f, -20f);
    private static readonly Vector3 PlatformUnderlayCorner = new(-1.875f, 0.01f, 1.875f);
    private static readonly Vector3 PlatformRingCorner = new(-1.875f, 0.02f, 1.875f);
    private static readonly Vector3 PlatformExtent = new(3.75f, 0f, -3.75f);
    private static readonly Vector3 ChangePartsPlatformPosition = new(1.2f, 0f, 5.2f);

    // Entry placement table 0x2A47C0.
    private static readonly Vector3 EntryPlayerPosition = new(9.06f, 0f, 1.47f);
    private static readonly Vector3 StaffPosition = new(-1.75f, 0f, 2.10f);
    private const float StaffYaw = 112.5f * MathF.PI / 180f;

    // Route 0, evaluated from the executable's entry speed/yaw state, terminates
    // almost exactly on the Change Parts platform. Preserve the authored endpoint
    // rather than snapping the body to the platform descriptor's nominal centre.
    private static readonly Vector3 ChangePartsPlayerPosition = new(1.195234f, 0f, 5.203379f);
    private const float ChangePartsPlayerYaw = 87f * MathF.PI / 32768f;

    private readonly GraphicsDevice _graphicsDevice;
    private readonly Texture2D _sceneryTexture;
    private readonly Texture2D _floorTexture;
    private readonly Texture2D _platformUnderlayTexture;
    private readonly Texture2D _platformRingTexture;
    private readonly BasicEffect _effect;
    private readonly VertexBuffer _floorBuffer;
    private readonly VertexBuffer _platformUnderlayBuffer;
    private readonly VertexBuffer _platformRingBuffer;
    private readonly RenderTarget2D _sceneTarget;
    private readonly SpriteBatch _spriteBatch;

    public InteriorSceneRenderer(GraphicsDevice graphicsDevice, int atlasWidth, int atlasHeight, ReadOnlySpan<byte> rgbaPixels)
    {
        if (atlasWidth != AuthoredWidth || atlasHeight != AuthoredHeight)
            throw new ArgumentException($"Q's Factory atlas must be {AuthoredWidth}x{AuthoredHeight}; got {atlasWidth}x{atlasHeight}.");
        if (rgbaPixels.Length < checked(atlasWidth * atlasHeight * 4))
            throw new ArgumentException("Interior atlas RGBA buffer is truncated.", nameof(rgbaPixels));

        _graphicsDevice = graphicsDevice;
        _sceneTarget = new RenderTarget2D(
            graphicsDevice,
            AuthoredWidth,
            AuthoredHeight,
            false,
            SurfaceFormat.Color,
            DepthFormat.Depth24,
            0,
            RenderTargetUsage.DiscardContents);
        _spriteBatch = new SpriteBatch(graphicsDevice);
        _sceneryTexture = CreateSceneryTexture(graphicsDevice, atlasWidth, atlasHeight, rgbaPixels);
        _floorTexture = CreateCropTexture(graphicsDevice, atlasWidth, rgbaPixels, FloorSource);
        _platformUnderlayTexture = CreateCropTexture(graphicsDevice, atlasWidth, rgbaPixels, PlatformUnderlaySource);
        _platformRingTexture = CreateCropTexture(graphicsDevice, atlasWidth, rgbaPixels, PlatformRingSource);

        _floorBuffer = CreatePlaneBuffer(
            graphicsDevice,
            FloorCorner,
            FloorExtent,
            new Vector2(0.6f, 0.6f),
            new Vector2(16.6f, 16.6f));
        _platformUnderlayBuffer = CreatePlaneBuffer(graphicsDevice, PlatformUnderlayCorner, PlatformExtent, Vector2.Zero, Vector2.One);
        _platformRingBuffer = CreatePlaneBuffer(graphicsDevice, PlatformRingCorner, PlatformExtent, Vector2.Zero, Vector2.One);

        _effect = new BasicEffect(graphicsDevice)
        {
            LightingEnabled = false,
            TextureEnabled = true,
            VertexColorEnabled = true,
            World = Matrix.Identity,
            View = BuildShopView(),
            Projection = BuildShopProjection()
        };
    }

    public Texture2D Render(CarDebugMesh? staffCar, CarDebugMesh? playerCar, WheelDebugMesh? wheels, bool changeParts)
    {
        RenderTargetBinding[] previousTargets = _graphicsDevice.GetRenderTargets();
        Viewport previousViewport = _graphicsDevice.Viewport;
        BlendState previousBlend = _graphicsDevice.BlendState;
        DepthStencilState previousDepth = _graphicsDevice.DepthStencilState;
        RasterizerState previousRasterizer = _graphicsDevice.RasterizerState;

        try
        {
            _graphicsDevice.SetRenderTarget(_sceneTarget);
            _graphicsDevice.Viewport = new Viewport(0, 0, AuthoredWidth, AuthoredHeight);
            _graphicsDevice.Clear(new Color(214, 225, 206));
            _graphicsDevice.BlendState = BlendState.NonPremultiplied;
            _graphicsDevice.DepthStencilState = DepthStencilState.Default;
            _graphicsDevice.RasterizerState = RasterizerState.CullNone;

            DrawPlane(_floorBuffer, _floorTexture, FloorSampler, Matrix.Identity);
            if (changeParts)
                DrawChangePartsPlatform();

            DrawScenery();

            _graphicsDevice.BlendState = BlendState.NonPremultiplied;
            _graphicsDevice.DepthStencilState = DepthStencilState.Default;
            _graphicsDevice.RasterizerState = RasterizerState.CullNone;

            Matrix staffWorld = Matrix.CreateRotationY(StaffYaw) * Matrix.CreateTranslation(StaffPosition);
            staffCar?.Draw(_graphicsDevice, _effect, staffWorld);
            wheels?.Draw(_graphicsDevice, _effect, staffWorld, 0f, 0f);

            Matrix playerWorld = changeParts
                ? Matrix.CreateRotationY(ChangePartsPlayerYaw) * Matrix.CreateTranslation(ChangePartsPlayerPosition)
                : Matrix.CreateTranslation(EntryPlayerPosition);
            playerCar?.Draw(_graphicsDevice, _effect, playerWorld);
            wheels?.Draw(_graphicsDevice, _effect, playerWorld, 0f, 0f);
        }
        finally
        {
            if (previousTargets.Length == 0)
                _graphicsDevice.SetRenderTarget(null);
            else
                _graphicsDevice.SetRenderTargets(previousTargets);
            _graphicsDevice.Viewport = previousViewport;
            _graphicsDevice.BlendState = previousBlend;
            _graphicsDevice.DepthStencilState = previousDepth;
            _graphicsDevice.RasterizerState = previousRasterizer;
        }

        return _sceneTarget;
    }

    public void Dispose()
    {
        _floorBuffer.Dispose();
        _platformUnderlayBuffer.Dispose();
        _platformRingBuffer.Dispose();
        _effect.Dispose();
        _floorTexture.Dispose();
        _platformUnderlayTexture.Dispose();
        _platformRingTexture.Dispose();
        _sceneryTexture.Dispose();
        _sceneTarget.Dispose();
        _spriteBatch.Dispose();
    }

    private void DrawChangePartsPlatform()
    {
        // The underlay is the rotating inner panel. A zero presentation angle is a
        // valid settled sample and keeps this deterministic until state byte 0x26 is
        // driven by the host Change Parts UI. The yellow ring itself does not rotate.
        Matrix translation = Matrix.CreateTranslation(ChangePartsPlatformPosition);
        DrawPlane(_platformUnderlayBuffer, _platformUnderlayTexture, PlatformSampler, translation);
        DrawPlane(_platformRingBuffer, _platformRingTexture, PlatformSampler, translation);
    }

    private void DrawPlane(VertexBuffer buffer, Texture2D texture, SamplerState sampler, Matrix world)
    {
        _effect.Texture = texture;
        _effect.World = world;
        _effect.TextureEnabled = true;
        _effect.VertexColorEnabled = true;
        _graphicsDevice.SamplerStates[0] = sampler;
        _graphicsDevice.SetVertexBuffer(buffer);
        foreach (EffectPass pass in _effect.CurrentTechnique.Passes)
        {
            pass.Apply();
            _graphicsDevice.DrawPrimitives(PrimitiveType.TriangleList, 0, 2);
        }
    }

    private void DrawScenery()
    {
        // The upper portion of the SHOP atlas is a pre-rendered cutout in the fixed
        // shop projection. Transparent holes reveal the runtime floor underneath.
        _spriteBatch.Begin(
            SpriteSortMode.Deferred,
            BlendState.NonPremultiplied,
            SamplerState.LinearClamp,
            DepthStencilState.None,
            RasterizerState.CullNone);
        _spriteBatch.Draw(_sceneryTexture, new Rectangle(0, 0, AuthoredWidth, AuthoredHeight), Color.White);
        _spriteBatch.End();
    }

    private static Matrix BuildShopView()
    {
        Matrix cameraRotation =
            Matrix.CreateRotationX(ShopCameraX) *
            Matrix.CreateRotationY(ShopCameraY);
        Vector3 cameraPosition = Vector3.Transform(ShopCameraOffset, cameraRotation);

        Matrix cameraWorld = cameraRotation;
        cameraWorld.Translation = cameraPosition;

        // HG2 performs a rigid inverse and then flips its screen-Y column for the GS.
        // MonoGame's viewport already maps positive NDC Y upward to framebuffer Y
        // downward, so reproducing that final GS flip here would apply it twice.
        return Matrix.Invert(cameraWorld);
    }

    private static Matrix BuildShopProjection()
    {
        // SLES_513.56 builds its ViewScreen matrix from scrz=3564 with independent
        // PAL X/Y factors 0.80 and 0.53. Express the same pixel focal lengths as NDC
        // scales for the authored 640x384 render target.
        const float near = 3f;
        const float far = 65536f;
        float sx = (ShopFocalLength * ShopHorizontalScale) / (AuthoredWidth * 0.5f);
        float sy = (ShopFocalLength * ShopVerticalScale) / (AuthoredHeight * 0.5f);
        return new Matrix(
            sx, 0f, 0f, 0f,
            0f, sy, 0f, 0f,
            0f, 0f, far / (far - near), 1f,
            0f, 0f, -(near * far) / (far - near), 0f);
    }

    private static VertexBuffer CreatePlaneBuffer(
        GraphicsDevice graphicsDevice,
        Vector3 corner,
        Vector3 extent,
        Vector2 uv0,
        Vector2 uv1)
    {
        Vector3 xCorner = corner + new Vector3(extent.X, extent.Y, 0f);
        Vector3 zCorner = corner + new Vector3(0f, 0f, extent.Z);
        Vector3 opposite = corner + extent;
        VertexPositionColorTexture[] vertices =
        [
            new(corner, Color.White, new Vector2(uv0.X, uv0.Y)),
            new(xCorner, Color.White, new Vector2(uv1.X, uv0.Y)),
            new(zCorner, Color.White, new Vector2(uv0.X, uv1.Y)),
            new(xCorner, Color.White, new Vector2(uv1.X, uv0.Y)),
            new(opposite, Color.White, new Vector2(uv1.X, uv1.Y)),
            new(zCorner, Color.White, new Vector2(uv0.X, uv1.Y))
        ];
        var buffer = new VertexBuffer(
            graphicsDevice,
            VertexPositionColorTexture.VertexDeclaration,
            vertices.Length,
            BufferUsage.WriteOnly);
        buffer.SetData(vertices);
        return buffer;
    }

    private static Texture2D CreateSceneryTexture(GraphicsDevice graphicsDevice, int width, int height, ReadOnlySpan<byte> rgba)
    {
        var colors = new Color[checked(width * height)];
        for (int y = 0; y < height; y++)
        {
            for (int x = 0; x < width; x++)
            {
                int pixel = y * width + x;
                int o = pixel * 4;
                byte a = y < SceneryCutoutHeight ? rgba[o + 3] : (byte)0;
                colors[pixel] = new Color(rgba[o], rgba[o + 1], rgba[o + 2], a);
            }
        }
        var texture = new Texture2D(graphicsDevice, width, height, false, SurfaceFormat.Color);
        texture.SetData(colors);
        return texture;
    }

    private static Texture2D CreateCropTexture(GraphicsDevice graphicsDevice, int atlasWidth, ReadOnlySpan<byte> rgba, Rectangle source)
    {
        var colors = new Color[checked(source.Width * source.Height)];
        for (int y = 0; y < source.Height; y++)
        {
            for (int x = 0; x < source.Width; x++)
            {
                int srcPixel = (source.Y + y) * atlasWidth + source.X + x;
                int o = srcPixel * 4;
                colors[y * source.Width + x] = new Color(rgba[o], rgba[o + 1], rgba[o + 2], rgba[o + 3]);
            }
        }
        var texture = new Texture2D(graphicsDevice, source.Width, source.Height, false, SurfaceFormat.Color);
        texture.SetData(colors);
        return texture;
    }

    private static readonly SamplerState FloorSampler = new()
    {
        Filter = TextureFilter.Linear,
        AddressU = TextureAddressMode.Wrap,
        AddressV = TextureAddressMode.Wrap,
        AddressW = TextureAddressMode.Wrap,
        MaxMipLevel = 0,
        MaxAnisotropy = 1
    };

    private static readonly SamplerState PlatformSampler = new()
    {
        Filter = TextureFilter.Linear,
        AddressU = TextureAddressMode.Clamp,
        AddressV = TextureAddressMode.Clamp,
        AddressW = TextureAddressMode.Clamp,
        MaxMipLevel = 0,
        MaxAnisotropy = 1
    };
}
