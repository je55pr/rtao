using System.Security.Cryptography;
using Rta.Disc;
using Rta.Formats;

string? source = args.FirstOrDefault() ?? Environment.GetEnvironmentVariable("RTA_DISC");
if (string.IsNullOrWhiteSpace(source))
{
    Console.Error.WriteLine("Usage: Rta.Tests <RTA .cue/.bin/.iso/extracted directory>");
    return 2;
}

var tests = new (string Name, Action Body)[]
{
    ("European disc identity", EuropeanDiscIdentity),
    ("Outdoor world sector topology", OutdoorWorldSectorTopology),
    ("Outdoor exact boundary normalization", OutdoorExactBoundaryNormalization),
    ("Outdoor authored road seam", OutdoorAuthoredRoadSeam),
    ("Outdoor authored road seam matrix", OutdoorAuthoredRoadSeamMatrix),
    ("PAL outdoor resident catalogue", PalOutdoorResidentCatalogue),
    ("Peach Town field header", PeachTownHeader),
    ("Peach Town section signatures", PeachTownSignatures),
    ("Peach Town spatial chunk directories", PeachTownChunkDirectories),
    ("Peach Town inline DMA chains", PeachTownDmaChains),
    ("Peach Town VIF packet streams", PeachTownVifStreams),
    ("Peach Town spatial render primitives", PeachTownSpatialRenderPrimitives),
    ("GS local-memory texture replay", GsLocalMemoryTextureReplay),
    ("Field source ST atlas layout", FieldSourceStAtlasLayout),
    ("Field five-register material update", FieldFiveRegisterMaterialUpdate),
    ("Fuji field texture-enable flags", FujiFieldTextureEnableFlags),
    ("Fuji day-black/night-lit geometry", FujiDaytimeNightLightLayers),
    ("Bridge daytime-hidden night billboards", BridgeDaytimeHiddenNightBillboards),
    ("Fuji near-duplicate static triangles", FujiNearDuplicateStaticTriangles),
    ("Bridge/countryside dynamic palm crowns", BridgeCountrysideDynamicPalmCrowns),
    ("Shared outdoor sky panoramas", SharedOutdoorSkyPanoramas),
    ("Chestnut GS composite texture", ChestnutGsCompositeTexture),
    ("Peach Town minimap road mesh", PeachTownMinimapRoadMesh),
    ("Peach Town collision primitives", PeachTownCollisionPrimitives),
    ("Peach Town first DMA tag", PeachTownFirstDmaTag),
    ("Peach Town stable SHA-256", PeachTownHash),
    ("Q00 primary car body", Q00PrimaryCarBody),
    ("HG2 car VU shading equation", Hg2CarVuShadingEquation),
    ("PAL daylight car-light table", PalDaylightCarLightTable),
    ("Q62 starter reference body", Q62StarterReferenceBody),
    ("Runtime tire and wheel assets", RuntimeTireAndWheelAssets),
    ("Peach Town fixed interaction zones", PeachTownFixedInteractionZones),
    ("Peach Town Q's Factory interior backdrop", PeachTownQFactoryBackdrop),
    ("Peach Town overworld roaming routes", PeachTownOverworldRoamingRoutes),
    ("PAL race and activity catalogue", PalRaceAndActivityCatalogue),
    ("Peach Town James dialogue", PeachTownJamesDialogue),
    ("Peach Town Q's Factory dialogue bytecode", PeachTownQFactoryDialogueBytecode),
    ("Peach Town Q's Factory dialogue flow", PeachTownQFactoryDialogueFlow),
    ("Dialogue interpreter branches and flags", DialogueInterpreterBranchesAndFlags),
    ("My City container shape", MyCityContainerShape),
};

int failures = 0;
foreach ((string name, Action body) in tests)
{
    try
    {
        body();
        Console.WriteLine($"PASS  {name}");
    }
    catch (Exception ex)
    {
        failures++;
        Console.WriteLine($"FAIL  {name}");
        Console.WriteLine($"      {ex.Message}");
    }
}

Console.WriteLine();
Console.WriteLine($"{tests.Length - failures}/{tests.Length} tests passed");
return failures == 0 ? 0 : 1;

void OutdoorWorldSectorTopology()
{
    Equal(64, WorldSectorTopology.AllFieldNumbers.Distinct().Count());
    Equal(new WorldSectorTopology.SectorAddress(5, 5), WorldSectorTopology.FromFieldNumber(223));
    Equal(new WorldSectorTopology.SectorAddress(3, 3), WorldSectorTopology.FromFieldNumber(113));
    Equal(new WorldSectorTopology.SectorAddress(4, 4), WorldSectorTopology.FromFieldNumber(220));
    Equal(223, WorldSectorTopology.ToFieldNumber(5, 5));
    Equal(113, WorldSectorTopology.FieldNumberFromAreaCode(23));
    Equal(43, WorldSectorTopology.AreaCodeFromFieldNumber(223));

    // Canonical/source topology is independent of the MonoGame handedness fix.
    // Odd source rows are shifted +800. These two points are the same physical
    // point on the authored 223/221 north/south road seam.
    System.Numerics.Vector2 peachSourceWorld = WorldSectorTopology.ToCanonicalSource(223, new System.Numerics.Vector2(640f, 0f));
    System.Numerics.Vector2 northSourceWorld = WorldSectorTopology.ToCanonicalSource(221, new System.Numerics.Vector2(1440f, 1600f));
    Near(peachSourceWorld.X, northSourceWorld.X);
    Near(peachSourceWorld.Y, northSourceWorld.Y);

    // Source-local normalisation and reflected render-local normalisation are
    // deliberately separate operations.
    True(WorldSectorTopology.TryNormalizeSource(223, new System.Numerics.Vector2(1601f, 500f), out var sourceEast), "Source-space horizontal crossing should normalize.");
    Equal(232, sourceEast.FieldNumber);
    Near(1f, sourceEast.LocalPosition.X);
    Near(500f, sourceEast.LocalPosition.Y);

    True(ReflectedWorldSectorTopology.TryNormalizeRender(223, new System.Numerics.Vector2(-1f, 500f), out var renderEast), "Render-space horizontal crossing should normalize.");
    Equal(232, renderEast.FieldNumber);
    Near(1599f, renderEast.LocalPosition.X);
    Near(500f, renderEast.LocalPosition.Y);

    True(ReflectedWorldSectorTopology.TryNormalizeRender(223, new System.Numerics.Vector2(960f, -1f), out var renderNorth), "Reflected north stagger road crossing should normalize.");
    Equal(221, renderNorth.FieldNumber);
    Near(160f, renderNorth.LocalPosition.X);
    Near(1599f, renderNorth.LocalPosition.Y);

    System.Numerics.Vector2 peachToNorthRender = ReflectedWorldSectorTopology.RelativeRenderTranslation(223, 221);
    Near(800f, peachToNorthRender.X);
    Near(-1600f, peachToNorthRender.Y);

    // A paper/debug map must never inherit the renderer's X reflection or its
    // observer-relative wrap choice. The fixed cartographic unwrap intentionally
    // places Papaya west of White Mountain, with Peach farther east on the same row.
    float papayaX = WorldSectorCartography.SectorCenter(233).X;
    float whiteMountainX = WorldSectorCartography.SectorCenter(203).X;
    float peachX = WorldSectorCartography.SectorCenter(223).X;
    True(papayaX < whiteMountainX, $"Papaya should plot west of White Mountain ({papayaX:0} < {whiteMountainX:0}).");
    True(whiteMountainX < peachX, $"White Mountain should plot west of Peach ({whiteMountainX:0} < {peachX:0}).");

    // Round-trip the handedness adapter explicitly so a future renderer change
    // cannot silently mutate canonical world topology again.
    var sourcePoint = new System.Numerics.Vector2(321.25f, 987.5f);
    var renderPoint = ReflectedWorldSectorTopology.SourceLocalToRenderLocal(sourcePoint);
    var sourceRoundTrip = ReflectedWorldSectorTopology.RenderLocalToSourceLocal(renderPoint);
    Near(sourcePoint.X, sourceRoundTrip.X);
    Near(sourcePoint.Y, sourceRoundTrip.Y);
}

void OutdoorExactBoundaryNormalization()
{
    // Source coordinates are half-open in X: [0,1600). Exactly 1600 therefore
    // belongs to the east neighbour at local X=0, while exactly 0 remains in the
    // current field. This specifically guards against assigning the boundary to
    // the old field and then zeroing X, which teleports the canonical point 1600m.
    True(WorldSectorTopology.TryNormalizeSource(223, new System.Numerics.Vector2(1600f, 500f), out var sourceEast),
        "Exact source east boundary should normalize.");
    Equal(232, sourceEast.FieldNumber);
    Near(0f, sourceEast.LocalPosition.X);
    Near(500f, sourceEast.LocalPosition.Y);

    True(WorldSectorTopology.TryNormalizeSource(223, new System.Numerics.Vector2(0f, 500f), out var sourceCurrent),
        "Exact source west boundary should remain representable in the current field.");
    Equal(223, sourceCurrent.FieldNumber);
    Near(0f, sourceCurrent.LocalPosition.X);

    // The renderer reflects local X, so render X=0 is the source X=1600 edge.
    // The same physical point must therefore become the neighbour's render X=1600.
    True(ReflectedWorldSectorTopology.TryNormalizeRender(223, new System.Numerics.Vector2(0f, 500f), out var renderEast),
        "Exact reflected east boundary should normalize.");
    Equal(232, renderEast.FieldNumber);
    Near(1600f, renderEast.LocalPosition.X);
    Near(500f, renderEast.LocalPosition.Y);

    // Verify cyclic ownership at the outer storage-column seam too.
    int rowFiveColumnSeven = WorldSectorTopology.ToFieldNumber(7, 5);
    int rowFiveColumnZero = WorldSectorTopology.ToFieldNumber(0, 5);
    True(WorldSectorTopology.TryNormalizeSource(rowFiveColumnSeven, new System.Numerics.Vector2(1600f, 500f), out var wrappedEast),
        "Exact source boundary at the horizontal wrap should normalize.");
    Equal(rowFiveColumnZero, wrappedEast.FieldNumber);
    Near(0f, wrappedEast.LocalPosition.X);
}

void OutdoorAuthoredRoadSeam()
{
    using IGameDisc disc = GameDisc.Open(source);
    static (float MinZ, float MaxZ) BoundaryRoadZ(IGameDisc disc, int fieldNumber, bool sourceXZero)
    {
        using Stream field = disc.OpenFile($"FLD/{fieldNumber:D3}.BIN");
        FieldHeader header = FieldFile.ReadHeader(field);
        IReadOnlyList<FieldMinimapPrimitive> minimap = FieldMinimapReader.Read(field, header);
        var z = minimap
            .Where(primitive => primitive.PrimitiveType == 4 && primitive.Vertices.Count >= 3)
            .Where(primitive => primitive.Vertices.All(vertex =>
                MathF.Abs(vertex.Color.X - 88f) < 0.01f &&
                MathF.Abs(vertex.Color.Y - 88f) < 0.01f &&
                MathF.Abs(vertex.Color.Z - 231f) < 0.01f))
            .SelectMany(primitive => primitive.Vertices)
            .Where(vertex => sourceXZero
                ? MathF.Abs(vertex.Position.X) < 0.01f
                : MathF.Abs(vertex.Position.X - WorldSectorTopology.FieldExtent) < 0.01f)
            .Select(vertex => vertex.Position.Z)
            .Where(value => value is > 600f and < 700f)
            .ToArray();
        True(z.Length >= 2, $"Expected FLD/{fieldNumber:D3} authored road vertices on the test seam.");
        return (z.Min(), z.Max());
    }

    static float[] BoundaryRoadX(IGameDisc disc, int fieldNumber, bool sourceZZero)
    {
        using Stream field = disc.OpenFile($"FLD/{fieldNumber:D3}.BIN");
        FieldHeader header = FieldFile.ReadHeader(field);
        IReadOnlyList<FieldMinimapPrimitive> minimap = FieldMinimapReader.Read(field, header);
        return minimap
            .Where(primitive => primitive.PrimitiveType == 4 && primitive.Vertices.Count >= 3)
            .Where(primitive => primitive.Vertices.All(vertex =>
                MathF.Abs(vertex.Color.X - 88f) < 0.01f &&
                MathF.Abs(vertex.Color.Y - 88f) < 0.01f &&
                MathF.Abs(vertex.Color.Z - 231f) < 0.01f))
            .SelectMany(primitive => primitive.Vertices)
            .Where(vertex => sourceZZero
                ? MathF.Abs(vertex.Position.Z) < 0.01f
                : MathF.Abs(vertex.Position.Z - WorldSectorTopology.FieldExtent) < 0.01f)
            .Select(vertex => vertex.Position.X)
            .OrderBy(value => value)
            .ToArray();
    }

    // Render-space local X=1600 in Peach is source X=0. The neighbouring FLD/222
    // begins at render local X=0/source X=1600, and both road strips overlap around
    // Z=637. This is the seam used by the deterministic whole-world driving proof.
    (float peachMin, float peachMax) = BoundaryRoadZ(disc, 223, sourceXZero: true);
    (float neighbourMin, float neighbourMax) = BoundaryRoadZ(disc, 222, sourceXZero: false);
    float overlap = MathF.Min(peachMax, neighbourMax) - MathF.Max(peachMin, neighbourMin);
    True(overlap > 8f, $"Expected a substantial authored 223/222 road overlap; got {overlap:0.00}m.");

    True(ReflectedWorldSectorTopology.TryNormalizeRender(223, new System.Numerics.Vector2(1601f, 637f), out var crossed),
        "Peach road seam should normalize into its authored neighbour.");
    Equal(222, crossed.FieldNumber);
    Near(1f, crossed.LocalPosition.X);
    Near(637f, crossed.LocalPosition.Y);

    // The north edge of Peach (223) and south edge of 221 contain the same
    // two-lane road, but source-space X differs by exactly 800 because adjacent
    // storage rows are staggered. Convert both fields using the same transform the
    // runtime uses and require the two road edges to coincide to centimetre scale.
    float[] peachNorthSourceX = BoundaryRoadX(disc, 223, sourceZZero: true);
    float[] field221SouthSourceX = BoundaryRoadX(disc, 221, sourceZZero: false);
    True(peachNorthSourceX.Length >= 2, "Expected Peach north-edge authored road vertices.");
    True(field221SouthSourceX.Length >= 2, "Expected FLD/221 south-edge authored road vertices.");

    System.Numerics.Vector2 translation221 = ReflectedWorldSectorTopology.RelativeRenderTranslation(223, 221);
    float[] peachNorthRenderX = peachNorthSourceX.Select(x => WorldSectorTopology.FieldExtent - x).OrderBy(x => x).ToArray();
    float[] field221SouthRenderX = field221SouthSourceX
        .Select(x => WorldSectorTopology.FieldExtent - x + translation221.X)
        .OrderBy(x => x)
        .ToArray();
    Near(peachNorthRenderX[0], field221SouthRenderX[0], 0.02f);
    Near(peachNorthRenderX[1], field221SouthRenderX[1], 0.02f);

    True(ReflectedWorldSectorTopology.TryNormalizeRender(223, new System.Numerics.Vector2(peachNorthRenderX.Average(), -1f), out var northCrossed),
        "Authored 223/221 road seam should normalize into FLD/221.");
    Equal(221, northCrossed.FieldNumber);
}

