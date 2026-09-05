using Microsoft.Xna.Framework;
using Rta.Formats;
using NumVector3 = System.Numerics.Vector3;

namespace Rta.Game;

/// <summary>
/// Query structure over HG2's field collision surface. Peach Town's collision data
/// is entirely upward-facing, behaving like an allowed-driving surface rather than
/// a conventional collection of vertical wall triangles.
/// </summary>
internal sealed class FieldCollisionSampler
{
    private const float ChunkSize = 100f;
    private const int GridSize = 16;
    private readonly Dictionary<(int X, int Z), List<CollisionTriangle>> _trianglesByChunk = new();

    public FieldCollisionSampler(IReadOnlyList<FieldCollisionPrimitive> primitives)
    {
        foreach (FieldCollisionPrimitive primitive in primitives)
        {
            if (primitive.PrimitiveType != 4 || primitive.Vertices.Count < 3)
                continue;

            for (int i = 0; i < primitive.Vertices.Count - 2; i++)
            {
                int a = (i & 1) == 0 ? i : i + 1;
                int b = (i & 1) == 0 ? i + 1 : i;
                int c = i + 2;
                Vector3 va = RtaWorldCoordinates.Position(primitive.Vertices[a]);
                Vector3 vb = RtaWorldCoordinates.Position(primitive.Vertices[b]);
                Vector3 vc = RtaWorldCoordinates.Position(primitive.Vertices[c]);
                var triangle = new CollisionTriangle(
                    new NumVector3(va.X, va.Y, va.Z),
                    new NumVector3(vb.X, vb.Y, vb.Z),
                    new NumVector3(vc.X, vc.Y, vc.Z),
                    primitive.SurfaceFlags);
                Register(triangle);
            }
        }
    }

    public bool TrySampleClosest(float x, float z, float referenceY, out float y, out uint surfaceFlags)
    {
        int chunkX = Math.Clamp((int)MathF.Floor(x / ChunkSize), 0, GridSize - 1);
        int chunkZ = Math.Clamp((int)MathF.Floor(z / ChunkSize), 0, GridSize - 1);
        bool found = false;
        float bestY = referenceY;
        uint bestFlags = 0;
        float bestDistance = float.PositiveInfinity;

        for (int dz = -1; dz <= 1; dz++)
        {
            for (int dx = -1; dx <= 1; dx++)
            {
                if (!_trianglesByChunk.TryGetValue((chunkX + dx, chunkZ + dz), out List<CollisionTriangle>? triangles))
                    continue;

                foreach (CollisionTriangle triangle in triangles)
                {
                    if (!triangle.TrySampleY(x, z, out float candidateY))
                        continue;
                    float distance = MathF.Abs(candidateY - referenceY);
                    if (!found || distance < bestDistance)
                    {
                        found = true;
                        bestDistance = distance;
                        bestY = candidateY;
                        bestFlags = triangle.SurfaceFlags;
                    }
                }
            }
        }

        y = bestY;
        surfaceFlags = bestFlags;
        return found;
    }

    public bool IsFootprintSupported(Vector3 position, float yaw, float referenceY, out float averageY, out uint centreSurfaceFlags)
    {
        // Use approximately the wheel-contact footprint. This is deliberately close
        // to the four-point boundary-check behaviour suspected in the original game.
        ReadOnlySpan<Vector3> local =
        [
            new(-0.66f, 0f, 0.68f),
            new(0.66f, 0f, 0.68f),
            new(-0.66f, 0f, -0.66f),
            new(0.66f, 0f, -0.66f)
        ];

        Matrix rotation = Matrix.CreateRotationY(yaw);
        float sum = 0f;
        for (int i = 0; i < local.Length; i++)
        {
            Vector3 point = position + Vector3.Transform(local[i], rotation);
            if (!TrySampleClosest(point.X, point.Z, referenceY, out float y, out _))
            {
                averageY = referenceY;
                centreSurfaceFlags = 0;
                return false;
            }
            sum += y;
        }

        if (!TrySampleClosest(position.X, position.Z, referenceY, out _, out centreSurfaceFlags))
            centreSurfaceFlags = 0;

        averageY = sum / local.Length;
        return true;
    }

    private void Register(CollisionTriangle triangle)
    {
        float minX = MathF.Min(triangle.A.X, MathF.Min(triangle.B.X, triangle.C.X));
        float maxX = MathF.Max(triangle.A.X, MathF.Max(triangle.B.X, triangle.C.X));
        float minZ = MathF.Min(triangle.A.Z, MathF.Min(triangle.B.Z, triangle.C.Z));
        float maxZ = MathF.Max(triangle.A.Z, MathF.Max(triangle.B.Z, triangle.C.Z));
        int minChunkX = Math.Clamp((int)MathF.Floor(minX / ChunkSize), 0, GridSize - 1);
        int maxChunkX = Math.Clamp((int)MathF.Floor(maxX / ChunkSize), 0, GridSize - 1);
        int minChunkZ = Math.Clamp((int)MathF.Floor(minZ / ChunkSize), 0, GridSize - 1);
        int maxChunkZ = Math.Clamp((int)MathF.Floor(maxZ / ChunkSize), 0, GridSize - 1);

        for (int z = minChunkZ; z <= maxChunkZ; z++)
        {
            for (int x = minChunkX; x <= maxChunkX; x++)
            {
                if (!_trianglesByChunk.TryGetValue((x, z), out List<CollisionTriangle>? list))
                {
                    list = new List<CollisionTriangle>();
                    _trianglesByChunk.Add((x, z), list);
                }
                list.Add(triangle);
            }
        }
    }

    private readonly record struct CollisionTriangle(NumVector3 A, NumVector3 B, NumVector3 C, uint SurfaceFlags)
    {
        public bool TrySampleY(float x, float z, out float y)
        {
            float v0x = B.X - A.X;
            float v0z = B.Z - A.Z;
            float v1x = C.X - A.X;
            float v1z = C.Z - A.Z;
            float v2x = x - A.X;
            float v2z = z - A.Z;
            float determinant = v0x * v1z - v1x * v0z;
            if (MathF.Abs(determinant) < 0.00001f)
            {
                y = 0f;
                return false;
            }

            float u = (v2x * v1z - v1x * v2z) / determinant;
            float v = (v0x * v2z - v2x * v0z) / determinant;
            const float epsilon = 0.002f;
            if (u < -epsilon || v < -epsilon || u + v > 1f + epsilon)
            {
                y = 0f;
                return false;
            }

            y = A.Y + u * (B.Y - A.Y) + v * (C.Y - A.Y);
            return float.IsFinite(y);
        }
    }
}
