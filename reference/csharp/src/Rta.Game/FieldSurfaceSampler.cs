using Rta.Formats;
using NumVector3 = System.Numerics.Vector3;

namespace Rta.Game;

/// <summary>
/// Lightweight vertical ray sampler over the already-decoded ordinary field mesh.
/// Besides height, it retains the active field texture/material so runtime systems
/// can distinguish authored dirt/grass/etc. from the separately reconstructed road
/// overlay.
/// </summary>
internal sealed class FieldSurfaceSampler
{
    private const float ChunkSize = 200f;
    private readonly Dictionary<(int X, int Z), List<SurfaceTriangle>> _trianglesByChunk = new();

    public FieldSurfaceSampler(IReadOnlyList<FieldRenderPrimitive> primitives)
    {
        foreach (FieldRenderPrimitive primitive in primitives)
        {
            // The first 64 chunks are the ordinary 8x8 spatial field. Excluding the
            // global chunk avoids signs/windows/billboards becoming projection targets.
            if (primitive.PlacementOffset is not null || primitive.ChunkIndex is < 0 or >= 64 || primitive.PrimitiveType != 4)
                continue;

            var key = (7 - primitive.ChunkX, primitive.ChunkZ);
            if (!_trianglesByChunk.TryGetValue(key, out List<SurfaceTriangle>? triangles))
            {
                triangles = new List<SurfaceTriangle>();
                _trianglesByChunk.Add(key, triangles);
            }

            ushort textureBasePointer = primitive.Material.Tex0.TextureBasePointer;
            for (int i = 0; i < primitive.Vertices.Count - 2; i++)
            {
                int a = (i & 1) == 0 ? i : i + 1;
                int b = (i & 1) == 0 ? i + 1 : i;
                int c = i + 2;
                NumVector3 sourceA = primitive.Vertices[a].Position;
                NumVector3 sourceB = primitive.Vertices[b].Position;
                NumVector3 sourceC = primitive.Vertices[c].Position;
                var worldA = RtaWorldCoordinates.Position(sourceA);
                var worldB = RtaWorldCoordinates.Position(sourceB);
                var worldC = RtaWorldCoordinates.Position(sourceC);
                NumVector3 va = new(worldA.X, worldA.Y, worldA.Z);
                NumVector3 vb = new(worldB.X, worldB.Y, worldB.Z);
                NumVector3 vc = new(worldC.X, worldC.Y, worldC.Z);
                triangles.Add(new SurfaceTriangle(va, vb, vc, textureBasePointer));
            }
        }
    }

    public bool TrySampleHighest(float x, float z, out float y) =>
        TrySampleHighest(x, z, out y, out _);

    public bool TrySampleHighest(float x, float z, out float y, out ushort textureBasePointer)
    {
        int chunkX = Math.Clamp((int)MathF.Floor(x / ChunkSize), 0, 7);
        int chunkZ = Math.Clamp((int)MathF.Floor(z / ChunkSize), 0, 7);
        bool found = false;
        float highest = float.NegativeInfinity;
        ushort bestTexture = 0;

        // Vertices on chunk seams may belong to either neighbouring chunk, so search
        // a one-chunk halo. This is tiny compared with testing the whole field mesh.
        for (int dz = -1; dz <= 1; dz++)
        {
            for (int dx = -1; dx <= 1; dx++)
            {
                if (!_trianglesByChunk.TryGetValue((chunkX + dx, chunkZ + dz), out List<SurfaceTriangle>? triangles))
                    continue;

                foreach (SurfaceTriangle triangle in triangles)
                {
                    if (!triangle.TrySampleY(x, z, out float candidateY))
                        continue;
                    if (!found || candidateY > highest)
                    {
                        highest = candidateY;
                        bestTexture = triangle.TextureBasePointer;
                        found = true;
                    }
                }
            }
        }

        y = found ? highest : 0f;
        textureBasePointer = bestTexture;
        return found;
    }

    public bool TrySampleClosest(float x, float z, float referenceY, out float y) =>
        TrySampleClosest(x, z, referenceY, out y, out _);

    public bool TrySampleClosest(float x, float z, float referenceY, out float y, out ushort textureBasePointer)
    {
        int chunkX = Math.Clamp((int)MathF.Floor(x / ChunkSize), 0, 7);
        int chunkZ = Math.Clamp((int)MathF.Floor(z / ChunkSize), 0, 7);
        bool found = false;
        float best = 0f;
        ushort bestTexture = 0;
        float bestDistance = float.PositiveInfinity;

        for (int dz = -1; dz <= 1; dz++)
        {
            for (int dx = -1; dx <= 1; dx++)
            {
                if (!_trianglesByChunk.TryGetValue((chunkX + dx, chunkZ + dz), out List<SurfaceTriangle>? triangles))
                    continue;

                foreach (SurfaceTriangle triangle in triangles)
                {
                    if (!triangle.TrySampleY(x, z, out float candidateY))
                        continue;
                    float distance = MathF.Abs(candidateY - referenceY);
                    if (!found || distance < bestDistance)
                    {
                        found = true;
                        best = candidateY;
                        bestTexture = triangle.TextureBasePointer;
                        bestDistance = distance;
                    }
                }
            }
        }

        y = found ? best : referenceY;
        textureBasePointer = bestTexture;
        return found;
    }

    private readonly record struct SurfaceTriangle(NumVector3 A, NumVector3 B, NumVector3 C, ushort TextureBasePointer)
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