void OutdoorAuthoredRoadSeamMatrix()
{
    using IGameDisc disc = GameDisc.Open(source);

    static float[] BoundaryRoadAxis(IGameDisc disc, int fieldNumber, char edge)
    {
        using Stream field = disc.OpenFile($"FLD/{fieldNumber:D3}.BIN");
        FieldHeader header = FieldFile.ReadHeader(field);
        IReadOnlyList<FieldMinimapPrimitive> minimap = FieldMinimapReader.Read(field, header);
        bool verticalBoundary = edge is 'W' or 'E';
        return minimap
            .Where(primitive => primitive.PrimitiveType == 4 && primitive.Vertices.Count >= 3)
            .Where(primitive => primitive.Vertices.All(vertex =>
                MathF.Abs(vertex.Color.X - 88f) < 0.01f &&
                MathF.Abs(vertex.Color.Y - 88f) < 0.01f &&
                MathF.Abs(vertex.Color.Z - 231f) < 0.01f))
            .SelectMany(primitive => primitive.Vertices)
            .Where(vertex => edge switch
            {
                'W' => MathF.Abs(vertex.Position.X) < 0.01f,
                'E' => MathF.Abs(vertex.Position.X - WorldSectorTopology.FieldExtent) < 0.01f,
                'N' => MathF.Abs(vertex.Position.Z) < 0.01f,
                'S' => MathF.Abs(vertex.Position.Z - WorldSectorTopology.FieldExtent) < 0.01f,
                _ => throw new ArgumentOutOfRangeException(nameof(edge))
            })
            .Select(vertex =>
            {
                System.Numerics.Vector2 canonical = WorldSectorTopology.ToCanonicalSource(
                    fieldNumber,
                    new System.Numerics.Vector2(vertex.Position.X, vertex.Position.Z));
                if (verticalBoundary)
                    return canonical.Y;
                float x = canonical.X % WorldSectorTopology.WorldCircumference;
                return x < 0f ? x + WorldSectorTopology.WorldCircumference : x;
            })
            .ToArray();
    }

    static void RequireRoadOverlap(IGameDisc disc, int a, char aEdge, int b, char bEdge, float minimumOverlap = 5f)
    {
        float[] first = BoundaryRoadAxis(disc, a, aEdge);
        float[] second = BoundaryRoadAxis(disc, b, bEdge);
        True(first.Length >= 2, $"Expected FLD/{a:D3} authored road vertices on edge {aEdge}.");
        True(second.Length >= 2, $"Expected FLD/{b:D3} authored road vertices on edge {bEdge}.");
        float overlap = MathF.Min(first.Max(), second.Max()) - MathF.Max(first.Min(), second.Min());
        True(overlap >= minimumOverlap,
            $"Expected FLD/{a:D3} {aEdge} / FLD/{b:D3} {bEdge} authored road overlap >= {minimumOverlap:0.##}m; got {overlap:0.###}m.");
    }

    // Independent same-row seams. These span several storage rows/columns rather
    // than proving the world layout from Peach alone.
    (int A, int B)[] eastWest =
    [
        (23, 22),
        (111, 110),
        (121, 120),
        (203, 202),
        (213, 212),
        (221, 220),
        (222, 213),
        (223, 222)
    ];
    foreach ((int a, int b) in eastWest)
        RequireRoadOverlap(disc, a, 'W', b, 'E');

    // Independent staggered row crossings. Converting the raw minimap boundary
    // vertices through WorldSectorTopology makes the +/-800 source-row offset part
    // of the assertion instead of baking the expected correction into the fixture.
    (int ZZeroField, int ZExtentField)[] northSouth =
    [
        (103, 110),
        (111, 12),
        (113, 120),
        (121, 23),
        (203, 210),
        (210, 103),
        (220, 113),
        (223, 221)
    ];
    foreach ((int zZeroField, int zExtentField) in northSouth)
        RequireRoadOverlap(disc, zZeroField, 'N', zExtentField, 'S');

    // The shortest authored road-field chain from Peach Town to Fuji City visible
    // in the minimap seam data is 223 -> 221 -> 220 -> 113. This gives the next
    // traversal milestone a concrete sequence to validate in the live driving build.
    RequireRoadOverlap(disc, 223, 'N', 221, 'S');
    RequireRoadOverlap(disc, 221, 'W', 220, 'E');
    RequireRoadOverlap(disc, 220, 'N', 113, 'S');
}

void PalOutdoorResidentCatalogue()
{
    using IGameDisc disc = GameDisc.Open(source);
    using Stream executable = disc.OpenFile(RtaGameIdentity.ExpectedEuropeanExecutable);

    int outdoor = 0;
    int moving = 0;
    int routePoints = 0;
    for (int areaIndex = 0; areaIndex < PalOverworldInteractionZones.AuthoredAreaCount; areaIndex++)
    {
        PalOverworldAreaDescriptor descriptor = PalOverworldInteractionZones.ReadAreaDescriptor(executable, areaIndex);
        if (descriptor.OutdoorResidentCount == 0)
            continue;
        IReadOnlyList<PalOutdoorResidentDefinition> residents = PalOverworldRoamingRoutes.ReadOutdoorResidents(executable, areaIndex);
        Equal(descriptor.OutdoorResidentCount, residents.Count);
        outdoor += residents.Count;
        moving += residents.Count(resident => resident.Route.Points.Count >= 2);
        routePoints += residents.Sum(resident => resident.Route.Points.Count);
    }

    Equal(81, outdoor);
    Equal(77, moving);
    Equal(3_208, routePoints);
}

void EuropeanDiscIdentity()
{
    using IGameDisc disc = GameDisc.Open(source);
    RtaGameIdentity id = RtaGameIdentity.Read(disc);
    Equal("SLES_513.56", id.BootExecutable);
    Equal("1.02", id.Version);
    Equal("PAL", id.VideoMode);
    True(disc.FileExists("FLD/223.BIN"), "FLD/223.BIN should exist.");
}

void PeachTownHeader()
{
    using IGameDisc disc = GameDisc.Open(source);
    using Stream field = disc.OpenFile("FLD/223.BIN");
    Equal(5_566_432L, field.Length);
    FieldHeader header = FieldFile.ReadHeader(field);
    SequenceEqual(new uint[] { 0x20, 0x7B000, 0x42A870, 0x53AD00, 0x53FC60, 0x54EFE0 }, header.Offsets);
    Equal(503_776u, header.Textures.Length);
    Equal(3_864_688u, header.RenderMeshes.Length);
    Equal(1_115_280u, header.Collision.Length);
    Equal(2, header.Extras.Count);
}

void PeachTownSignatures()
{
    using IGameDisc disc = GameDisc.Open(source);
    using Stream field = disc.OpenFile("FLD/223.BIN");
    FieldHeader header = FieldFile.ReadHeader(field);
    Equal(0x30u, FieldFile.ReadSectionSignature(field, header.Extras[0]));
    Equal(0x20u, FieldFile.ReadSectionSignature(field, header.Extras[1]));
}

void PeachTownChunkDirectories()
{
    using IGameDisc disc = GameDisc.Open(source);
    using Stream field = disc.OpenFile("FLD/223.BIN");
    FieldHeader header = FieldFile.ReadHeader(field);

    FieldChunkDirectory mesh = FieldChunkDirectory.ReadRenderMeshes(field, header);
    Equal(8, mesh.GridSize);
    Equal(65, mesh.TotalChunkCount);
    Equal(0x190u, mesh.DataOffset);
    Equal(0x160u, mesh.Chunks[0].Length);
    Equal((ushort)1, mesh.Chunks[0].DeclaredPacketCount);
    True(mesh.HasGlobalChunk && mesh.GlobalChunk?.IsGlobal == true, "Last render chunk should be the global/extra chunk.");

    FieldChunkDirectory collision = FieldChunkDirectory.ReadCollision(field, header);
    Equal(16, collision.GridSize);
    Equal(256, collision.TotalChunkCount);
    Equal(0x608u, collision.DataOffset);
    True(!collision.HasGlobalChunk && collision.GlobalChunk is null, "Collision should be a pure 16x16 spatial grid.");
}

void PeachTownDmaChains()
{
    using IGameDisc disc = GameDisc.Open(source);
    using Stream field = disc.OpenFile("FLD/223.BIN");
    FieldHeader header = FieldFile.ReadHeader(field);

    Ps2DmaChain textures = Ps2DmaChain.ReadInline(field, header.Textures.Offset, header.Textures.Length);
    Equal(Ps2DmaTagId.End, textures.Terminator);
    Equal(283, textures.Packets.Count);
    Equal(282, textures.Packets.Count(packet => packet.Tag.Id == Ps2DmaTagId.Cnt));
    Equal(0x7AD90u, textures.ConsumedBytes);
    True(textures.ConsumedBytes < header.Textures.Length, "Texture section is expected to contain trailing padding after END.");

    FieldChunkDirectory meshes = FieldChunkDirectory.ReadRenderMeshes(field, header);
    int twoPacketChunks = 0;
    foreach (FieldChunk chunk in meshes.Chunks)
    {
        Ps2DmaChain chain = Ps2DmaChain.ReadInline(
            field,
            header.RenderMeshes.Offset + chunk.RelativeOffset,
            chunk.Length);
        Equal(Ps2DmaTagId.Ret, chain.Terminator);
        Equal(chunk.Length, chain.ConsumedBytes);
        if (chain.Packets.Count(packet => packet.Tag.Id == Ps2DmaTagId.Cnt) == 2)
            twoPacketChunks++;
    }
    Equal(1, twoPacketChunks);
}

void PeachTownVifStreams()
{
    using IGameDisc disc = GameDisc.Open(source);
    using Stream field = disc.OpenFile("FLD/223.BIN");
    FieldHeader header = FieldFile.ReadHeader(field);
    FieldChunkDirectory meshes = FieldChunkDirectory.ReadRenderMeshes(field, header);

    int decodedCntPackets = 0;
    foreach (FieldChunk chunk in meshes.Chunks)
    {
        long chainStart = header.RenderMeshes.Offset + chunk.RelativeOffset;
        Ps2DmaChain chain = Ps2DmaChain.ReadInline(field, chainStart, chunk.Length);
        foreach (Ps2DmaPacket packet in chain.Packets.Where(packet => packet.Tag.Id == Ps2DmaTagId.Cnt))
        {
            long tagOffset = chainStart + packet.RelativeOffset;
            Ps2VifStream vif = Ps2VifStream.ReadPacket(field, tagOffset, packet.Tag);
            Equal(packet.PayloadLength, vif.ConsumedPayloadBytes);
            True(vif.Instructions.All(instruction => instruction.Kind != Ps2VifCommandKind.Unknown), "Unexpected VIF command in Peach Town render packet.");
            decodedCntPackets++;
        }
    }
    Equal(66, decodedCntPackets);

    FieldChunk firstChunk = meshes.Chunks[0];
    long firstChainStart = header.RenderMeshes.Offset + firstChunk.RelativeOffset;
    Ps2DmaChain firstChain = Ps2DmaChain.ReadInline(field, firstChainStart, firstChunk.Length);
    Ps2DmaPacket firstPacket = firstChain.Packets[0];
    Ps2VifStream first = Ps2VifStream.ReadPacket(field, firstChainStart + firstPacket.RelativeOffset, firstPacket.Tag);
    SequenceEqual(
        new[] { Ps2VifCommandKind.Stcycl, Ps2VifCommandKind.Unpack, Ps2VifCommandKind.Unpack, Ps2VifCommandKind.Unpack, Ps2VifCommandKind.Mscalf, Ps2VifCommandKind.Nop },
        first.Instructions.Select(i => i.Kind));
    Equal(8, first.Instructions.Single(i => i.Kind == Ps2VifCommandKind.Mscalf).Code.Immediate);
}


