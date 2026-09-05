using Microsoft.Xna.Framework;
using Microsoft.Xna.Framework.Graphics;
using Rta.Formats;
using NumVector3 = System.Numerics.Vector3;

namespace Rta.Game;

internal sealed class FieldDebugMesh : IDisposable
{
    private readonly VertexPositionColor[] _vertices;
    private VertexBuffer? _vertexBuffer;

    public FieldDebugMesh(IReadOnlyList<FieldRenderPrimitive> primitives)
    {
        var vertices = new List<VertexPositionColor>(primitives.Sum(EstimateTriangleListVertices));

        foreach (FieldRenderPrimitive primitive in primitives)
        {
            if (primitive.PrimitiveType != 4 || primitive.Vertices.Count < 3)
                continue;

            for (int i = 0; i < primitive.Vertices.Count - 2; i++)
            {
                // PS2 PRIM=4 is TRIANGLE_STRIP. Flip odd triangles so the converted
                // triangle list preserves the strip's original winding.
                int a = (i & 1) == 0 ? i : i + 1;
                int b = (i & 1) == 0 ? i + 1 : i;
                int c = i + 2;
                vertices.Add(ToVertex(primitive.Vertices[a]));
                vertices.Add(ToVertex(primitive.Vertices[b]));
                vertices.Add(ToVertex(primitive.Vertices[c]));
            }
        }

        _vertices = vertices.ToArray();
    }

    public int VertexCount => _vertices.Length;
    public int TriangleCount => _vertices.Length / 3;

    public void Load(GraphicsDevice graphicsDevice)
    {
        _vertexBuffer?.Dispose();
        _vertexBuffer = new VertexBuffer(
            graphicsDevice,
            VertexPositionColor.VertexDeclaration,
            _vertices.Length,
            BufferUsage.WriteOnly);
        _vertexBuffer.SetData(_vertices);
    }

    public void Draw(GraphicsDevice graphicsDevice, BasicEffect effect)
    {
        if (_vertexBuffer is null || TriangleCount == 0)
            return;

        graphicsDevice.SetVertexBuffer(_vertexBuffer);
        foreach (EffectPass pass in effect.CurrentTechnique.Passes)
        {
            pass.Apply();
            graphicsDevice.DrawPrimitives(PrimitiveType.TriangleList, 0, TriangleCount);
        }
    }

    public void Dispose() => _vertexBuffer?.Dispose();

    private static int EstimateTriangleListVertices(FieldRenderPrimitive primitive) =>
        primitive.PrimitiveType == 4 ? Math.Max(0, primitive.Vertices.Count - 2) * 3 : 0;

    private static VertexPositionColor ToVertex(FieldRenderVertex source)
    {
        NumVector3 p = source.Position;
        NumVector3 c = source.DayColor;
        return new VertexPositionColor(
            new Vector3(p.X, p.Y, p.Z),
            new Color(ToByte(c.X), ToByte(c.Y), ToByte(c.Z)));
    }

    private static byte ToByte(float value) => (byte)Math.Clamp((int)MathF.Round(value), 0, 255);
}
