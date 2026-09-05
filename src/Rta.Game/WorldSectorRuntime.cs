using Microsoft.Xna.Framework;
using Microsoft.Xna.Framework.Graphics;
using Rta.Disc;
using Rta.Formats;

namespace Rta.Game;

/// <summary>One permanently resident ordinary outdoor FLD sector.</summary>
internal sealed class WorldSectorRuntime : IDisposable
{
    private WorldSectorRuntime(
        int fieldNumber,
        FieldHeader header,
        FieldChunkDirectory meshChunks,
        FieldChunkDirectory collisionChunks,
        FieldSurfaceSampler surface,
        FieldCollisionSampler collision,
        FieldRoadNetwork roads,
        FieldTexturedMesh mesh,
        FieldRoadMesh? roadMesh,
        PalmCrownMesh? palmCrowns,
        int renderPrimitiveCount,
        int collisionPrimitiveCount)
    {
        FieldNumber = fieldNumber;
        Address = WorldSectorTopology.FromFieldNumber(fieldNumber);
        Header = header;
        MeshChunks = meshChunks;
        CollisionChunks = collisionChunks;
        Surface = surface;
        Collision = collision;
        Roads = roads;
        Mesh = mesh;
        RoadMesh = roadMesh;
        PalmCrowns = palmCrowns;
        RenderPrimitiveCount = renderPrimitiveCount;
        CollisionPrimitiveCount = collisionPrimitiveCount;
    }

    public int FieldNumber { get; }
    public WorldSectorTopology.SectorAddress Address { get; }
    public FieldHeader Header { get; }
    public FieldChunkDirectory MeshChunks { get; }
    public FieldChunkDirectory CollisionChunks { get; }
    public FieldSurfaceSampler Surface { get; }
    public FieldCollisionSampler Collision { get; }
    public FieldRoadNetwork Roads { get; }
    public FieldTexturedMesh Mesh { get; }
    public FieldRoadMesh? RoadMesh { get; }
    public PalmCrownMesh? PalmCrowns { get; }
    public int RenderPrimitiveCount { get; }
    public int CollisionPrimitiveCount { get; }

    public static WorldSectorRuntime Load(GraphicsDevice graphicsDevice, IGameDisc disc, int fieldNumber)
    {
        string path = $"FLD/{fieldNumber:D3}.BIN";
        using Stream field = disc.OpenFile(path);
        FieldHeader header = FieldFile.ReadHeader(field);
        FieldChunkDirectory meshChunks = FieldChunkDirectory.ReadRenderMeshes(field, header);
        FieldChunkDirectory collisionChunks = FieldChunkDirectory.ReadCollision(field, header);
        IReadOnlyList<FieldRenderPrimitive> primitives = FieldRenderPrimitiveReader.ReadAllPrimitives(field, header, meshChunks);
        IReadOnlyList<FieldTextureUpload> uploadSequence = FieldTextureUploadReader.ReadUploadSequence(field, header);
        var gsMemory = new GsLocalMemory();
        gsMemory.Replay(uploadSequence);
        IReadOnlyList<FieldMinimapPrimitive> minimap = FieldMinimapReader.Read(field, header);
        IReadOnlyList<FieldCollisionPrimitive> collisionPrimitives = FieldCollisionReader.ReadAll(field, header, collisionChunks);

        var surface = new FieldSurfaceSampler(primitives);
        var collision = new FieldCollisionSampler(collisionPrimitives);
        var roads = new FieldRoadNetwork(minimap, surface);
        var mesh = new FieldTexturedMesh(graphicsDevice, primitives, gsMemory);

        PalmCrownMesh? palmCrowns = null;
        FieldPalmCrownAsset? palmAsset = FieldPalmTreeReader.TryReadCrownAsset(field, header);
        IReadOnlyList<System.Numerics.Vector3> palmAnchors = FieldPalmTreeReader.FindCrownAnchors(primitives);
        FieldMaterial? palmMaterial = FieldPalmTreeReader.FindFrondMaterial(primitives);
        if (palmAsset is not null && palmAnchors.Count > 0 && palmMaterial is not null)
        {
            palmCrowns = new PalmCrownMesh(graphicsDevice, palmAsset, palmAnchors, palmMaterial, gsMemory);
            Console.WriteLine($"  FLD/{fieldNumber:D3}: decoded {palmCrowns.InstanceCount} animated palm crowns from Extra[1] ({palmAsset.PrimitiveCount} authored fronds each).");
        }

        // The early Peach-only minimap-derived road overlay is deliberately retired.
        // Once HG2's five-register material updates are honoured, the authored field
        // geometry already contains the real asphalt widths and lane markings. Keeping
        // the approximation on top can invent lane-count transitions that do not exist
        // in the original game.
        FieldRoadMesh? roadMesh = null;

        return new WorldSectorRuntime(
            fieldNumber,
            header,
            meshChunks,
            collisionChunks,
            surface,
            collision,
            roads,
            mesh,
            roadMesh,
            palmCrowns,
            primitives.Count,
            collisionPrimitives.Count);
    }