void PeachTownSpatialRenderPrimitives()
{
    using IGameDisc disc = GameDisc.Open(source);
    using Stream field = disc.OpenFile("FLD/223.BIN");
    FieldHeader header = FieldFile.ReadHeader(field);
    IReadOnlyList<FieldRenderPrimitive> primitives = FieldRenderPrimitiveReader.ReadSpatialPrimitives(field, header);

    Equal(12_632, primitives.Count);
    Equal(51_500, primitives.Sum(p => p.Vertices.Count));
    True(primitives.All(p => p.PrimitiveType == 4), "All ordinary Peach Town primitives should currently decode as triangle strips.");
    Equal(26_236, primitives.Sum(p => Math.Max(0, p.Vertices.Count - 2)));

    FieldRenderPrimitive first = primitives[0];
    Equal((ushort)4, first.GifTag.LoopCount);
    Equal(4, first.PrimitiveType);
    Equal(3, first.GifTag.RegisterCount);
    Equal((byte)0x2, first.GifTag.GetRegisterDescriptor(0));
    Equal((byte)0x1, first.GifTag.GetRegisterDescriptor(1));
    Equal((byte)0x4, first.GifTag.GetRegisterDescriptor(2));

    Near(0f, first.Vertices[0].Position.X);
    Near(31f, first.Vertices[0].Position.Y);
    Near(200f, first.Vertices[0].Position.Z);
    Near(200f, first.Vertices[1].Position.X);
    Near(0f, first.Vertices[2].Position.Z);
    Near(1f, first.Vertices[3].TextureCoordinate.X);
    Near(1f, first.Vertices[3].TextureCoordinate.Y);
    Near(1f, first.Vertices[3].TextureCoordinate.Z);

    var positions = primitives.SelectMany(p => p.Vertices).Select(v => v.Position).ToArray();
    Near(0f, positions.Min(v => v.X));
    Near(0f, positions.Min(v => v.Z));
    Near(1600.008f, positions.Max(v => v.X), 0.01f);
    Near(1600f, positions.Max(v => v.Z));
}

void GsLocalMemoryTextureReplay()
{
    static GsTex0 Tex0(ushort bp, byte bw, GsPixelStorageFormat psm, byte widthExponent, byte heightExponent) =>
        new(bp, bw, psm, widthExponent, heightExponent, false, 0, 0, 0, false, 0, 0);

    // First prove the GS page/block/column addressers round-trip host-order data
    // for each indexed format HG2 uses heavily in fields.
    {
        var memory = new GsLocalMemory();
        byte[] rgba = Enumerable.Range(0, 8 * 8 * 4).Select(i => (byte)(i * 37 + 11)).ToArray();
        memory.Write(new FieldTextureUpload(0, 0x100, 1, GsPixelStorageFormat.PsmCt32, 0, 0, 8, 8, rgba));
        SequenceEqual(rgba, memory.ReadTexture(Tex0(0x100, 1, GsPixelStorageFormat.PsmCt32, 3, 3)));

        byte[] t8 = Enumerable.Range(0, 16 * 16).Select(i => (byte)(i * 29 + 7)).ToArray();
        memory.Write(new FieldTextureUpload(1, 0x200, 2, GsPixelStorageFormat.PsmT8, 0, 0, 16, 16, t8));
        SequenceEqual(t8, memory.ReadTexture(Tex0(0x200, 2, GsPixelStorageFormat.PsmT8, 4, 4)));

        byte[] t4 = Enumerable.Range(0, (32 * 16) / 2).Select(i => (byte)(((i * 3) & 0x0F) | ((((i * 5) + 1) & 0x0F) << 4))).ToArray();
        memory.Write(new FieldTextureUpload(2, 0x300, 2, GsPixelStorageFormat.PsmT4, 0, 0, 32, 16, t4));
        SequenceEqual(t4, memory.ReadTexture(Tex0(0x300, 2, GsPixelStorageFormat.PsmT4, 5, 4)));
    }

    // Replay Peach exactly as the GS sees it: one ordered stream of host-to-local
    // IMAGE transfers into shared 4 MiB local memory. This is deliberately based
    // on the original PAL field, not our modern texture cache.
    using IGameDisc disc = GameDisc.Open(source);
    using Stream field = disc.OpenFile("FLD/223.BIN");
    FieldHeader header = FieldFile.ReadHeader(field);
    IReadOnlyList<FieldTextureUpload> sequence = FieldTextureUploadReader.ReadUploadSequence(field, header);
    Equal(282, sequence.Count);
    True(sequence.All(upload => upload.DestinationX == 0 && upload.DestinationY == 0), "Peach field texture uploads should currently all begin at GS destination origin.");

    FieldRenderPrimitive policePrimitive = FieldRenderPrimitiveReader.ReadSpatialPrimitives(field, header)
        .First(primitive => primitive.Material.Tex0.TextureBasePointer == 0x3735);
    GsTex0 policeTex0 = policePrimitive.Material.Tex0;
    Equal(GsPixelStorageFormat.PsmT4, policeTex0.PixelStorageFormat);
    Equal(64, policeTex0.Width);
    Equal(64, policeTex0.Height);
    Equal((ushort)0x373D, policeTex0.ClutBasePointer);

    FieldTextureUpload policeImageUpload = sequence.Last(upload => upload.DestinationBasePointer == policeTex0.TextureBasePointer);
    FieldTextureUpload policeClutUpload = sequence.Last(upload => upload.DestinationBasePointer == policeTex0.ClutBasePointer);
    Equal(GsPixelStorageFormat.PsmT4, policeImageUpload.DestinationPixelStorageFormat);
    Equal(GsPixelStorageFormat.PsmCt32, policeClutUpload.DestinationPixelStorageFormat);

    var gs = new GsLocalMemory();
    int firstClutMutationPacket = -1;
    foreach (FieldTextureUpload upload in sequence)
    {
        gs.Write(upload);
        if (upload.PacketIndex >= policeClutUpload.PacketIndex && firstClutMutationPacket < 0)
        {
            byte[] currentClut = gs.ReadCt32Surface(
                policeTex0.ClutBasePointer,
                policeClutUpload.DestinationBufferWidth,
                policeClutUpload.Width,
                policeClutUpload.Height);
            if (!policeClutUpload.Data.Take(currentClut.Length).SequenceEqual(currentClut))
                firstClutMutationPacket = upload.PacketIndex;
        }
    }
    Equal(107, firstClutMutationPacket);
    byte[] finalPoliceImage = gs.ReadTexture(policeTex0);
    byte[] finalPoliceRawClutSurface = gs.ReadCt32Surface(
        policeTex0.ClutBasePointer,
        policeClutUpload.DestinationBufferWidth,
        policeClutUpload.Width,
        policeClutUpload.Height);
    byte[] finalPoliceLogicalClut = gs.ReadCsm1Clut(policeTex0);

    // The indexed image itself survives the entire field upload sequence. The
    // following PSMT4 texture deliberately overwrites the physically adjacent
    // half of the 16x2 CLUT upload, but CSM1 logical entries 0..15 map only to
    // physical 0..7 and 16..23, so the actual 16-colour palette remains intact.
    SequenceEqual(policeImageUpload.Data.Take(finalPoliceImage.Length), finalPoliceImage);
    True(!policeClutUpload.Data.Take(finalPoliceRawClutSurface.Length).SequenceEqual(finalPoliceRawClutSurface),
        "Shared GS VRAM should expose the intentional physical overlap after the Police CLUT upload.");
    byte[] expectedPoliceLogicalClut = Enumerable.Range(0, 16)
        .SelectMany(logicalIndex =>
        {
            int physicalIndex = (logicalIndex & ~0x18) | ((logicalIndex & 0x08) << 1) | ((logicalIndex & 0x10) >> 1);
            return policeClutUpload.Data.Skip(physicalIndex * 4).Take(4);
        })
        .ToArray();
    SequenceEqual(expectedPoliceLogicalClut, finalPoliceLogicalClut);
}


void FieldSourceStAtlasLayout()
{
    using IGameDisc disc = GameDisc.Open(source);
    using Stream field = disc.OpenFile("FLD/223.BIN");
    FieldHeader header = FieldFile.ReadHeader(field);
    FieldRenderPrimitive[] police = FieldRenderPrimitiveReader.ReadSpatialPrimitives(field, header)
        .Where(primitive => primitive.Material.Tex0.TextureBasePointer == 0x3735)
        .ToArray();
    True(police.Length > 1, "Expected multiple Police-facade primitives using the shared atlas.");

    static (float Min, float Max) TRange(FieldRenderPrimitive primitive)
    {
        float[] t = primitive.Vertices
            .Select(vertex => vertex.TextureCoordinate.Y / (MathF.Abs(vertex.TextureCoordinate.Z) < 0.0001f ? 1f : vertex.TextureCoordinate.Z))
            .ToArray();
        return (t.Min(), t.Max());
    }

    FieldRenderPrimitive lettering = police.Single(primitive =>
    {
        (float min, float max) = TRange(primitive);
        return min < 0.01f && max > 0.49f && max < 0.51f;
    });
    True(police.Any(primitive =>
    {
        (float min, float max) = TRange(primitive);
        return min > 0.49f && min < 0.51f && max > 0.99f;
    }), "Expected surrounding Police stone bands to sample the atlas lower half.");

    // The authored text quad itself establishes HG2's vertical ST orientation:
    // its physically higher edge is T=0 and its lower edge is T=0.5. No OBJ-style
    // V inversion belongs in the runtime field renderer.
    float topY = lettering.Vertices.Max(vertex => vertex.Position.Y);
    float bottomY = lettering.Vertices.Min(vertex => vertex.Position.Y);
    float topT = lettering.Vertices.Where(vertex => MathF.Abs(vertex.Position.Y - topY) < 0.01f)
        .Average(vertex => vertex.TextureCoordinate.Y / vertex.TextureCoordinate.Z);
    float bottomT = lettering.Vertices.Where(vertex => MathF.Abs(vertex.Position.Y - bottomY) < 0.01f)
        .Average(vertex => vertex.TextureCoordinate.Y / vertex.TextureCoordinate.Z);
    Near(0f, topT);
    Near(0.5f, bottomT);
}

void FieldFiveRegisterMaterialUpdate()
{
    using IGameDisc disc = GameDisc.Open(source);
    using Stream field = disc.OpenFile("FLD/221.BIN");
    FieldHeader header = FieldFile.ReadHeader(field);
    IReadOnlyList<FieldRenderPrimitive> primitives = FieldRenderPrimitiveReader.ReadSpatialPrimitives(field, header);

    FieldRenderPrimitive sign = primitives.Single(p => p.ChunkIndex == 26 && p.PrimitiveIndex == 133);
    FieldRenderPrimitive road = primitives.Single(p => p.ChunkIndex == 26 && p.PrimitiveIndex == 134);

    // A roadside sign is immediately followed by a five-register material block
    // before this broad asphalt strip. Ignoring that block leaks the sign material
    // onto the road, making the otherwise-correct geometry look missing/corrupt.
    Equal((ushort)12178, sign.Material.Tex0.TextureBasePointer);
    Equal((ushort)12201, road.Material.Tex0.TextureBasePointer);
    Equal(128, road.Material.Tex0.Width);
    Equal(64, road.Material.Tex0.Height);
    Equal((byte)1, road.Material.Clamp.WrapModeS);
    Equal((byte)0, road.Material.Clamp.WrapModeT);
    Equal((ushort)4, road.Material.MaterialGifTag.LoopCount);
    Equal((byte)1, road.Material.MaterialGifTag.RegisterCount);
    Equal((byte)0x0E, road.Material.MaterialGifTag.GetRegisterDescriptor(0));
    True(road.Material.MipTbp1.HasValue, "FLD/221 asphalt material should preserve its MIPTBP1_2 register.");
    Equal(0x100000000000AFBAUL, road.Material.MipTbp1!.Value);
}

