using Microsoft.Xna.Framework;
using Microsoft.Xna.Framework.Graphics;

namespace Rta.Game;

internal sealed class DebugGrid
{
    private readonly VertexPositionColor[] _vertices;

    public DebugGrid(int halfExtent = 20, float spacing = 5f)
    {
        var vertices = new List<VertexPositionColor>((halfExtent * 2 + 1) * 4 + 6);
        float extent = halfExtent * spacing;

        for (int i = -halfExtent; i <= halfExtent; i++)
        {
            float p = i * spacing;
            Color color = i == 0 ? Color.Gray : new Color(55, 55, 60);
            vertices.Add(new VertexPositionColor(new Vector3(-extent, 0, p), color));
            vertices.Add(new VertexPositionColor(new Vector3(extent, 0, p), color));
            vertices.Add(new VertexPositionColor(new Vector3(p, 0, -extent), color));
            vertices.Add(new VertexPositionColor(new Vector3(p, 0, extent), color));
        }

        vertices.Add(new VertexPositionColor(Vector3.Zero, Color.Red));
        vertices.Add(new VertexPositionColor(Vector3.Right * 15f, Color.Red));
        vertices.Add(new VertexPositionColor(Vector3.Zero, Color.Green));
        vertices.Add(new VertexPositionColor(Vector3.Up * 15f, Color.Green));
        vertices.Add(new VertexPositionColor(Vector3.Zero, Color.Blue));
        vertices.Add(new VertexPositionColor(Vector3.Forward * 15f, Color.Blue));
        _vertices = vertices.ToArray();
    }

    public void Draw(GraphicsDevice graphicsDevice, BasicEffect effect)
    {
        foreach (EffectPass pass in effect.CurrentTechnique.Passes)
        {
            pass.Apply();
            graphicsDevice.DrawUserPrimitives(PrimitiveType.LineList, _vertices, 0, _vertices.Length / 2);
        }
    }
}