    public FieldDrawStats DrawPhase(
        GraphicsDevice graphicsDevice,
        BasicEffect effect,
        AlphaTestEffect? alphaEffect,
        Vector3 cameraInOriginField,
        int originFieldNumber,
        BoundingFrustum frustum,
        float animationTimeSeconds,
        FieldRenderPhase phase)
    {
        System.Numerics.Vector2 translation = ReflectedWorldSectorTopology.RelativeRenderTranslation(originFieldNumber, FieldNumber);
        var offset = new Vector3(translation.X, 0f, translation.Y);
        Matrix world = Matrix.CreateTranslation(offset);
        BoundingBox localBounds = Mesh.Bounds;
        var worldBounds = new BoundingBox(localBounds.Min + offset, localBounds.Max + offset);
        int phaseBatchCount = phase == FieldRenderPhase.Opaque ? Mesh.OpaqueBatchCount : Mesh.AlphaBatchCount;
        if (frustum.Contains(worldBounds) == ContainmentType.Disjoint)
        {
            return new FieldDrawStats
            {
                CandidateBatches = phaseBatchCount,
                CulledBatches = phaseBatchCount
            };
        }

        Vector3 cameraLocal = cameraInOriginField - offset;
        FieldDrawStats stats = Mesh.DrawPhase(graphicsDevice, effect, alphaEffect, cameraLocal, world, frustum, phase);
        if (phase == FieldRenderPhase.Opaque && RoadMesh is not null)
        {
            RoadMesh.Draw(graphicsDevice, effect, world);
            stats.DrawCalls += RoadMesh.DrawCallCount;
            stats.DrawnTriangles += RoadMesh.TriangleCount;
        }
        if (phase == FieldRenderPhase.Alpha && PalmCrowns is not null && alphaEffect is not null)
            stats.Add(PalmCrowns.Draw(graphicsDevice, alphaEffect, world, frustum, animationTimeSeconds));
        return stats;
    }

    public void Dispose()
    {
        PalmCrowns?.Dispose();
        RoadMesh?.Dispose();
        Mesh.Dispose();
    }
}

/// <summary>
/// Persistent container for all 64 standard HG2 outdoor sectors. Static field data is
/// decoded once at boot; rendering chooses only sectors near the active observer.
/// </summary>
internal sealed class PersistentWorldRuntime : IDisposable
{
    private readonly Dictionary<int, WorldSectorRuntime> _sectors;

    private PersistentWorldRuntime(Dictionary<int, WorldSectorRuntime> sectors) => _sectors = sectors;

    public IReadOnlyDictionary<int, WorldSectorRuntime> Sectors => _sectors;
    public int SectorCount => _sectors.Count;
    public int TotalRenderTriangles => _sectors.Values.Sum(sector =>
        sector.Mesh.TriangleCount + (sector.PalmCrowns?.PrimitiveCount ?? 0) * (sector.PalmCrowns?.InstanceCount ?? 0));
    public int TotalCollisionPrimitiveCount => _sectors.Values.Sum(sector => sector.CollisionPrimitiveCount);

    public static PersistentWorldRuntime LoadAll(GraphicsDevice graphicsDevice, IGameDisc disc)
    {
        var sectors = new Dictionary<int, WorldSectorRuntime>(64);
        foreach (int fieldNumber in WorldSectorTopology.AllFieldNumbers)
            sectors.Add(fieldNumber, WorldSectorRuntime.Load(graphicsDevice, disc, fieldNumber));
        return new PersistentWorldRuntime(sectors);
    }

    public WorldSectorRuntime GetSector(int fieldNumber) =>
        _sectors.TryGetValue(fieldNumber, out WorldSectorRuntime? sector)
            ? sector
            : throw new KeyNotFoundException($"World sector FLD/{fieldNumber:D3}.BIN is not resident.");