void FujiFieldTextureEnableFlags()
{
    using IGameDisc disc = GameDisc.Open(source);
    using Stream field = disc.OpenFile("FLD/113.BIN");
    FieldHeader header = FieldFile.ReadHeader(field);
    IReadOnlyList<FieldRenderPrimitive> primitives = FieldRenderPrimitiveReader.ReadAllPrimitives(field, header);

    // PRIM.TME is bit 4. HG2 genuinely mixes textured and untextured field draws;
    // forcing the previous texture onto TME=0 geometry leaks unrelated texture alpha
    // into otherwise solid geometry.
    Equal(566, primitives.Count(primitive => !primitive.TextureMappingEnabled));
    Equal(11_781, primitives.Count(primitive => primitive.TextureMappingEnabled));
}

void FujiDaytimeNightLightLayers()
{
    using IGameDisc disc = GameDisc.Open(source);
    using Stream field = disc.OpenFile("FLD/113.BIN");
    FieldHeader header = FieldFile.ReadHeader(field);
    IReadOnlyList<FieldRenderPrimitive> primitives = FieldRenderPrimitiveReader.ReadAllPrimitives(field, header);

    FieldRenderPrimitive[] dayBlackNightLit = primitives.Where(primitive => primitive.IsDayBlackNightLitLayer).ToArray();
    Equal(100, dayBlackNightLit.Length);
    True(dayBlackNightLit.All(primitive => !primitive.TextureMappingEnabled),
        "Fuji day-black/night-lit geometry should be the authored untextured layer family.");

    // Jess's original-game day/night comparison at FLD/113 X591 Z1060 identifies
    // this facade as a concrete ground-truth example: the daytime scene shows the
    // ordinary wall/window geometry, while the nighttime scene adds warm illumination.
    // Later doorway comparison also proved that some members are useful black interior
    // backing by day, so the format layer classifies rather than discarding them.
    True(dayBlackNightLit.Any(primitive =>
    {
        float minX = primitive.Vertices.Min(vertex => 1600f - vertex.Position.X);
        float maxX = primitive.Vertices.Max(vertex => 1600f - vertex.Position.X);
        float minZ = primitive.Vertices.Min(vertex => vertex.Position.Z);
        float maxZ = primitive.Vertices.Max(vertex => vertex.Position.Z);
        return minX < 610f && maxX > 590f && minZ < 1070f && maxZ > 1045f;
    }), "Expected a night-only Fuji facade layer near the player comparison location X591 Z1060.");
}


void BridgeDaytimeHiddenNightBillboards()
{
    using IGameDisc disc = GameDisc.Open(source);
    using Stream field = disc.OpenFile("FLD/220.BIN");
    FieldHeader header = FieldFile.ReadHeader(field);
    IReadOnlyList<FieldRenderPrimitive> primitives = FieldRenderPrimitiveReader.ReadAllPrimitives(field, header);

    FieldRenderPrimitive[] nightEffects = primitives.Where(primitive => primitive.IsNightLightBillboard).ToArray();
    Equal(62, nightEffects.Length);
    True(nightEffects.All(primitive => primitive.PlacementOffset is not null),
        "Bridge night effects should be authored camera-facing billboard primitives.");

    Dictionary<ushort, int> counts = nightEffects
        .GroupBy(primitive => primitive.Material.Tex0.TextureBasePointer)
        .ToDictionary(group => group.Key, group => group.Count());
    Equal(8, counts[10505]);   // soft yellow bridge-lamp glow
    Equal(48, counts[10525]); // green suspension-cable coronas
    Equal(6, counts[10534]);  // orange/yellow tower coronas

    using Stream country = disc.OpenFile("FLD/221.BIN");
    FieldHeader countryHeader = FieldFile.ReadHeader(country);
    IReadOnlyList<FieldRenderPrimitive> countryPrimitives = FieldRenderPrimitiveReader.ReadAllPrimitives(country, countryHeader);
    Equal(0, countryPrimitives.Count(primitive => primitive.IsNightLightBillboard));
}


void FujiNearDuplicateStaticTriangles()
{
    using IGameDisc disc = GameDisc.Open(source);
    using Stream field = disc.OpenFile("FLD/113.BIN");
    FieldHeader header = FieldFile.ReadHeader(field);
    IReadOnlyList<FieldRenderPrimitive> primitives = FieldRenderPrimitiveReader.ReadAllPrimitives(field, header);

    var groups = new Dictionary<(int Chunk, FieldMaterial Material, bool TextureEnabled), HashSet<string>>();
    int duplicates = 0;

    foreach (FieldRenderPrimitive primitive in primitives)
    {
        if (primitive.PrimitiveType != 4 || primitive.Vertices.Count < 3 ||
            primitive.PlacementOffset is not null || primitive.IsDayBlackNightLitLayer)
        {
            continue;
        }

        var groupKey = (primitive.ChunkIndex, primitive.Material, primitive.TextureMappingEnabled);
        if (!groups.TryGetValue(groupKey, out HashSet<string>? triangles))
        {
            triangles = new HashSet<string>(StringComparer.Ordinal);
            groups.Add(groupKey, triangles);
        }

        for (int i = 0; i < primitive.Vertices.Count - 2; i++)
        {
            int a = (i & 1) == 0 ? i : i + 1;
            int b = (i & 1) == 0 ? i + 1 : i;
            int c = i + 2;
            string key = $"{NearDuplicateVertexKey(primitive.Vertices[a])}|{NearDuplicateVertexKey(primitive.Vertices[b])}|{NearDuplicateVertexKey(primitive.Vertices[c])}";
            if (!triangles.Add(key))
                duplicates++;
        }
    }

    // PAL FLD/113 contains a small authored set of repeated static triangles whose
    // position channels differ only by sub-millimetre float noise. They are visually
    // indistinguishable (same chunk/material/day colour/STQ) but z-fight on a modern
    // depth buffer. Keep this evidence count stable so renderer-side suppression stays
    // narrowly scoped instead of becoming a broad geometry simplifier.
    Equal(100, duplicates);
}

void BridgeCountrysideDynamicPalmCrowns()
{
    using IGameDisc disc = GameDisc.Open(source);
    using Stream field = disc.OpenFile("FLD/221.BIN");
    FieldHeader header = FieldFile.ReadHeader(field);
    IReadOnlyList<FieldRenderPrimitive> primitives = FieldRenderPrimitiveReader.ReadAllPrimitives(field, header);

    FieldPalmCrownAsset? crown = FieldPalmTreeReader.TryReadCrownAsset(field, header);
    True(crown is not null, "FLD/221 Extra[1] should expose the authored dynamic palm-crown asset.");
    SequenceEqual(new[] { 1, 2, 3 }, crown!.FrondGroups.Select(group => group.Count));
    Equal(6, crown.PrimitiveCount);
    Equal(24, crown.VertexCount);
    True(crown.FrondGroups.SelectMany(group => group).All(primitive =>
        primitive.VuProgram == 4 && primitive.PrimitiveType == 4 && primitive.UsesTexture),
        "Palm crown source geometry should remain on HG2's textured MSCALF-4 dynamic-object path.");

    IReadOnlyList<System.Numerics.Vector3> anchors = FieldPalmTreeReader.FindCrownAnchors(primitives);
    Equal(6, anchors.Count);
    True(anchors.Count(anchor => MathF.Abs(anchor.Y - 10.5f) < 0.1f) >= 5,
        "Five coastal palm trunks should retain the common ~10.5 m authored top marker.");
    True(anchors.Any(anchor => MathF.Abs(anchor.Y - 13.46f) < 0.1f),
        "One coastal palm should retain its taller ~13.46 m authored top marker.");

    FieldMaterial? frondMaterial = FieldPalmTreeReader.FindFrondMaterial(primitives);
    True(frondMaterial is not null, "FLD/221 should expose the hidden frond texture state in its ordinary field stream.");
    Equal((ushort)11762, frondMaterial!.Tex0.TextureBasePointer);
    Equal(GsPixelStorageFormat.PsmT8, frondMaterial.Tex0.PixelStorageFormat);
    Equal(64, frondMaterial.Tex0.Width);
    Equal(32, frondMaterial.Tex0.Height);

    // The same Extra[1] crown geometry is deliberately shared by the adjacent bridge
    // field, evidence that this is an authored reusable dynamic object rather than a
    // hand-built replacement for six specific FLD/221 trunks. Original PAL gameplay
    // additionally confirms every palm trunk along FLD/220's beach carries a crown.
    using Stream bridge = disc.OpenFile("FLD/220.BIN");
    FieldHeader bridgeHeader = FieldFile.ReadHeader(bridge);
    IReadOnlyList<FieldRenderPrimitive> bridgePrimitives = FieldRenderPrimitiveReader.ReadAllPrimitives(bridge, bridgeHeader);
    FieldPalmCrownAsset? bridgeCrown = FieldPalmTreeReader.TryReadCrownAsset(bridge, bridgeHeader);
    True(bridgeCrown is not null, "FLD/220 should carry the same dynamic palm-crown object container.");
    SequenceEqual(new[] { 1, 2, 3 }, bridgeCrown!.FrondGroups.Select(group => group.Count));
    Equal(crown.PrimitiveCount, bridgeCrown.PrimitiveCount);
    Equal(crown.VertexCount, bridgeCrown.VertexCount);

    IReadOnlyList<System.Numerics.Vector3> bridgeAnchors = FieldPalmTreeReader.FindCrownAnchors(bridgePrimitives);
    Equal(106, bridgeAnchors.Count);
    True(bridgeAnchors.All(anchor => anchor.Y is >= 9.5f and <= 17.1f),
        "FLD/220 palm crown markers should remain on the authored trunk-top height band.");
    True(bridgeAnchors.Any(anchor =>
            MathF.Abs(anchor.X - 1300.24f) < 0.1f &&
            MathF.Abs(anchor.Z - 797.27f) < 0.1f),
        "FLD/220 should retain the thin bevelled crown marker beside the X337/Z796 HumanEyes repro.");
    True(bridgeAnchors.Any(anchor =>
            MathF.Abs(anchor.X - 1159.72f) < 0.1f &&
            MathF.Abs(anchor.Z - 833.07f) < 0.1f),
        "FLD/220 should retain the texture-enabled crown-cap variant in the same beach cluster.");

    FieldMaterial? bridgeFrondMaterial = FieldPalmTreeReader.FindFrondMaterial(bridgePrimitives);
    True(bridgeFrondMaterial is not null, "FLD/220 should expose its relocated hidden frond material.");
    Equal((ushort)10406, bridgeFrondMaterial!.Tex0.TextureBasePointer);
    Equal(GsPixelStorageFormat.PsmT8, bridgeFrondMaterial.Tex0.PixelStorageFormat);
    Equal(64, bridgeFrondMaterial.Tex0.Width);
    Equal(32, bridgeFrondMaterial.Tex0.Height);

    // The logical crown texture is byte-identical even though each field relocates it
    // in GS memory. This locks the structural lookup to the asset, not one field's TBP.
    var countrysideGs = new GsLocalMemory();
    countrysideGs.Replay(FieldTextureUploadReader.ReadUploadSequence(field, header));
    var bridgeGs = new GsLocalMemory();
    bridgeGs.Replay(FieldTextureUploadReader.ReadUploadSequence(bridge, bridgeHeader));
    SequenceEqual(countrysideGs.ReadTexture(frondMaterial.Tex0), bridgeGs.ReadTexture(bridgeFrondMaterial.Tex0));
    SequenceEqual(countrysideGs.ReadCsm1Clut(frondMaterial.Tex0), bridgeGs.ReadCsm1Clut(bridgeFrondMaterial.Tex0));
}

static string NearDuplicateVertexKey(FieldRenderVertex vertex)
{
    float q = MathF.Abs(vertex.TextureCoordinate.Z) < 0.0001f ? 1f : vertex.TextureCoordinate.Z;
    static int Quantize(float value, float scale) => checked((int)MathF.Round(value * scale));
    static byte ToByte(float value) => (byte)Math.Clamp((int)MathF.Round(value * (255f / 128f)), 0, 255);

    return string.Join(',',
        Quantize(vertex.Position.X, 1000f),
        Quantize(vertex.Position.Y, 1000f),
        Quantize(vertex.Position.Z, 1000f),
        ToByte(vertex.DayColor.X),
        ToByte(vertex.DayColor.Y),
        ToByte(vertex.DayColor.Z),
        Quantize(vertex.TextureCoordinate.X / q, 100000f),
        Quantize(vertex.TextureCoordinate.Y / q, 100000f));
}

