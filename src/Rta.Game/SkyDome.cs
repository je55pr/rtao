using Microsoft.Xna.Framework;
using Microsoft.Xna.Framework.Graphics;
using Rta.Formats;

namespace Rta.Game;

/// <summary>
/// Camera-centred upper-hemisphere renderer for HG2's shared SORA panorama. The
/// texture's white lower edge is authored as the horizon; U wraps around the world
/// while V clamps at the zenith/horizon.
/// </summary>
internal sealed class SkyDome : IDisposable
{
    private const int AzimuthSegments = 64;
    private const int ElevationSegments = 12;
    private const float Radius = 8_000f;
    private const float LowerElevation = -0.10f;

    private readonly BasicEffect _effect;
    private readonly Texture2D _dayTexture;
    private readonly VertexPositionTexture[] _vertices;
    private readonly short[] _indices;
    private readonly SamplerState _sampler;

    public SkyDome(GraphicsDevice graphicsDevice, Hg2SkyTextureSet textures)
    {
        _dayTexture = new Texture2D(
            graphicsDevice,
            textures.DayPanorama.Width,
            textures.DayPanorama.Height,
            false,
            SurfaceFormat.Color);
        _dayTexture.SetData(textures.DayPanorama.RgbaPixels);

        _effect = new BasicEffect(graphicsDevice)
        {
            TextureEnabled = true,
            VertexColorEnabled = false,
            LightingEnabled = false,
            Texture = _dayTexture
        };
        _sampler = new SamplerState
        {
            Filter = TextureFilter.Linear,
            AddressU = TextureAddressMode.Wrap,
            AddressV = TextureAddressMode.Clamp
        };

        (_vertices, _indices) = BuildHemisphere();
    }

    public void Draw(GraphicsDevice graphicsDevice, Matrix view, Matrix projection, Vector3 cameraPosition)
    {
        DepthStencilState previousDepth = graphicsDevice.DepthStencilState;
        BlendState previousBlend = graphicsDevice.BlendState;
        RasterizerState previousRasterizer = graphicsDevice.RasterizerState;
        SamplerState previousSampler = graphicsDevice.SamplerStates[0];

        try
        {
            graphicsDevice.DepthStencilState = DepthStencilState.None;
            graphicsDevice.BlendState = BlendState.Opaque;
            graphicsDevice.RasterizerState = RasterizerState.CullNone;
            graphicsDevice.SamplerStates[0] = _sampler;

            _effect.World = Matrix.CreateTranslation(cameraPosition);
            _effect.View = view;
            _effect.Projection = projection;
            _effect.Texture = _dayTexture;

            foreach (EffectPass pass in _effect.CurrentTechnique.Passes)
            {
                pass.Apply();
                graphicsDevice.DrawUserIndexedPrimitives(
                    PrimitiveType.TriangleList,
                    _vertices,
                    0,
                    _vertices.Length,
                    _indices,
                    0,
                    _indices.Length / 3);
            }
        }
        finally
        {
            graphicsDevice.SamplerStates[0] = previousSampler;
            graphicsDevice.RasterizerState = previousRasterizer;
            graphicsDevice.BlendState = previousBlend;
            graphicsDevice.DepthStencilState = previousDepth;
        }
    }

    public void Dispose()
    {
        _sampler.Dispose();
        _effect.Dispose();
        _dayTexture.Dispose();
    }

    private static (VertexPositionTexture[] Vertices, short[] Indices) BuildHemisphere()
    {
        int stride = AzimuthSegments + 1;
        var vertices = new VertexPositionTexture[(ElevationSegments + 1) * stride];
        int vertexIndex = 0;
        for (int elevationIndex = 0; elevationIndex <= ElevationSegments; elevationIndex++)
        {
            float t = elevationIndex / (float)ElevationSegments;
            float elevation = MathHelper.Lerp(LowerElevation, MathHelper.PiOver2, t);
            float horizontal = MathF.Cos(elevation) * Radius;
            float y = MathF.Sin(elevation) * Radius;
            float v = elevation <= 0f
                ? 1f
                : 1f - elevation / MathHelper.PiOver2;

            for (int azimuthIndex = 0; azimuthIndex <= AzimuthSegments; azimuthIndex++)
            {
                float u = azimuthIndex / (float)AzimuthSegments;
                float azimuth = u * MathHelper.TwoPi;
                // Match the runtime's reflected X handedness while keeping the file's
                // left-to-right panorama orientation stable around world north.
                float x = -MathF.Sin(azimuth) * horizontal;
                float z = -MathF.Cos(azimuth) * horizontal;
                vertices[vertexIndex++] = new VertexPositionTexture(new Vector3(x, y, z), new Vector2(u, v));
            }
        }

        var indices = new short[ElevationSegments * AzimuthSegments * 6];
        int index = 0;
        for (int elevation = 0; elevation < ElevationSegments; elevation++)
        {
            for (int azimuth = 0; azimuth < AzimuthSegments; azimuth++)
            {
                short a = checked((short)(elevation * stride + azimuth));
                short b = checked((short)(a + 1));
                short c = checked((short)(a + stride));
                short d = checked((short)(c + 1));
                indices[index++] = a;
                indices[index++] = c;
                indices[index++] = b;
                indices[index++] = b;
                indices[index++] = c;
                indices[index++] = d;
            }
        }
        return (vertices, indices);
    }
}
