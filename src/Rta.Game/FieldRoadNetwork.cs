using Microsoft.Xna.Framework;
using Rta.Formats;
using NumVector3 = System.Numerics.Vector3;

namespace Rta.Game;

internal enum RoadSurfaceKind
{
    None,
    Paved,
    Dirt
}

internal sealed record FieldRoadRibbon(
    int Id,
    RoadSurfaceKind Surface,
    FieldMinimapPrimitive Source,
    IReadOnlyList<Vector3> ProjectedVertices,
    IReadOnlyList<Vector3> Centerline);

/// <summary>
/// Shared reconstruction of the world-space road ribbon stored in HG2's minimap
/// extra. The minimap says where roads exist; the ordinary field material underneath
/// tells us whether a ribbon is runtime-paved or an authored dirt track.
/// </summary>
internal sealed class FieldRoadNetwork
{
    private static readonly NumVector3 RoadMapColor = new(88f, 88f, 231f);
    private const ushort DirtTextureBasePointer = 14634;
    private const float SurfaceLift = 0.08f;
    private readonly List<FieldRoadRibbon> _ribbons = new();

    public FieldRoadNetwork(IReadOnlyList<FieldMinimapPrimitive> minimap, FieldSurfaceSampler surfaceSampler)
    {
        int unresolved = 0;
        foreach (FieldMinimapPrimitive primitive in minimap)
        {
            if (primitive.PrimitiveType != 4 || primitive.Vertices.Count < 3 || !IsRoadPrimitive(primitive))
                continue;

            var projected = new Vector3[primitive.Vertices.Count];
            for (int i = 0; i < primitive.Vertices.Count; i++)
            {
                Vector3 worldSource = RtaWorldCoordinates.Position(primitive.Vertices[i].Position);
                if (!surfaceSampler.TrySampleHighest(worldSource.X, worldSource.Z, out float y))
                {
                    unresolved++;
                    y = 31f;
                }
                projected[i] = new Vector3(worldSource.X, y + SurfaceLift, worldSource.Z);
            }

            var centers = new List<Vector3>(primitive.Vertices.Count / 2);
            var underlay = new Dictionary<ushort, int>();
            for (int pair = 0; pair < primitive.Vertices.Count / 2; pair++)
            {
                Vector3 a = projected[pair * 2];
                Vector3 b = projected[Math.Min(pair * 2 + 1, projected.Length - 1)];
                Vector3 center = (a + b) * 0.5f;
                centers.Add(center);
                if (surfaceSampler.TrySampleHighest(center.X, center.Z, out _, out ushort texture))
                    underlay[texture] = underlay.GetValueOrDefault(texture) + 1;
            }

            int dirtSamples = underlay.GetValueOrDefault(DirtTextureBasePointer);
            RoadSurfaceKind kind = dirtSamples > centers.Count / 2 ? RoadSurfaceKind.Dirt : RoadSurfaceKind.Paved;
            _ribbons.Add(new FieldRoadRibbon(_ribbons.Count, kind, primitive, projected, centers));
        }

        UnresolvedVertexCount = unresolved;
    }

    public IReadOnlyList<FieldRoadRibbon> Ribbons => _ribbons;
    public int UnresolvedVertexCount { get; }
    public int PavedRibbonCount => _ribbons.Count(ribbon => ribbon.Surface == RoadSurfaceKind.Paved);
    public int DirtRibbonCount => _ribbons.Count(ribbon => ribbon.Surface == RoadSurfaceKind.Dirt);

    public RoadSurfaceKind GetRoadSurface(float x, float z)
    {
        // Only thirty road ribbons exist in Peach Town, so a direct triangle walk is
        // cheap and keeps this first implementation transparent and easy to validate.
        foreach (FieldRoadRibbon ribbon in _ribbons)
        {
            IReadOnlyList<Vector3> vertices = ribbon.ProjectedVertices;
            for (int i = 0; i < vertices.Count - 2; i++)
            {
                int a = (i & 1) == 0 ? i : i + 1;
                int b = (i & 1) == 0 ? i + 1 : i;
                int c = i + 2;
                if (ContainsXZ(vertices[a], vertices[b], vertices[c], x, z))
                    return ribbon.Surface;
            }
        }
        return RoadSurfaceKind.None;
    }

    private static bool ContainsXZ(Vector3 a, Vector3 b, Vector3 c, float x, float z)
    {
        float v0x = b.X - a.X;
        float v0z = b.Z - a.Z;
        float v1x = c.X - a.X;
        float v1z = c.Z - a.Z;
        float v2x = x - a.X;
        float v2z = z - a.Z;
        float determinant = v0x * v1z - v1x * v0z;
        if (MathF.Abs(determinant) < 0.00001f)
            return false;
        float u = (v2x * v1z - v1x * v2z) / determinant;
        float v = (v0x * v2z - v2x * v0z) / determinant;
        const float epsilon = 0.01f;
        return u >= -epsilon && v >= -epsilon && u + v <= 1f + epsilon;
    }

    private static bool IsRoadPrimitive(FieldMinimapPrimitive primitive)
    {
        foreach (FieldMinimapVertex vertex in primitive.Vertices)
        {
            if (MathF.Abs(vertex.Color.X - RoadMapColor.X) > 0.01f ||
                MathF.Abs(vertex.Color.Y - RoadMapColor.Y) > 0.01f ||
                MathF.Abs(vertex.Color.Z - RoadMapColor.Z) > 0.01f)
                return false;
        }
        return true;
    }
}