void SharedOutdoorSkyPanoramas()
{
    using IGameDisc disc = GameDisc.Open(source);
    using Stream sky = disc.OpenFile("SYS/SORA.GSL");
    Hg2SkyTextureSet textures = Hg2SkyTextureReader.Read(sky);

    Equal(5, textures.DmaPacketCount);
    Equal(512, textures.DayPanorama.Width);
    Equal(96, textures.DayPanorama.Height);
    Equal(GsPixelStorageFormat.PsmT8, textures.DayPanorama.SourcePixelStorageFormat);
    Equal(1024, textures.NightOverlay.Width);
    Equal(128, textures.NightOverlay.Height);
    Equal(GsPixelStorageFormat.PsmT4, textures.NightOverlay.SourcePixelStorageFormat);

    ReadOnlySpan<byte> day = textures.DayPanorama.RgbaPixels;
    Equal(512 * 96 * 4, day.Length);
    // The panorama is authored blue at the zenith and fades to the very pale
    // horizon visible throughout the original outdoor game.
    int top = 0;
    True(day[top] < 20 && day[top + 1] is >= 80 and <= 150 && day[top + 2] > 220 && day[top + 3] == 255,
        "SORA daytime panorama should retain its saturated blue upper sky.");
    int horizon = ((95 * 512) + 256) * 4;
    True(day[horizon] > 220 && day[horizon + 1] > 220 && day[horizon + 2] > 220 && day[horizon + 3] == 255,
        "SORA daytime panorama should retain its pale authored horizon.");

    ReadOnlySpan<byte> night = textures.NightOverlay.RgbaPixels;
    Equal(1024 * 128 * 4, night.Length);
    int transparent = 0;
    int visible = 0;
    int bright = 0;
    for (int pixel = 0; pixel < 1024 * 128; pixel++)
    {
        byte alpha = night[pixel * 4 + 3];
        if (alpha == 0) transparent++;
        else visible++;
        if (alpha >= 180) bright++;
    }
    True(transparent > 120_000, "Night SORA overlay should remain mostly transparent around its stars and moon.");
    True(visible > 1_000, "Night SORA overlay should retain authored star/moon pixels.");
    True(bright > 100, "Night SORA overlay should retain high-alpha moon/star highlights.");
}

void ChestnutGsCompositeTexture()
{
    using IGameDisc disc = GameDisc.Open(source);
    using Stream field = disc.OpenFile("FLD/103.BIN");
    FieldHeader header = FieldFile.ReadHeader(field);
    IReadOnlyList<FieldTextureUpload> sequence = FieldTextureUploadReader.ReadUploadSequence(field, header);
    FieldRenderPrimitive[] primitives = FieldRenderPrimitiveReader.ReadAllPrimitives(
        field,
        header,
        FieldChunkDirectory.ReadRenderMeshes(field, header)).ToArray();

    GsTex0 tex0 = primitives.Select(primitive => primitive.Material.Tex0)
        .First(texture => texture.TextureBasePointer == 0x35F4);
    Equal(GsPixelStorageFormat.PsmT4, tex0.PixelStorageFormat);
    Equal(64, tex0.Width);
    Equal(128, tex0.Height);

    FieldTextureUpload baseUpload = sequence.Last(upload => upload.DestinationBasePointer == 0x35F4);
    Equal(64, baseUpload.Width);
    Equal(78, baseUpload.Height);
    Equal(2_496, baseUpload.Data.Length);
    True(baseUpload.Data.Length < (tex0.Width * tex0.Height) / 2,
        "The standalone upload must not be large enough to represent TEX0's complete surface.");

    var gs = new GsLocalMemory();
    gs.Replay(sequence);
    byte[] final = gs.ReadTexture(tex0);
    Equal(4_096, final.Length);
    int tailStart = baseUpload.Height * (tex0.Width / 2);
    True(final.Skip(tailStart).Any(value => value != 0),
        "Later GS transfers should populate the TEX0 rows that are absent from its base upload.");

    // Packets 19 and 20 are the transfers which alias into this texture's lower
    // GS blocks: the CLUT immediately after it, then the following 64x64 PSMT4 image.
    var partial = new GsLocalMemory();
    for (int i = 0; i <= baseUpload.PacketIndex; i++)
        partial.Write(sequence[i]);
    byte[] beforeAliases = partial.ReadTexture(tex0);
    partial.Write(sequence[19]);
    byte[] afterClut = partial.ReadTexture(tex0);
    partial.Write(sequence[20]);
    byte[] afterFollowingTexture = partial.ReadTexture(tex0);
    True(!beforeAliases.SequenceEqual(afterClut), "Chestnut CLUT upload should alias into the declared TEX0 surface.");
    True(!afterClut.SequenceEqual(afterFollowingTexture), "Following Chestnut PSMT4 upload should complete more of the declared TEX0 surface.");
    SequenceEqual(final, afterFollowingTexture);

    FieldRenderPrimitive[] uses = primitives.Where(primitive => primitive.Material.Tex0.Equals(tex0)).ToArray();
    Equal(3, uses.Length);
    float minT = uses.SelectMany(primitive => primitive.Vertices)
        .Min(vertex => vertex.TextureCoordinate.Y / vertex.TextureCoordinate.Z);
    float maxT = uses.SelectMany(primitive => primitive.Vertices)
        .Max(vertex => vertex.TextureCoordinate.Y / vertex.TextureCoordinate.Z);
    Near(0f, minT);
    Near(1f, maxT);
}

void PeachTownMinimapRoadMesh()
{
    using IGameDisc disc = GameDisc.Open(source);
    using Stream field = disc.OpenFile("FLD/223.BIN");
    FieldHeader header = FieldFile.ReadHeader(field);
    IReadOnlyList<FieldMinimapPrimitive> primitives = FieldMinimapReader.Read(field, header);

    Equal(65, primitives.Count);
    Equal(383, primitives.Sum(p => p.Vertices.Count));
    True(primitives.All(p => p.PrimitiveType == 4), "Peach Town minimap should be triangle strips.");

    FieldMinimapVertex[] roadVertices = primitives
        .SelectMany(p => p.Vertices)
        .Where(v => MathF.Abs(v.Color.X - 88f) < 0.01f && MathF.Abs(v.Color.Y - 88f) < 0.01f && MathF.Abs(v.Color.Z - 231f) < 0.01f)
        .ToArray();
    Equal(224, roadVertices.Length);
    Near(0f, primitives.SelectMany(p => p.Vertices).Min(v => v.Position.X));
    Near(1600f, primitives.SelectMany(p => p.Vertices).Max(v => v.Position.X));
}


void PeachTownCollisionPrimitives()
{
    using IGameDisc disc = GameDisc.Open(source);
    using Stream field = disc.OpenFile("FLD/223.BIN");
    FieldHeader header = FieldFile.ReadHeader(field);
    IReadOnlyList<FieldCollisionPrimitive> collision = FieldCollisionReader.ReadAll(field, header);
    Equal(9_108, collision.Count);
    Equal(20_955, collision.Sum(p => p.TriangleCount));
    Equal(39_171, collision.Sum(p => p.Vertices.Count));
    Equal(14, collision.Select(p => p.SurfaceFlags).Distinct().Count());
    True(collision.All(p => p.PrimitiveType == 4), "Peach Town collision primitives should be triangle strips.");
    True(collision.SelectMany(p => p.TriangleNormals).All(n => MathF.Abs(n.Y - 1f) < 0.0001f), "Peach Town collision normals are expected to be upward-facing in this 2.5D boundary mesh.");
    Equal(5_665, collision.Count(p => p.SurfaceFlags == 0x00000313));
    Equal(1_305, collision.Count(p => p.SurfaceFlags == 0x00000000));
}

void PeachTownFirstDmaTag()
{
    using IGameDisc disc = GameDisc.Open(source);
    using Stream field = disc.OpenFile("FLD/223.BIN");
    FieldHeader header = FieldFile.ReadHeader(field);
    Ps2DmaTag tag = FieldDiagnostics.ReadFirstTextureDmaTag(field, header);
    Equal(Ps2DmaTagId.Cnt, tag.Id);
    Equal((ushort)134, tag.QuadwordCount);
    Equal(2_144, tag.InlinePayloadBytes);
    Equal(0x00912DA4u, tag.VifCode0);
    Equal(0x0012F498u, tag.VifCode1);
}

void PeachTownHash()
{
    using IGameDisc disc = GameDisc.Open(source);
    byte[] data = disc.ReadAllBytes("FLD/223.BIN");
    string hash = Convert.ToHexString(SHA256.HashData(data)).ToLowerInvariant();
    Equal("3531bf916e54013cd60a58fd770b8ddabfebc08ffc5f2f15986993c0ec372b09", hash);
}


void Q00PrimaryCarBody()
{
    using IGameDisc disc = GameDisc.Open(source);
    using Stream car = disc.OpenFile("CAR0/Q00.BIN");
    Equal(224_272L, car.Length);

    CarFileHeader header = CarFile.ReadHeader(car);
    SequenceEqual(new uint[] { 48, 128_688, 171_824, 177_312, 187_312, 203_776, 206_592, 224_272 }, header.Offsets);
    Equal(6, header.ModelSectionCount);
    Equal(17_680u, header.TextureLength);

    IReadOnlyList<CarRenderPrimitive> primitives = CarRenderPrimitiveReader.ReadPrimaryBody(car, header);
    Equal(495, primitives.Count);
    Equal(2_264, primitives.Sum(p => p.Vertices.Count));
    Equal(1_274, primitives.Sum(p => Math.Max(0, p.Vertices.Count - 2)));
    Equal(33, primitives.Count(p => p.UsesTexture));
    Equal(462, primitives.Count(p => !p.UsesTexture));
    True(primitives.All(p => p.PrimitiveType == 4), "Q00 primary body should decode as triangle strips.");
    True(primitives.All(p => p.VuProgram == 4), "Q00 primary body should use the high-detail car VU program.");

    IReadOnlyDictionary<ushort, FieldTextureUpload> uploads = FieldTextureUploadReader.ReadUploads(car, header.TextureOffset, header.TextureLength);
    Equal(2, uploads.Count);
    True(uploads.Values.Any(upload => upload.DestinationPixelStorageFormat == GsPixelStorageFormat.PsmT8 && upload.Width == 128 && upload.Height == 128), "Q00 should contain its 128x128 PSMT8 detail atlas.");
    True(uploads.Values.Any(upload => upload.DestinationPixelStorageFormat == GsPixelStorageFormat.PsmCt32 && upload.Width == 16 && upload.Height == 16), "Q00 should contain its 16x16 RGBA CLUT.");

    CarRenderVertex[] vertices = primitives.SelectMany(p => p.Vertices).ToArray();
    Near(-0.897f, vertices.Min(v => v.Position.X), 0.002f);
    Near(0.897f, vertices.Max(v => v.Position.X), 0.002f);
    Near(-1.386f, vertices.Min(v => v.Position.Z), 0.002f);
    Near(1.382f, vertices.Max(v => v.Position.Z), 0.002f);
}


void Q62StarterReferenceBody()
{
    using IGameDisc disc = GameDisc.Open(source);
    using Stream car = disc.OpenFile("CAR2/Q62.BIN");
    Equal(217_248L, car.Length);

    CarFileHeader header = CarFile.ReadHeader(car);
    SequenceEqual(new uint[] { 48, 106_784, 168_832, 169_120, 178_432, 195_632, 199_568, 217_248 }, header.Offsets);
    IReadOnlyList<CarRenderPrimitive> primitives = CarRenderPrimitiveReader.ReadPrimaryBody(car, header);
    Equal(389, primitives.Count);
    Equal(1_896, primitives.Sum(p => p.Vertices.Count));
    Equal(1_118, primitives.Sum(p => Math.Max(0, p.Vertices.Count - 2)));
    Equal(134, primitives.Count(p => p.ColorSelection == 1));
    Equal(57, primitives.Count(p => p.ColorSelection == 2));
}

void Hg2CarVuShadingEquation()
{
    var primary = new System.Numerics.Vector3(0.8f, 0.4f, 0.2f);
    var secondary = new System.Numerics.Vector3(0.2f, 0.4f, 0.8f);
    Equal(System.Numerics.Vector3.One, Hg2CarShading.SelectPaintFactor(0, primary, secondary));
    Equal(primary, Hg2CarShading.SelectPaintFactor(1, primary, secondary));
    Equal(secondary, Hg2CarShading.SelectPaintFactor(2, primary, secondary));
    Equal(primary, Hg2CarShading.SelectPaintFactor(3, primary, secondary));

    var lighting = new Hg2CarLighting(
        NormalBasisX: System.Numerics.Vector3.UnitX,
        NormalBasisY: System.Numerics.Vector3.UnitY,
        NormalBasisZ: System.Numerics.Vector3.UnitZ,
        DirectionalX: new System.Numerics.Vector3(0.5f, 0.25f, 0.125f),
        DirectionalY: new System.Numerics.Vector3(0.2f, 0.4f, 0.6f),
        HighlightColor: new System.Numerics.Vector3(1f, 0.5f, 0.25f),
        AmbientColor: new System.Numerics.Vector3(0.5f));

    System.Numerics.Vector3 shaded = Hg2CarShading.Shade(
        normal: new System.Numerics.Vector3(0.5f, -0.25f, 0.75f),
        authoredColor: new System.Numerics.Vector3(200f, 100f, 50f),
        paintFactor: new System.Numerics.Vector3(0.8f, 0.4f, 0.2f),
        surfaceParameter: 128f,
        lighting);

    // Negative transformed components are clamped before the two directional
    // terms. The remaining Z component contributes only through z^8 highlight.
    Near(132.81445f, shaded.X, 0.0002f);
    Near(31.40723f, shaded.Y, 0.0002f);
    Near(8.82861f, shaded.Z, 0.0002f);

    System.Numerics.Vector3 saturated = Hg2CarShading.Shade(
        System.Numerics.Vector3.One,
        new System.Numerics.Vector3(255f),
        System.Numerics.Vector3.One,
        280.5f,
        lighting);
    Near(255f, saturated.X);
    Near(255f, saturated.Y);
    Near(255f, saturated.Z);
}

