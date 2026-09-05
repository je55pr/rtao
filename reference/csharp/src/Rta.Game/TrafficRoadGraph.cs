using Microsoft.Xna.Framework;

namespace Rta.Game;

internal sealed record TrafficRoadNode(int Id, Vector3 Position, IReadOnlyList<int> Neighbours);

/// <summary>
/// Provisional traffic navigation graph derived from the exact road centerlines in
/// Peach Town's minimap mesh. This deliberately stays separate from the executable
/// AiPath table until the latter can be mapped to fields with confidence.
/// </summary>
internal sealed class TrafficRoadGraph
{
    private const float JoinDistance = 16f;
    private readonly TrafficRoadNode[] _nodes;
    private readonly int[] _largestComponent;

    public TrafficRoadGraph(FieldRoadNetwork roadNetwork)
    {
        var positions = new List<Vector3>();
        var neighbours = new List<HashSet<int>>();
        var ribbonNodeIds = new List<(FieldRoadRibbon Ribbon, int[] Nodes)>();

        foreach (FieldRoadRibbon ribbon in roadNetwork.Ribbons.Where(ribbon => ribbon.Surface == RoadSurfaceKind.Paved && ribbon.Centerline.Count >= 2))
        {
            int[] ids = new int[ribbon.Centerline.Count];
            for (int i = 0; i < ribbon.Centerline.Count; i++)
            {
                ids[i] = positions.Count;
                positions.Add(ribbon.Centerline[i]);
                neighbours.Add(new HashSet<int>());
                if (i > 0)
                    Connect(neighbours, ids[i - 1], ids[i]);
            }
            ribbonNodeIds.Add((ribbon, ids));
        }

        // HG2's minimap breaks junctions into lots of small strips. Join endpoints to
        // nearby points in other strips so those pieces become one navigable graph.
        for (int r = 0; r < ribbonNodeIds.Count; r++)
        {
            int[] ids = ribbonNodeIds[r].Nodes;
            foreach (int endpoint in new[] { ids[0], ids[^1] })
            {
                Vector3 p = positions[endpoint];
                for (int otherRibbon = 0; otherRibbon < ribbonNodeIds.Count; otherRibbon++)
                {
                    if (otherRibbon == r)
                        continue;
                    foreach (int candidate in ribbonNodeIds[otherRibbon].Nodes)
                    {
                        Vector3 q = positions[candidate];
                        float dx = q.X - p.X;
                        float dz = q.Z - p.Z;
                        float distance = MathF.Sqrt(dx * dx + dz * dz);
                        if (distance <= JoinDistance)
                            Connect(neighbours, endpoint, candidate);
                    }
                }
            }
        }

        _nodes = positions.Select((position, id) => new TrafficRoadNode(id, position, neighbours[id].Order().ToArray())).ToArray();
        _largestComponent = FindLargestComponent(_nodes);
    }

    public IReadOnlyList<TrafficRoadNode> Nodes => _nodes;
    public IReadOnlyList<int> LargestComponent => _largestComponent;
    public int EdgeCount => _nodes.Sum(node => node.Neighbours.Count) / 2;

    public int PickSpawnNode(int index, int count)
    {
        if (_largestComponent.Length == 0)
            return -1;
        int offset = (int)MathF.Floor(index * _largestComponent.Length / (float)Math.Max(1, count));
        for (int attempt = 0; attempt < _largestComponent.Length; attempt++)
        {
            int id = _largestComponent[(offset + attempt) % _largestComponent.Length];
            if (_nodes[id].Neighbours.Count > 0)
                return id;
        }
        return _largestComponent[0];
    }

    private static void Connect(List<HashSet<int>> neighbours, int a, int b)
    {
        if (a == b)
            return;
        neighbours[a].Add(b);
        neighbours[b].Add(a);
    }

    private static int[] FindLargestComponent(IReadOnlyList<TrafficRoadNode> nodes)
    {
        var visited = new bool[nodes.Count];
        int[] best = Array.Empty<int>();
        for (int start = 0; start < nodes.Count; start++)
        {
            if (visited[start])
                continue;
            var component = new List<int>();
            var queue = new Queue<int>();
            queue.Enqueue(start);
            visited[start] = true;
            while (queue.Count > 0)
            {
                int id = queue.Dequeue();
                component.Add(id);
                foreach (int next in nodes[id].Neighbours)
                {
                    if (visited[next])
                        continue;
                    visited[next] = true;
                    queue.Enqueue(next);
                }
            }
            if (component.Count > best.Length)
                best = component.ToArray();
        }
        return best;
    }
}