    public IEnumerable<WorldSectorRuntime> VisibleFrom(int originFieldNumber, float radius = 500f)
    {
        float radiusSquared = radius * radius;
        foreach (WorldSectorRuntime sector in _sectors.Values)
        {
            System.Numerics.Vector2 offset = ReflectedWorldSectorTopology.RelativeRenderTranslation(originFieldNumber, sector.FieldNumber);
            float nearestX = MathF.Max(0f, MathF.Abs(offset.X) - WorldSectorTopology.FieldExtent);
            float nearestZ = MathF.Max(0f, MathF.Abs(offset.Y) - WorldSectorTopology.FieldExtent);
            if (nearestX * nearestX + nearestZ * nearestZ <= radiusSquared)
                yield return sector;
        }
    }

    public void Dispose()
    {
        foreach (WorldSectorRuntime sector in _sectors.Values)
            sector.Dispose();
    }
}

/// <summary>
/// World-aware collision/surface adapter for the debug car. Samples can cross an FLD
/// edge; every point is normalised through the staggered/cyclic topology before the
/// destination sector's original HG2 data is queried.
/// </summary>
internal sealed class WorldDrivingContext
{
    private readonly PersistentWorldRuntime _world;

    public WorldDrivingContext(PersistentWorldRuntime world, int currentFieldNumber)
    {
        _world = world;
        _ = world.GetSector(currentFieldNumber);
        CurrentFieldNumber = currentFieldNumber;
    }

    public int CurrentFieldNumber { get; private set; }
    public WorldSectorRuntime CurrentSector => _world.GetSector(CurrentFieldNumber);

    public bool TryResolveFootprint(Vector3 candidate, float yaw, float referenceY, out Vector3 resolved, out uint centreSurfaceFlags, out int targetFieldNumber)
    {
        if (!TryNormalize(CurrentFieldNumber, candidate, out targetFieldNumber, out Vector3 localCandidate))
        {
            resolved = candidate;
            centreSurfaceFlags = 0;
            return false;
        }

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
            Vector3 point = localCandidate + Vector3.Transform(local[i], rotation);
            if (!TrySampleCollision(targetFieldNumber, point, referenceY, out float y, out _))
            {
                resolved = candidate;
                centreSurfaceFlags = 0;
                return false;
            }
            sum += y;
        }

        if (!TrySampleCollision(targetFieldNumber, localCandidate, referenceY, out _, out centreSurfaceFlags))
            centreSurfaceFlags = 0;

        resolved = new Vector3(localCandidate.X, sum / local.Length, localCandidate.Z);
        return true;
    }

    public void CommitField(int fieldNumber)
    {
        _ = _world.GetSector(fieldNumber);
        CurrentFieldNumber = fieldNumber;
    }

    public RoadSurfaceKind GetRoadSurface(Vector3 position)
    {
        if (!TryNormalize(CurrentFieldNumber, position, out int field, out Vector3 local))
            return RoadSurfaceKind.None;
        return _world.GetSector(field).Roads.GetRoadSurface(local.X, local.Z);
    }

    public bool TrySampleSurface(Vector3 position, float referenceY, out float y, out ushort textureBasePointer)
    {
        if (!TryNormalize(CurrentFieldNumber, position, out int field, out Vector3 local))
        {
            y = referenceY;
            textureBasePointer = 0;
            return false;
        }
        return _world.GetSector(field).Surface.TrySampleClosest(local.X, local.Z, referenceY, out y, out textureBasePointer);
    }

    public bool TrySampleGround(Vector3 position, float referenceY, out float y)
    {
        if (TrySampleCollision(CurrentFieldNumber, position, referenceY, out y, out _))
            return true;
        return TrySampleSurface(position, referenceY, out y, out _);
    }

    private bool TrySampleCollision(int originFieldNumber, Vector3 position, float referenceY, out float y, out uint flags)
    {
        if (!TryNormalize(originFieldNumber, position, out int field, out Vector3 local))
        {
            y = referenceY;
            flags = 0;
            return false;
        }
        return _world.GetSector(field).Collision.TrySampleClosest(local.X, local.Z, referenceY, out y, out flags);
    }

    private static bool TryNormalize(int originFieldNumber, Vector3 position, out int fieldNumber, out Vector3 local)
    {
        if (!ReflectedWorldSectorTopology.TryNormalizeRender(originFieldNumber, new System.Numerics.Vector2(position.X, position.Z), out WorldSectorTopology.SectorPosition normalized))
        {
            fieldNumber = originFieldNumber;
            local = position;
            return false;
        }

        fieldNumber = normalized.FieldNumber;
        local = new Vector3(normalized.LocalPosition.X, position.Y, normalized.LocalPosition.Y);
        return true;
    }
}