void PalDaylightCarLightTable()
{
    using IGameDisc disc = GameDisc.Open(source);
    using Stream executable = disc.OpenFile(RtaGameIdentity.ExpectedEuropeanExecutable);
    var elf = new Elf32AddressSpace(executable);
    float[] expected =
    [
        0.60f, 0.60f, 0.60f, 0f,
        0.25f, 0.25f, 0.25f, 0f,
        0.60f, 0.60f, 0.60f, 0f,
        0.40f, 0.40f, 0.40f, 128f
    ];
    for (int i = 0; i < expected.Length; i++)
        Near(expected[i], elf.ReadSingle(0x002A2910u + (uint)(i * 4)));

    Hg2CarLighting daylight = Hg2CarShading.CreatePalDaylight(
        System.Numerics.Vector3.UnitX,
        System.Numerics.Vector3.UnitY,
        System.Numerics.Vector3.UnitZ);
    Equal(new System.Numerics.Vector3(0.66f), daylight.DirectionalX);
    Equal(new System.Numerics.Vector3(0.275f), daylight.DirectionalY);
    Equal(new System.Numerics.Vector3(0.66f), daylight.HighlightColor);
    Equal(new System.Numerics.Vector3(0.44f), daylight.AmbientColor);
    Near(-0.707106769f, Hg2CarShading.PalPrimaryLightDirection.X);
    Near(0.707106769f, Hg2CarShading.PalPrimaryLightDirection.Y);
    Near(0.447221488f, Hg2CarShading.PalSecondaryLightDirection.X);
    Near(-0.774587572f, Hg2CarShading.PalSecondaryLightDirection.Z);
}

void RuntimeTireAndWheelAssets()
{
    using IGameDisc disc = GameDisc.Open(source);
    using Stream tire = disc.OpenFile("CARS/TIRE.BIN");
    Hg2ObjectFileHeader tireHeader = Hg2ObjectFile.ReadHeader(tire);
    SequenceEqual(new uint[] { 48, 6_672, 13_424, 26_560, 34_800, 50_144, 65_376, 74_352 }, tireHeader.Offsets);

    IReadOnlyList<CarRenderPrimitive> frontLeft = Hg2ObjectFile.ReadPrimaryMesh(tire, tireHeader, 0);
    IReadOnlyList<CarRenderPrimitive> frontRight = Hg2ObjectFile.ReadPrimaryMesh(tire, tireHeader, 1);
    IReadOnlyList<CarRenderPrimitive> rearPair = Hg2ObjectFile.ReadPrimaryMesh(tire, tireHeader, 2);
    IReadOnlyList<CarRenderPrimitive> distantFour = Hg2ObjectFile.ReadPrimaryMesh(tire, tireHeader, 3);
    Equal(20, frontLeft.Count);
    Equal(21, frontRight.Count);
    Equal(40, rearPair.Count);
    Equal(16, distantFour.Count);

    uint textureOffset = tireHeader.Offsets[^2];
    IReadOnlyDictionary<ushort, FieldTextureUpload> uploads = FieldTextureUploadReader.ReadUploads(tire, textureOffset, tireHeader.EndOffset - textureOffset);
    Equal(2, uploads.Count);
    True(uploads.Values.Any(upload => upload.DestinationPixelStorageFormat == GsPixelStorageFormat.PsmT4 && upload.Width == 128 && upload.Height == 128), "TIRE.BIN should contain the 128x128 PSMT4 wheel-face atlas.");
    True(uploads.Values.Any(upload => upload.DestinationPixelStorageFormat == GsPixelStorageFormat.PsmCt16 && upload.Width == 16 && upload.Height == 16), "TIRE.BIN should contain the 16x16 PSMCT16 wheel-face CLUT.");

    CarRenderVertex[] lod = distantFour.SelectMany(p => p.Vertices).ToArray();
    Near(-0.940f, lod.Min(v => v.Position.X), 0.002f);
    Near(0.940f, lod.Max(v => v.Position.X), 0.002f);
    Near(-1.040f, lod.Min(v => v.Position.Z), 0.002f);
    Near(1.011f, lod.Max(v => v.Position.Z), 0.002f);
}



void PeachTownFixedInteractionZones()
{
    using IGameDisc disc = GameDisc.Open(source);
    using Stream executable = disc.OpenFile("SLES_513.56");

    PalOverworldAreaDescriptor peach = PalOverworldInteractionZones.ReadAreaDescriptor(executable, 1);
    Equal("Peach Town", peach.Name);
    Equal(28, peach.FixedInteractionCount);
    Equal(11, peach.OutdoorResidentCount);

    IReadOnlyList<PalFixedInteractionZone> zones = PalOverworldInteractionZones.ReadPeachTownZones(executable);
    Equal(28, zones.Count);
    SequenceEqual(
        new[]
        {
            "Q's Factory Staff", "Parts Shop Staff", "Body Shop Staff", "Paint Shop Staff",
            "Bartender", "Policeman", "Peach FM Front Desk", "Kinsera", "Kevin's mom", "Wolf",
            "Best", "Jousset", "Owner", "Grandpa Tal", "Jones", "Fight", "Milton",
            "Entrance to the cave", "Quick-Pic Shop Staff", "Quick-Pic Shop Staff",
            "Quick-Pic Shop Staff", "Quick-Pic Shop Staff", "Quick-Pic Shop Staff",
            "Quick-Pic Shop Staff", "Quick-Pic Shop Staff", "Quick-Pic Shop Staff",
            "Quick-Pic Shop Staff", "Quick-Pic Shop Staff"
        },
        zones.Select(zone => zone.ResidentName));

    PalFixedInteractionZone factory = zones[0];
    Near(512.10f, factory.Corners[0].X, 0.02f);
    Near(432.10f, factory.Corners[0].Y, 0.02f);
    Near(508.57f, factory.Center.X, 0.02f);
    Near(432.94f, factory.Center.Y, 0.02f);
    True(factory.Contains(factory.Center), "Q's Factory trigger should contain its own centre.");
    Near(0f, factory.DistanceTo(factory.Center));
    True(factory.DistanceTo(new System.Numerics.Vector2(100f, 100f)) > 100f, "A distant point should not be near Q's Factory's trigger.");

    PalFixedInteractionZone cave = zones[17];
    Equal("Entrance to the cave", cave.ResidentName);
    Near(1189.0f, cave.Center.X, 0.05f);
    Near(528.78f, cave.Center.Y, 0.05f);

    PalFixedInteractionZone grandpa = zones[13];
    True(grandpa.HasSentinelCorner, "Grandpa Tal's fixed interaction zone should preserve its (-1,-1) sentinel corners.");
    Near(-1f, grandpa.Corners[0].X);
    Near(-1f, grandpa.Corners[1].X);
    True(!grandpa.Contains(grandpa.Center), "Grandpa Tal's sentinel polygon must remain inactive.");
    True(float.IsPositiveInfinity(grandpa.DistanceTo(grandpa.Center)), "Disabled sentinel polygons should never become proximity interactions.");

    Equal(10, zones.Count(zone => zone.ResidentName == "Quick-Pic Shop Staff"));
}


void PeachTownQFactoryBackdrop()
{
    using IGameDisc disc = GameDisc.Open(source);
    using Stream shop = disc.OpenFile("SHOP/T00.BIN");

    Equal(28, Hg2ShopInteriorReader.GetSlotCount(shop));
    Hg2ShopInteriorBackdrop factory = Hg2ShopInteriorReader.ReadBackdrop(shop, 0);
    Equal(0, factory.SlotIndex);
    Equal(640, factory.Width);
    Equal(384, factory.Height);
    Equal(3, factory.DmaPacketCount);
    Equal(GsPixelStorageFormat.PsmT8, factory.SourcePixelStorageFormat);
    Equal(640 * 384 * 4, factory.RgbaPixels.Length);
    string rgbaHash = Convert.ToHexString(SHA256.HashData(factory.RgbaPixels)).ToLowerInvariant();
    Equal("7813917f1854038264193bbb4ef545fe2f1b8f73e13048678a7a2808fdb50165", rgbaHash);

    Hg2ShopInteriorBackdrop paint = Hg2ShopInteriorReader.ReadBackdrop(shop, 3);
    Equal(640, paint.Width);
    Equal(384, paint.Height);
    Equal(7, paint.DmaPacketCount);

    Hg2ShopInteriorBackdrop quickPicA = Hg2ShopInteriorReader.ReadBackdrop(shop, 18);
    Hg2ShopInteriorBackdrop quickPicB = Hg2ShopInteriorReader.ReadBackdrop(shop, 27);
    SequenceEqual(quickPicA.RgbaPixels, quickPicB.RgbaPixels);
}

void PeachTownOverworldRoamingRoutes()
{
    using IGameDisc disc = GameDisc.Open(source);
    using Stream executable = disc.OpenFile("SLES_513.56");
    IReadOnlyList<PalOutdoorResidentDefinition> outdoor = PalOverworldRoamingRoutes.ReadPeachTownOutdoorResidents(executable);
    Equal(11, outdoor.Count);
    SequenceEqual(
        new[] { "James", "Gonzo", "Ramsey", "Accel", "Cobran", "Flower", "Klien", "Barthou", "Pillow", "Kevin", "Newman" },
        outdoor.Select(resident => resident.Name));
    SequenceEqual(new[] { 91, 28, 10, 9, 56, 73, 30, 21, 68, 47, 14 }, outdoor.Select(resident => resident.BodyId));

    PalOutdoorResidentDefinition james = outdoor[0];
    Equal(84, james.Route.Points.Count);
    Equal(0x002C8170u, james.Route.StartAddress);
    Equal(0x002C8950u, james.Route.EndAddress);
    Near(459f, james.Spawn.Position.X);
    Near(30f, james.Spawn.Position.Y);
    Near(786f, james.Spawn.Position.Z);
    Near(482f, james.Route.Points[0].Center.X);
    Near(484f, james.Route.Points[0].Center.Y);
    // HG2 uses its authored 0.10..0.85 paint-intensity table, not RGB444
    // full-range expansion. Nibble 8 therefore maps to byte 127.
    Equal((byte)127, james.Paint.Primary.R);
    Equal((byte)127, james.Paint.Secondary.R);

    PalOutdoorResidentDefinition gonzo = outdoor[1];
    Equal(0x00FFFF10u, gonzo.PackedPaint);
    Equal(new PalRgb(25, 38, 216), gonzo.Paint.Primary);
    Equal(new PalRgb(216, 216, 216), gonzo.Paint.Secondary);

    Dictionary<string, int> roamingCounts = PalOverworldRoamingRoutes.ReadPeachTownRoamingResidents(executable)
        .ToDictionary(resident => resident.Name, resident => resident.Route.Points.Count, StringComparer.Ordinal);
    Equal(6, roamingCounts.Count);
    Equal(84, roamingCounts["James"]);
    Equal(19, roamingCounts["Klien"]);
    Equal(36, roamingCounts["Barthou"]);
    Equal(25, roamingCounts["Pillow"]);
    Equal(29, roamingCounts["Kevin"]);
    Equal(71, roamingCounts["Newman"]);

    PalOutdoorResidentDefinition kevin = outdoor[9];
    Equal(0x0000F00Fu, kevin.PackedPaint);
    Equal(new PalRgb(216, 25, 25), kevin.Paint.Primary);
    Equal(new PalRgb(216, 25, 25), kevin.Paint.Secondary);
    Near(858f, kevin.Spawn.Position.X);
    Near(392f, kevin.Spawn.Position.Z);
    Near(858f, kevin.Route.Points[0].Center.X);
    Near(392f, kevin.Route.Points[0].Center.Y);
}

void PalRaceAndActivityCatalogue()
{
    using IGameDisc disc = GameDisc.Open(source);
    using Stream executable = disc.OpenFile("SLES_513.56");
    PalRaceCatalogue catalogue = PalRaceCatalogueReader.Read(executable);
    Equal(39, catalogue.Activities.Count);
    Equal(24, catalogue.OrdinaryRaces.Count);
    SequenceEqual(
        new[]
        {
            "Peach Raceway", "Peach Raceway II", "Temple Raceway", "Ninja Temple Raceway",
            "Desert Raceway", "Night Glow Raceway", "Snow Mountain Raceway", "Miner 49er Raceway",
            "Slick Track", "Oval Raceway", "River Raceway", "Snow Mountain Raceway",
            "Lava Run Raceway", "Sunny Beach Raceway", "Lagoon Raceway", "Tin Raceway",
            "Tin Raceway", "Endurance Run", "Treasure Hunting Maze", "Sliding Door Race",
            "Highway Race", "Rock Climbing", "Drag Race", "Golf"
        },
        catalogue.OrdinaryRaces.Select(activity => activity.Name));

    PalRaceActivityDescriptor peach = catalogue.Activities[0];
    Equal(0x002BFE48u, peach.DescriptorAddress);
    Equal((byte)0, peach.SceneId);
    Equal((byte)0x18, peach.RawParameter1);
    Equal((byte)3, peach.RawParameter2);
    Equal((byte)0, peach.VariantId);
    Equal(0x002BF9F8u, peach.SettingsAddress);
    Equal(0x002BF728u, peach.ParticipantListAddress);
    Equal(23, peach.Participants.Count);
    Equal((byte)8, peach.Participants[0].AreaIndex);
    Equal((byte)17, peach.Participants[0].ResidentIndex);
    True(peach.Participants[0].Name.Length > 0, "The first Peach race participant should resolve through the executable resident catalogue.");
    True(peach.Participants[0].BodyId >= 0, "The first Peach race participant should expose its original car body.");
    Equal((byte)1, peach.Participants[^1].AreaIndex);
    Equal((byte)34, peach.Participants[^1].ResidentIndex);
    Equal(0x0022F3F8u, peach.HandlerAAddress);
    Equal(0x00252BA0u, peach.HandlerBAddress);
    SequenceEqual(new byte[] { 0x36, 0x00, 0x02, 0x02 }, peach.RawSettings.Take(4));

    Equal("Roulette", catalogue.Activities[24].Name);
    True(!catalogue.Activities[24].IsOrdinaryRace, "Activity 24 should remain outside the executable-proven ordinary-race range.");
    Equal(0x002C0068u, catalogue.Activities[34].DescriptorAddress);
    Equal("Cloud Hill", catalogue.Activities[34].Name);
    Equal(0x002C0090u, catalogue.Activities[35].DescriptorAddress);
    Equal((byte)0x13, catalogue.Activities[35].SceneId);
    Equal("Ski Jumping", catalogue.Activities[35].Name);
    Equal(0x002C00C0u, catalogue.Activities[38].DescriptorAddress);
    Equal("Single Lap Race", catalogue.Activities[38].Name);
    Equal(new PalRaceSelectorRange(1, 0, 3), catalogue.SelectorRanges[1]);
    SequenceEqual(new[] { 0, 1, 2 }, catalogue.ActivitiesForArea(1).Select(activity => activity.ActivityId));
    SequenceEqual(new[] { 20, 21, 22, 23 }, catalogue.ActivitiesForArea(7).Select(activity => activity.ActivityId));
    SequenceEqual(new[] { 25 }, catalogue.ActivitiesForArea(8).Select(activity => activity.ActivityId));
    SequenceEqual(new[] { 24 }, catalogue.ActivitiesForArea(9).Select(activity => activity.ActivityId));
    SequenceEqual(new[] { 6, 9, 9 }, catalogue.OrdinaryRaces.GroupBy(activity => activity.VariantId).OrderBy(group => group.Key).Select(group => group.Count()));
    SequenceEqual(Enumerable.Range(0, 15), catalogue.OrdinaryRaces.Select(activity => (int)activity.SceneId).Distinct().Order());
    Equal(800, PalRaceCatalogueReader.PrizeCake(0, new[] { 0 }));
    Equal(3000, PalRaceCatalogueReader.PrizeCake(1, new[] { 0, 2, 5 }));
    Equal(3200, PalRaceCatalogueReader.PrizeCake(2, new[] { 1, 3, 0xFF }));
    Equal(180000, PalRaceCatalogueReader.PrizeCake(3, new[] { 0, 1, 2 }));
    Equal(0, PalRaceCatalogueReader.PrizeCake(4, new[] { 0 }));

    using Stream finishGateExecutable = disc.OpenFile("SLES_513.56");
    IReadOnlyList<PalRaceFinishGateSet> finishGates = PalRaceCatalogueReader.ReadFinishGateSets(finishGateExecutable);
    Equal(15, finishGates.Count);
    Near(588f, finishGates[0].Strips[0].MinimumX);
    Near(535f, finishGates[0].Strips[0].MinimumZ);
    Near(590f, finishGates[0].Strips[0].MaximumX);
    Near(576.8f, finishGates[0].Strips[0].MaximumZ);
    Near(839f, finishGates[14].Strips[2].MinimumX);
    Near(549.5f, finishGates[14].Strips[2].MaximumZ);
    PalRaceFinishGateSet peachGates = finishGates[0];
    PalRaceFinishGateAdvance crossing = PalRaceCatalogueReader.AdvanceFinishGate(peachGates, 1, 589f, 550f);
    Equal(new PalRaceFinishGateAdvance(2, false), crossing);
    crossing = PalRaceCatalogueReader.AdvanceFinishGate(peachGates, crossing.Phase, 591f, 550f);
    crossing = PalRaceCatalogueReader.AdvanceFinishGate(peachGates, crossing.Phase, 593f, 550f);
    Equal(new PalRaceFinishGateAdvance(4, false), crossing);
    Equal(new PalRaceFinishGateAdvance(2, true), PalRaceCatalogueReader.AdvanceFinishGate(peachGates, crossing.Phase, 589f, 550f));

    using Stream startAnchorExecutable = disc.OpenFile("SLES_513.56");
    IReadOnlyList<PalRaceStartAnchor> startAnchors = PalRaceCatalogueReader.ReadStartAnchors(startAnchorExecutable);
    Equal(15, startAnchors.Count);
    PalRaceStartAnchor peachStart = startAnchors[0];
    Near(572.2f, peachStart.NativeX);
    Near(1.1f, peachStart.NativeY);
    Near(561.3f, peachStart.NativeZ);
    Equal((short)1, peachStart.HeadingQuarterTurns);
    Equal((short)0, peachStart.LateralPolarity);
    PalRaceStartSeed peachSlot3 = PalRaceCatalogueReader.StartSeed(peachStart, 3);
    Near(557.2f, peachSlot3.NativeX);
    Near(568.8f, peachSlot3.NativeZ);
    Equal((ushort)0x4000, peachSlot3.NativeYaw);
    PalRaceStartAnchor riverStart = startAnchors[10];
    Equal((short)2, riverStart.HeadingQuarterTurns);
    Equal((short)1, riverStart.LateralPolarity);
    PalRaceStartSeed riverSlot3 = PalRaceCatalogueReader.StartSeed(riverStart, 3);
    Near(458.9f, riverSlot3.NativeX);
    Near(476.7f, riverSlot3.NativeZ);
    Equal((ushort)0x8000, riverSlot3.NativeYaw);
    True(catalogue.OrdinaryRaces.All(activity => activity.RawParameter1 == 24), "All PAL ordinary descriptors should declare 24 active cars.");
    True(catalogue.OrdinaryRaces.All(activity => activity.Participants.Count == 23), "All PAL ordinary participant pools should contain 23 resident references.");
    IReadOnlyList<PalOrdinaryRaceEntrant> peachEntrants = PalRaceCatalogueReader.OrdinaryRaceEntrants(peach, peachStart);
    Equal(24, peachEntrants.Count);
    PalOrdinaryRacePlayerEntrant peachPlayer = (PalOrdinaryRacePlayerEntrant)peachEntrants[0];
    Equal(0, peachPlayer.CarIndex);
    Equal(0, peachPlayer.ConfigPointerIndex);
    Equal(23, peachPlayer.StartIndex);
    Equal(0x00025C00u, peachPlayer.PackedCreationFlags);
    Equal(PalRaceControlSource.HumanInput, peachPlayer.ControlSource);
    Equal((int?)0, peachPlayer.ControllerIndex);
    PalOrdinaryRaceOpponentEntrant peachFirstOpponent = (PalOrdinaryRaceOpponentEntrant)peachEntrants[1];
    Equal(1, peachFirstOpponent.CarIndex);
    Equal(25, peachFirstOpponent.ConfigPointerIndex);
    Equal(22, peachFirstOpponent.ParticipantIndex);
    Equal(peach.Participants[22], peachFirstOpponent.Participant);
    Equal(0, peachFirstOpponent.StartIndex);
    Equal(PalRaceControlSource.OrdinaryAi, peachFirstOpponent.ControlSource);
    Equal((int?)null, peachFirstOpponent.ControllerIndex);
    SequenceEqual(
        new[] { 22, 21, 20, 19, 18, 17, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16 },
        peachEntrants.OfType<PalOrdinaryRaceOpponentEntrant>().Select(entrant => entrant.ParticipantIndex));
    IReadOnlyList<PalOrdinaryRaceEntrant> teamEntrants = PalRaceCatalogueReader.OrdinaryRaceEntrants(peach, peachStart, new PalRaceTeamMemberIdentity?[]
    {
        new(peach.Participants[5].AreaIndex, peach.Participants[5].ResidentIndex),
        new(peach.Participants[20].AreaIndex, peach.Participants[20].ResidentIndex),
    });
    Equal(24, teamEntrants.Count);
    Equal(2, teamEntrants.OfType<PalOrdinaryRaceTeammateEntrant>().Count());
    True(teamEntrants.OfType<PalOrdinaryRaceTeammateEntrant>().All(entrant => entrant.ControlSource == PalRaceControlSource.OrdinaryAi),
        "Saved teammate entrants must use the ordinary AI path.");
    True(teamEntrants.OfType<PalOrdinaryRaceOpponentEntrant>().All(entrant => entrant.ParticipantIndex is not 5 and not 20),
        "Saved teammate resident identities must be filtered from ordinary opponents.");
    Equal(22, teamEntrants[^1].StartIndex);
    Equal(23, teamEntrants[^1].CarIndex);

    using Stream navigationExecutable = disc.OpenFile("SLES_513.56");
    IReadOnlyList<PalRaceNavigationCourse> navigation = PalRaceCatalogueReader.ReadNavigationCourses(navigationExecutable);
    Equal(15, navigation.Count);
    SequenceEqual(
        new[] { 35, 43, 120, 143, 66, 163, 90, 128, 42, 37, 143, 90, 143, 224, 197 },
        navigation.Select(course => course.Gates.Count));
    Equal(1664, navigation.Sum(course => course.Gates.Count));
    True(navigation.All(course => course.Records.Count == course.Gates.Count), "Each native ordinary course should have one routing record per navigation gate.");
    True(navigation.SelectMany(course => course.Records).All(record => record.ReservedByte == 0), "PAL ordinary navigation routing records should retain their zero reserved byte.");
    Equal(0x002AE698u, navigation[0].GateTableAddress);
    Equal(0x002AE9E0u, navigation[0].RecordTableAddress);
    Near(590f, navigation[0].Gates[0].EndpointA.NativeX);
    Near(569f, navigation[0].Gates[0].EndpointA.NativeZ);
    Near(590f, navigation[0].Gates[0].EndpointB.NativeX);
    Near(571f, navigation[0].Gates[0].EndpointB.NativeZ);
    Equal((byte)0, navigation[0].Records[0].BackwardBoundaryGateIndex);
    Equal((byte)1, navigation[0].Records[0].ForwardBoundaryGateIndex);
    SequenceEqual(new byte[] { 34, 34 }, navigation[0].Records[0].BackwardRecordIndices);
    SequenceEqual(new byte[] { 1, 1 }, navigation[0].Records[0].ForwardRecordIndices);
    Equal((byte)0, navigation[0].Records[0].SelectorOutput);
    PalRaceNavigationAdvance startNavigation = PalRaceCatalogueReader.AdvanceNavigation(
        navigation[0], 0, peachStart.NativeX, peachStart.NativeZ);
    Equal(34, startNavigation.CurrentRecordIndex);
    Equal((byte)34, startNavigation.SelectorOutput);
    Equal(0, startNavigation.ReturnedRecordIndex);
    Equal((byte)2, startNavigation.ForwardChoiceClass);
    Equal(navigation[6].GateTableAddress, navigation[11].GateTableAddress);
    Equal(navigation[6].RecordTableAddress, navigation[11].RecordTableAddress);
    True(catalogue.OrdinaryRaces.All(activity => activity.HandlerBAddress == PalRaceCatalogueReader.OrdinaryRaceAiHandlerAddress),
        "Every PAL ordinary descriptor should install the proven 0x00252BA0 AI handler.");
}


void PeachTownJamesDialogue()
{
    using IGameDisc disc = GameDisc.Open(source);
    using Stream executable = disc.OpenFile("SLES_513.56");
    PalDialogueEntity james = PalDialogueDatabase.ReadPeachTownEntity(executable, "James");
    Equal(28, james.EntityIndex);
    Equal(11, james.Variants.Count);
    PalDialogueVariant fallback = james.GetFallbackGreeting();
    Equal(0x00326AA0u, fallback.TextAddress);
    // The final plain fallback is the generic peach-tree greeting. Keep the text
    // assertion too so later control-flow archaeology cannot silently reorder it.
    True(james.Variants.Any(v => v.DisplayText.Contains("Did you see the peach tree?", StringComparison.Ordinal)), "James should contain his original peach-tree greeting.");
    PalDialogueVariant peachGreeting = james.Variants.Single(v => v.DisplayText.Contains("Did you see the peach tree?", StringComparison.Ordinal));
    Equal(0x00326AA0u, peachGreeting.TextAddress);

    foreach (string resident in new[] { "Klien", "Barthou", "Pillow", "Kevin", "Newman" })
    {
        PalDialogueEntity entity = PalDialogueDatabase.ReadPeachTownEntity(executable, resident);
        True(entity.Variants.Count > 0, $"{resident} should expose at least one PAL dialogue variant.");
        True(entity.GetFallbackGreeting().Pages.Count > 0, $"{resident} should retain a displayable fallback greeting.");
    }

    PalDialogueEntity barthou = PalDialogueDatabase.ReadPeachTownEntity(executable, "Barthou");
    True(barthou.Variants.Any(variant => variant.Actions.Any(action =>
        action.Opcode == PalDialogueActionOpcode.RaceSelect && action.Operands.SequenceEqual(new byte[] { 0x00 }))),
        "Barthou should preserve the one-byte zero-sentinel form of action 0x08.");
}

void PeachTownQFactoryDialogueBytecode()
{
    using IGameDisc disc = GameDisc.Open(source);
    using Stream executable = disc.OpenFile("SLES_513.56");
    PalDialogueEntity factory = PalDialogueDatabase.ReadPeachTownEntity(executable, "Q's Factory");
    Equal(0, factory.EntityIndex);
    Equal(0x002E2338u, factory.EntityAddress);
    Equal(72, factory.Variants.Count);

    PalDialogueVariant mainMenuVariant = factory.GetVariantByPointerTableSlot(0x04);
    PalDialogueMenuToken mainMenu = mainMenuVariant.Menus.Single();
    SequenceEqual(
        new[] { "Change parts", "Race", "Save data", "Exit game", "Drive around town" },
        mainMenu.Options.Select(option => option.Text));
    SequenceEqual(new byte[] { 0x05, 0x07, 0x06, 0x08, 0x0B }, mainMenu.Options.Select(option => option.TargetSlot));

    PalDialogueVariant grandPrixMenuVariant = factory.GetVariantByPointerTableSlot(0x2D);
    PalDialogueMenuToken grandPrixMenu = grandPrixMenuVariant.Menus.Single();
    SequenceEqual(
        new[] { "Change parts", "World Grand Prix", "Race", "Save data", "Exit game", "Drive around town" },
        grandPrixMenu.Options.Select(option => option.Text));
    SequenceEqual(new byte[] { 0x05, 0x2F, 0x07, 0x06, 0x08, 0x0B }, grandPrixMenu.Options.Select(option => option.TargetSlot));

    PalDialogueVariant rallyMenuVariant = factory.GetVariantByPointerTableSlot(0x23);
    PalDialogueMenuToken rallyMenu = rallyMenuVariant.Menus.Single();
    SequenceEqual(
        new[] { "Change parts", "Retire the rally", "Go to the next check point" },
        rallyMenu.Options.Select(option => option.Text));
    SequenceEqual(new byte[] { 0x24, 0x25, 0x27 }, rallyMenu.Options.Select(option => option.TargetSlot));
    Equal((byte)PalDialogueActionOpcode.Menu, rallyMenu.Options[0].Bytes[0]);

    PalDialogueVariant raceMenu = factory.GetVariantByPointerTableSlot(0x07);
    Equal(0x00322350u, raceMenu.TextAddress);
    True(raceMenu.DisplayText.Contains("Which race do you want to enter?", StringComparison.Ordinal), "Q's Factory slot 07 should be the original race selector prompt.");
    PalDialogueActionToken raceSelect = raceMenu.Actions.Single(action => action.Opcode == PalDialogueActionOpcode.RaceSelect);
    SequenceEqual(new byte[] { 0x0F, 0x04 }, raceSelect.Operands);
    Equal(0x003220D0u, factory.GetVariantByPointerTableSlot(raceSelect.Operands[0]).TextAddress);
    Equal(0x003223A8u, factory.GetVariantByPointerTableSlot(raceSelect.Operands[1]).TextAddress);

    PalDialogueVariant saveData = factory.GetVariantByPointerTableSlot(0x06);
    True(saveData.PreControls.Any(control => control.Opcode == PalDialogueOpcode.SetFlag && control.Operands.SequenceEqual(new byte[] { 0x02 })), "Save-data flow should set Q's Factory flag 0x02 before opening the memory-card UI.");
    PalDialogueActionToken saveAction = saveData.Actions.Single(action => action.Opcode == PalDialogueActionOpcode.SaveData);
    SequenceEqual(new byte[] { 0x04 }, saveAction.Operands);

    PalDialogueActionToken stopForToday = factory.GetVariantByPointerTableSlot(0x08).Actions.Single(action => action.Opcode == PalDialogueActionOpcode.YesNoDefaultSecond);
    SequenceEqual(new byte[] { 0x0A, 0x04 }, stopForToday.Operands);

    PalDialogueVariant worldGrandPrix = factory.GetVariantByPointerTableSlot(0x2F);
    PalDialogueControlToken teamGate = worldGrandPrix.PreControls.First(control => control.Opcode == PalDialogueOpcode.BranchIfTeamIncomplete);
    SequenceEqual(new byte[] { 0x30 }, teamGate.Operands);
    True(factory.GetVariantByPointerTableSlot(0x30).DisplayText.Contains("enough teammates", StringComparison.Ordinal), "World Grand Prix team gate should target the three-car warning.");
    PalDialogueControlToken areaGate = worldGrandPrix.PreControls.First(control => control.Opcode == PalDialogueOpcode.BranchIfCurrentAreaEquals);
    SequenceEqual(new byte[] { 0x01, 0x37 }, areaGate.Operands);

    PalDialogueVariant firstGrandPrixRace = factory.GetVariantByPointerTableSlot(0x38);
    True(firstGrandPrixRace.PreControls.Any(control => control.Opcode == PalDialogueOpcode.SetFlag && control.Operands.SequenceEqual(new byte[] { 0x65 })), "First World Grand Prix stage should set progression flag 0x65.");
    PalDialogueActionToken startRace = firstGrandPrixRace.Actions.Single(action => action.Opcode == PalDialogueActionOpcode.StartRace);
    SequenceEqual(new byte[] { 0x1C }, startRace.Operands);

    PalDialogueActionToken readyForGrandPrix = factory.GetVariantByPointerTableSlot(0x37).Actions.Single(action => action.Opcode == PalDialogueActionOpcode.YesNoDefaultFirst);
    SequenceEqual(new byte[] { 0x38, 0x2D }, readyForGrandPrix.Operands);

    PalDialogueActionToken peachTransition = factory.GetVariantByPointerTableSlot(0x39).Actions.Single(action => action.Opcode == PalDialogueActionOpcode.Transition);
    SequenceEqual(new byte[] { 0x01, 0x00 }, peachTransition.Operands);
    PalDialogueActionToken cloudhillTransition = factory.GetVariantByPointerTableSlot(0x3B).Actions.Single(action => action.Opcode == PalDialogueActionOpcode.Transition);
    SequenceEqual(new byte[] { 0x08, 0x00 }, cloudhillTransition.Operands);

    PalDialogueVariant rallyFinish = factory.GetVariantByPointerTableSlot(0x22);
    True(rallyFinish.PreControls.Any(control => control.Opcode == PalDialogueOpcode.ClearFlag && control.Operands.SequenceEqual(new byte[] { 0x50 })), "Q's Rally finish should clear active-rally flag 0x50.");
    True(rallyFinish.PreControls.Any(control => control.Opcode == PalDialogueOpcode.SetRallyStage && control.Operands.SequenceEqual(new byte[] { 0x06 })), "Q's Rally finish should record stage six.");
    PalDialogueActionToken rallyTransition = rallyFinish.Actions.Single(action => action.Opcode == PalDialogueActionOpcode.Transition);
    SequenceEqual(new byte[] { 0x09, 0x14 }, rallyTransition.Operands);

    SequenceEqual(
        new[] { 2, 2, 3, 1, 2, 2, 1, 2, 0, 0, 2, 0, 2, 6, 1, 1, 2, 0, 1, 2, 1, 1, 1, 1, 2, 2, 1, 2, 3 },
        Enumerable.Range(1, 0x1D).Select(opcode => PalDialogueBytecode.GetPreTextOperandCount((byte)opcode)));
    SequenceEqual(
        new[] { 0, 2, 2, 1, 1, 3, 1, 3, 2, -1, 0, 2, 1, -1, 1, 0, 2, 2, 1, 1, 2, 3, 3, 0, 0 },
        Enumerable.Range(0, 0x19).Select(opcode => PalDialogueBytecode.GetActionOperandCount((byte)opcode)));
}

void PeachTownQFactoryDialogueFlow()
{
    using IGameDisc disc = GameDisc.Open(source);
    using Stream executable = disc.OpenFile("SLES_513.56");
    PalDialogueEntity factory = PalDialogueDatabase.ReadPeachTownEntity(executable, "Q's Factory");
    var state = new PalDialogueRuntimeState { CurrentAreaIndex = 1 };
    var flow = new PalDialogueFlow(factory, state, 0x04);

    Equal(0x04, flow.CurrentSlot);
    Equal("What do you want to do?", flow.CurrentPage);
    SequenceEqual(
        new[] { "Change parts", "Race", "Save data", "Exit game", "Drive around town" },
        flow.CurrentChoices.Select(choice => choice.Text));
    True(!state.IsFlagSet(0x00) && !state.IsFlagSet(0x03), "Q's Factory main-menu prelude should clear flags 00 and 03.");

    flow.Choose(4);
    Equal(0x0B, flow.CurrentSlot);
    Equal("Come again!", flow.CurrentPage);
    True(flow.IgnoredControls.Any(control => control.Opcode == PalDialogueOpcode.Action10), "Drive-around-town target should preserve its still-untraced 0x12 pre-control instead of inventing semantics.");
    flow.Advance();
    True(flow.IsEnded, "Drive around town should finish the current interior dialogue flow after its farewell text.");

    var saveFlow = new PalDialogueFlow(factory, new PalDialogueRuntimeState { CurrentAreaIndex = 1 }, 0x06);
    True(saveFlow.CurrentExternalAction?.Opcode == PalDialogueActionOpcode.SaveData, "Save-data slot should expose its memory-card call as a host-system action.");
    Equal((byte)0x04, saveFlow.CurrentExternalAction!.Operands.Single());
    saveFlow.ReturnFromExternalAction(saveFlow.CurrentExternalAction.Operands[0]);
    Equal(0x04, saveFlow.CurrentSlot);

    var introState = new PalDialogueRuntimeState { CurrentAreaIndex = 1 };
    var introFlow = new PalDialogueFlow(factory, introState, 0x01);
    Equal(0x01, introFlow.CurrentSlot);
    True(introState.IsFlagSet(0x01), "Fresh Q's Factory intro should set its first-visit flag 01.");
    SequenceEqual(new[] { "Yes", "No" }, introFlow.CurrentChoices.Select(choice => choice.Text));
    Equal(0x0D, introFlow.CurrentChoices[0].TargetSlot);
    Equal(0x0E, introFlow.CurrentChoices[1].TargetSlot);
    True(introFlow.CurrentChoices[1].IsDefault, "The original first-visit Super-A licence question should default to No.");
}

void DialogueInterpreterBranchesAndFlags()
{
    var flags = new DialogueFlagStore();
    var nodes = new Dictionary<int, DialogueNode>
    {
        [0] = new DialogueConditionNode(0, "met", 4, 1),
        [1] = new DialogueTextNode(1, "James", "Hello", 2),
        [2] = new DialogueChoiceNode(2, "James", "Join?", new[] { new DialogueChoice("Yes", 3), new DialogueChoice("No", 5) }),
        [3] = new DialogueSetFlagNode(3, "met", true, 4),
        [4] = new DialogueTextNode(4, "James", "Teammates!", 5),
        [5] = new DialogueEndNode(5)
    };
    var machine = new DialogueMachine(new DialogueScript(0, nodes), flags);
    Equal("Hello", machine.CurrentText?.Text);
    machine.Advance();
    Equal("Join?", machine.CurrentChoice?.Prompt);
    machine.Choose(0);
    True(flags.IsSet("met"), "Choice path should set the dialogue flag.");
    Equal("Teammates!", machine.CurrentText?.Text);
    machine.Advance();
    True(machine.IsEnded, "Dialogue should reach its end node.");

    var second = new DialogueMachine(new DialogueScript(0, nodes), flags);
    Equal("Teammates!", second.CurrentText?.Text);
}

void MyCityContainerShape()
{
    using IGameDisc disc = GameDisc.Open(source);
    using Stream field = disc.OpenFile("FLD/023.BIN");
    FieldHeader header = FieldFile.ReadHeader(field);
    Equal(84, header.Offsets.Count);
    Equal(80, header.Extras.Count);
    Equal(0x160u, header.HeaderLength);
}

static void Equal<T>(T expected, T actual)
{
    if (!EqualityComparer<T>.Default.Equals(expected, actual))
        throw new Exception($"Expected {expected}, got {actual}.");
}

static void Near(float expected, float actual, float tolerance = 0.0001f)
{
    if (MathF.Abs(expected - actual) > tolerance)
        throw new Exception($"Expected approximately {expected}, got {actual} (tolerance {tolerance}).");
}

static void True(bool value, string message)
{
    if (!value)
        throw new Exception(message);
}

static void SequenceEqual<T>(IEnumerable<T> expected, IEnumerable<T> actual)
{
    if (!expected.SequenceEqual(actual))
        throw new Exception($"Expected [{string.Join(", ", expected)}], got [{string.Join(", ", actual)}].");
}
