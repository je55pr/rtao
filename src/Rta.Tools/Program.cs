using Rta.Disc;
using Rta.Formats;
using Rta.Tools;

return args.Length == 0 ? Usage() : args[0].ToLowerInvariant() switch
{
    "inspect" when args.Length >= 2 => Inspect(args[1]),
    "field" when args.Length >= 3 => InspectField(args[1], args[2]),
    "vif-summary" when args.Length >= 3 => VifSummary(args[1], args[2]),
    "field-vif-inputs" when args.Length >= 3 => FieldVifInputs(args[1], args[2]),
    "mesh-summary" when args.Length >= 3 => MeshSummary(args[1], args[2]),
    "world-mesh-summary" when args.Length >= 2 => WorldMeshSummary(args[1]),
    "car-summary" when args.Length >= 3 => CarSummary(args[1], args[2]),
    "elf-words" when args.Length >= 4 => ElfWords(args[1], args[2], args[3]),
    "elf-disasm" when args.Length >= 4 => ElfDisasm(args[1], args[2], args[3]),
    "elf-find-word" when args.Length >= 3 => ElfFindWord(args[1], args[2]),
    "elf-find-vector4" when args.Length >= 6 => ElfFindVector4(args[1], args[2], args[3], args[4], args[5]),
    "elf-find-address" when args.Length >= 3 => ElfFindAddress(args[1], args[2]),
    "elf-find-ascii" when args.Length >= 3 => ElfFindAscii(args[1], string.Join(" ", args.Skip(2))),
    "elf-find-vif-mpg" when args.Length >= 2 => ElfFindVifMpg(args[1]),
    "elf-find-gs-packets" when args.Length >= 2 => ElfFindGsPackets(args[1]),
    "elf-extract-vu1-mpg" when args.Length >= 4 => ElfExtractVu1Mpg(args[1], args[2], args[3]),
    "elf-find-memory-offset" when args.Length >= 4 => ElfFindMemoryOffset(args[1], args[2], args[3]),
    "vu1-disasm" when args.Length >= 4 => Vu1Disasm(args[1], args[2], args[3]),
    "dialogue" when args.Length >= 3 => DialogueSummary(args[1], string.Join(" ", args.Skip(2))),
    "dialogue-bytecode" when args.Length >= 3 => DialogueBytecodeSummary(args[1], string.Join(" ", args.Skip(2))),
    "world-map-svg" when args.Length >= 3 => WorldMapSvg(args[1], args[2]),
    _ => Usage()
};





static int ElfFindGsPackets(string discPath)
{
    using IGameDisc disc = GameDisc.Open(discPath);
    using Stream executable = disc.OpenFile(RtaGameIdentity.ExpectedEuropeanExecutable);
    var elf = new Elf32AddressSpace(executable);
    int matches = 0;
    for (uint address = 0x00100000; address < 0x00400000; address += 16)
    {
        if (!elf.IsFileBacked(address, 16))
            continue;
        byte[] tagBytes = elf.ReadBytes(address, 16);
        ulong low = System.Buffers.Binary.BinaryPrimitives.ReadUInt64LittleEndian(tagBytes.AsSpan(0, 8));
        ulong high = System.Buffers.Binary.BinaryPrimitives.ReadUInt64LittleEndian(tagBytes.AsSpan(8, 8));
        Ps2GifTag tag = Ps2GifTag.FromRawWords(low, high);
        if (tag.Format != 0 || tag.RegisterCount != 1 || tag.GetRegisterDescriptor(0) != 0xE || tag.LoopCount is < 1 or > 32)
            continue;
        int packetBytes = checked(16 + tag.LoopCount * 16);
        if (!elf.IsFileBacked(address, packetBytes))
            continue;
        var writes = new List<(byte Register, ulong Value)>();
        bool valid = true;
        for (int i = 0; i < tag.LoopCount; i++)
        {
            uint pairAddress = checked(address + 16u + (uint)(i * 16));
            byte[] pair = elf.ReadBytes(pairAddress, 16);
            ulong value = System.Buffers.Binary.BinaryPrimitives.ReadUInt64LittleEndian(pair.AsSpan(0, 8));
            ulong registerWord = System.Buffers.Binary.BinaryPrimitives.ReadUInt64LittleEndian(pair.AsSpan(8, 8));
            if ((registerWord & ~0xFFUL) != 0 || (registerWord & 0xFF) > 0x62)
            {
                valid = false;
                break;
            }
            writes.Add(((byte)registerWord, value));
        }
        if (!valid)
            continue;
        Console.WriteLine($"{address:X8}: GIF A+D NLOOP={tag.LoopCount} EOP={(tag.EndOfPacket ? 1 : 0)}");
        foreach ((byte register, ulong value) in writes)
            Console.WriteLine($"  {GsRegisterName(register),-12} [0x{register:X2}] = 0x{value:X16}");
        matches++;
    }
    Console.WriteLine($"Static packed GS A+D packets: {matches}");
    return 0;
}

static string GsRegisterName(byte register) => register switch
{
    0x00 => "PRIM",
    0x06 => "TEX0_1", 0x07 => "TEX0_2",
    0x08 => "CLAMP_1", 0x09 => "CLAMP_2",
    0x14 => "TEX1_1", 0x15 => "TEX1_2",
    0x16 => "TEX2_1", 0x17 => "TEX2_2",
    0x18 => "XYOFFSET_1", 0x19 => "XYOFFSET_2",
    0x1A => "PRMODECONT", 0x1B => "PRMODE", 0x1C => "TEXCLUT",
    0x22 => "SCANMSK",
    0x34 => "MIPTBP1_1", 0x35 => "MIPTBP1_2",
    0x36 => "MIPTBP2_1", 0x37 => "MIPTBP2_2",
    0x3B => "TEXA", 0x3D => "FOGCOL", 0x3F => "TEXFLUSH",
    0x40 => "SCISSOR_1", 0x41 => "SCISSOR_2",
    0x42 => "ALPHA_1", 0x43 => "ALPHA_2",
    0x44 => "DIMX", 0x45 => "DTHE", 0x46 => "COLCLAMP",
    0x47 => "TEST_1", 0x48 => "TEST_2", 0x49 => "PABE",
    0x4A => "FBA_1", 0x4B => "FBA_2",
    0x4C => "FRAME_1", 0x4D => "FRAME_2",
    0x4E => "ZBUF_1", 0x4F => "ZBUF_2",
    _ => $"GS_{register:X2}",
};

static int ElfFindMemoryOffset(string discPath, string minimumText, string maximumText)
{
    using IGameDisc disc = GameDisc.Open(discPath);
    using Stream executable = disc.OpenFile(RtaGameIdentity.ExpectedEuropeanExecutable);
    var elf = new Elf32AddressSpace(executable);
    int minimum = unchecked((short)ParseHexAddress(minimumText));
    int maximum = unchecked((short)ParseHexAddress(maximumText));
    for (uint address = 0x00100000; address < 0x00400000; address += 4)
    {
        if (!elf.IsFileBacked(address, 4)) continue;
        uint word = elf.ReadUInt32(address);
        int opcode = (int)(word >> 26);
        int immediate = unchecked((short)(word & 0xFFFF));
        if (immediate < minimum || immediate > maximum) continue;
        // Common EE scalar/vector loads and stores. This is an archaeology search,
        // so intentionally include both reads and writes around the target offset.
        if (opcode is 0x20 or 0x21 or 0x23 or 0x24 or 0x25 or 0x27 or 0x28 or 0x29 or 0x2B or 0x31 or 0x39 or 0x1E or 0x1F)
            Console.WriteLine($"{address:X8}: {word:X8}  {R5900Disassembler.Disassemble(address, word)}");
    }
    return 0;
}

static int ElfExtractVu1Mpg(string discPath, string addressText, string outputPath)
{
    using IGameDisc disc = GameDisc.Open(discPath);
    using Stream executable = disc.OpenFile(RtaGameIdentity.ExpectedEuropeanExecutable);
    var elf = new Elf32AddressSpace(executable);
    uint cursor = ParseHexAddress(addressText);
    byte[] microMemory = new byte[16 * 1024]; // VU1: 2048 instructions x 8 bytes.
    int packets = 0;
    int writtenInstructions = 0;
    while (elf.IsFileBacked(cursor, 4))
    {
        uint commandWord = elf.ReadUInt32(cursor);
        int command = (int)((commandWord >> 24) & 0x7F);
        if (command != 0x4A)
            break;
        int count = (int)((commandWord >> 16) & 0xFF);
        if (count == 0) count = 256;
        int destination = (int)(commandWord & 0x7FF);
        int destinationBytes = checked(destination * 8);
        int payloadBytes = checked(count * 8);
        if (destinationBytes + payloadBytes > microMemory.Length)
            throw new InvalidDataException($"MPG packet at 0x{cursor:X8} writes outside VU1 micro memory: dest={destination:X3}, count={count}.");
        byte[] payload = elf.ReadBytes(checked(cursor + 4u), payloadBytes);
        payload.CopyTo(microMemory, destinationBytes);
        Console.WriteLine($"0x{cursor:X8}: MPG {count,3} -> micro 0x{destination:X3}..0x{destination + count - 1:X3}");
        packets++;
        writtenInstructions += count;
        cursor = checked(cursor + 4u + (uint)payloadBytes);
        // HG2 aligns the next MPG command to a qword boundary with zero VIF NOP words.
        for (int padding = 0; padding < 3 && elf.IsFileBacked(cursor, 4) && elf.ReadUInt32(cursor) == 0; padding++)
            cursor += 4;
    }
    if (packets == 0)
        throw new InvalidDataException($"No VIF MPG packet found at 0x{ParseHexAddress(addressText):X8}.");
    File.WriteAllBytes(outputPath, microMemory);
    Console.WriteLine($"Wrote {microMemory.Length} bytes ({writtenInstructions} uploaded instructions across {packets} MPG packets) to {outputPath}");
    Console.WriteLine($"Next ELF word after contiguous MPG stream: 0x{cursor:X8}");
    return 0;
}

static int ElfFindVifMpg(string discPath)
{
    using IGameDisc disc = GameDisc.Open(discPath);
    using Stream executable = disc.OpenFile(RtaGameIdentity.ExpectedEuropeanExecutable);
    var elf = new Elf32AddressSpace(executable);
    int matches = 0;
    for (uint address = 0x00100000; address < 0x00400000; address += 4)
    {
        if (!elf.IsFileBacked(address, 4))
            continue;
        uint word = elf.ReadUInt32(address);
        int command = (int)((word >> 24) & 0x7F);
        if (command != 0x4A)
            continue;
        int num = (int)((word >> 16) & 0xFF);
        if (num == 0) num = 256;
        int destination = (int)(word & 0x3FFF);
        bool irq = (word & 0x80000000u) != 0;
        Console.WriteLine($"{address:X8}: {word:X8}  MPG num={num,3} dest={destination:X3}{(irq ? " IRQ" : string.Empty)}");
        matches++;
    }
    Console.WriteLine($"MPG-like aligned words: {matches}");
    return 0;
}

static int ElfFindAscii(string discPath, string text)
{
    using IGameDisc disc = GameDisc.Open(discPath);
    using Stream executable = disc.OpenFile(RtaGameIdentity.ExpectedEuropeanExecutable);
    var elf = new Elf32AddressSpace(executable);
    foreach (uint address in elf.FindBytes(System.Text.Encoding.ASCII.GetBytes(text)))
        Console.WriteLine($"{address:X8}");
    return 0;
}

static int ElfFindAddress(string discPath, string addressText)
{
    using IGameDisc disc = GameDisc.Open(discPath);
    using Stream executable = disc.OpenFile(RtaGameIdentity.ExpectedEuropeanExecutable);
    var elf = new Elf32AddressSpace(executable);
    uint target = ParseHexAddress(addressText);
    ushort low = unchecked((ushort)target);
    ushort adjustedHigh = unchecked((ushort)((target + 0x8000u) >> 16));

    for (uint address = 0x00100000; address < 0x00400000; address += 4)
    {
        if (!elf.IsFileBacked(address, 4))
            continue;
        uint first = elf.ReadUInt32(address);
        if ((first >> 26) != 0x0F || unchecked((ushort)first) != adjustedHigh)
            continue;

        int baseRegister = (int)((first >> 16) & 31);
        for (int lookahead = 1; lookahead <= 6; lookahead++)
        {
            uint useAddress = checked(address + (uint)(lookahead * 4));
            if (!elf.IsFileBacked(useAddress, 4))
                break;
            uint use = elf.ReadUInt32(useAddress);
            int op = (int)(use >> 26);
            int rs = (int)((use >> 21) & 31);
            if (rs != baseRegister || unchecked((ushort)use) != low || op is not (0x09 or 0x0D))
                continue;

            Console.WriteLine($"{address:X8}: {first:X8}  {R5900Disassembler.Disassemble(address, first)}");
            Console.WriteLine($"{useAddress:X8}: {use:X8}  {R5900Disassembler.Disassemble(useAddress, use)}");
            Console.WriteLine();
        }
    }
    return 0;
}

static int Vu1Disasm(string microMemoryPath, string instructionText, string countText)
{
    byte[] microMemory = File.ReadAllBytes(microMemoryPath);
    int start = checked((int)ParseHexAddress(instructionText));
    int count = int.Parse(countText);
    if (start < 0 || count < 0 || checked((start + count) * 8) > microMemory.Length)
        throw new ArgumentOutOfRangeException(nameof(instructionText), "VU1 instruction range lies outside micro memory.");

    for (int i = start; i < start + count; i++)
    {
        int offset = i * 8;
        uint lower = System.Buffers.Binary.BinaryPrimitives.ReadUInt32LittleEndian(microMemory.AsSpan(offset, 4));
        uint upper = System.Buffers.Binary.BinaryPrimitives.ReadUInt32LittleEndian(microMemory.AsSpan(offset + 4, 4));
        Console.WriteLine($"{i:X4}: {lower:X8} {upper:X8}  {VuMicroDisassembler.DisassemblePair(i, lower, upper)}");
    }
    return 0;
}

static int ElfDisasm(string discPath, string addressText, string countText)
{
    using IGameDisc disc = GameDisc.Open(discPath);
    using Stream executable = disc.OpenFile(RtaGameIdentity.ExpectedEuropeanExecutable);
    var elf = new Elf32AddressSpace(executable);
    uint address = ParseHexAddress(addressText);
    int count = int.Parse(countText);
    for (int i = 0; i < count; i++)
    {
        uint current = checked(address + (uint)(i * 4));
        uint word = elf.ReadUInt32(current);
        Console.WriteLine($"{current:X8}: {word:X8}  {R5900Disassembler.Disassemble(current, word)}");
    }
    return 0;
}

static int ElfFindVector4(string discPath, string aText, string bText, string cText, string dText)
{
    using IGameDisc disc = GameDisc.Open(discPath);
    using Stream executable = disc.OpenFile(RtaGameIdentity.ExpectedEuropeanExecutable);
    var elf = new Elf32AddressSpace(executable);
    uint[] words = new[] { aText, bText, cText, dText }.Select(text => Convert.ToUInt32(text.StartsWith("0x", StringComparison.OrdinalIgnoreCase) ? text[2..] : text, 16)).ToArray();
    for (uint address = 0x00100000; address < 0x00400000; address += 4)
    {
        if (!elf.IsFileBacked(address, 16)) continue;
        if (elf.ReadUInt32(address) == words[0] && elf.ReadUInt32(address + 4) == words[1] && elf.ReadUInt32(address + 8) == words[2] && elf.ReadUInt32(address + 12) == words[3])
            Console.WriteLine($"{address:X8}");
    }
    return 0;
}

static int ElfFindWord(string discPath, string wordText)
{
    using IGameDisc disc = GameDisc.Open(discPath);
    using Stream executable = disc.OpenFile(RtaGameIdentity.ExpectedEuropeanExecutable);
    var elf = new Elf32AddressSpace(executable);
    uint word = Convert.ToUInt32(wordText.StartsWith("0x", StringComparison.OrdinalIgnoreCase) ? wordText[2..] : wordText, 16);
    for (uint address = 0x00100000; address < 0x00400000; address += 4)
    {
        if (elf.IsFileBacked(address, 4) && elf.ReadUInt32(address) == word)
            Console.WriteLine($"{address:X8}");
    }
    return 0;
}

static int ElfWords(string discPath, string addressText, string countText)
{
    using IGameDisc disc = GameDisc.Open(discPath);
    using Stream executable = disc.OpenFile(RtaGameIdentity.ExpectedEuropeanExecutable);
    var elf = new Elf32AddressSpace(executable);
    uint address = ParseHexAddress(addressText);
    int count = int.Parse(countText);
    for (int i = 0; i < count; i++)
    {
        uint current = checked(address + (uint)(i * 4));
        Console.WriteLine($"{current:X8}: {elf.ReadUInt32(current):X8}");
    }
    return 0;
}

static uint ParseHexAddress(string text) =>
    Convert.ToUInt32(text.StartsWith("0x", StringComparison.OrdinalIgnoreCase) ? text[2..] : text, 16);

static int CarSummary(string discPath, string carText)
{
    using IGameDisc disc = GameDisc.Open(discPath);
    string carId = carText.StartsWith("Q", StringComparison.OrdinalIgnoreCase)
        ? carText.ToUpperInvariant()
        : $"Q{int.Parse(carText):00}";
    using Stream stream = disc.OpenFile($"CAR0/{carId}.BIN");
    CarFileHeader header = CarFile.ReadHeader(stream);
    IReadOnlyList<CarRenderPrimitive> primitives = CarRenderPrimitiveReader.ReadPrimaryBody(stream, header);
    CarRenderVertex[] vertices = primitives.SelectMany(primitive => primitive.Vertices).ToArray();

    Console.WriteLine($"{carId}: {primitives.Count:N0} primary-body primitives, {vertices.Length:N0} source vertices");
    foreach (var group in primitives.GroupBy(primitive => (primitive.VuProgram, primitive.ColorSelection)).OrderBy(group => group.Key.VuProgram).ThenBy(group => group.Key.ColorSelection))
    {
        CarRenderVertex[] members = group.SelectMany(primitive => primitive.Vertices).ToArray();
        Console.WriteLine(
            $"  MSCALF {group.Key.VuProgram,2}, colour {group.Key.ColorSelection,3}: " +
            $"{group.Count(),3} primitives, {members.Length,4} vertices, " +
            $"normal {VectorRange(members.Select(vertex => vertex.Normal))}, " +
            $"colour {VectorRange(members.Select(vertex => vertex.Color))}, " +
            $"surface {ScalarRange(members.Select(vertex => vertex.SurfaceParameter))}");
    }

    return 0;
}

static string VectorRange(IEnumerable<System.Numerics.Vector3> values)
{
    System.Numerics.Vector3[] data = values.ToArray();
    var minimum = new System.Numerics.Vector3(data.Min(value => value.X), data.Min(value => value.Y), data.Min(value => value.Z));
    var maximum = new System.Numerics.Vector3(data.Max(value => value.X), data.Max(value => value.Y), data.Max(value => value.Z));
    return $"{minimum}..{maximum}";
}

static string ScalarRange(IEnumerable<float> values)
{
    float[] data = values.ToArray();
    return $"{data.Min():G6}..{data.Max():G6}";
}

static int Inspect(string discPath)
{
    using IGameDisc disc = GameDisc.Open(discPath);
    RtaGameIdentity identity = RtaGameIdentity.Read(disc);

    Console.WriteLine($"Source : {disc.Description}");
    Console.WriteLine($"Boot   : {identity.BootExecutable}");
    Console.WriteLine($"Version: {identity.Version}");
    Console.WriteLine($"Video  : {identity.VideoMode}");
    Console.WriteLine($"PAL RTA: {(identity.IsSupportedEuropeanRelease ? "yes" : "NO / UNKNOWN")}");
    Console.WriteLine();
    return PrintField(disc, "223");
}

static int InspectField(string discPath, string fieldText)
{
    using IGameDisc disc = GameDisc.Open(discPath);
    return PrintField(disc, NormalizeField(fieldText));
}

static int PrintField(IGameDisc disc, string fieldId)
{
    string path = $"FLD/{fieldId}.BIN";
    if (!disc.FileExists(path))
    {
        Console.Error.WriteLine($"Field file {path} does not exist.");
        return 2;
    }

    using Stream stream = disc.OpenFile(path);
    FieldHeader header = FieldFile.ReadHeader(stream);
    Console.WriteLine($"{path}: {stream.Length:N0} bytes");
    Console.WriteLine($"Header : {header.HeaderLength} bytes, {header.Offsets.Count} offsets including EOF");
    foreach (FieldSectionDiagnostic diagnostic in FieldDiagnostics.ReadSectionSignatures(stream, header))
        Console.WriteLine($"  {diagnostic.Section,-52} signature=0x{diagnostic.Signature:X8}");

    FieldChunkDirectory meshChunks = FieldChunkDirectory.ReadRenderMeshes(stream, header);
    FieldChunkDirectory collisionChunks = FieldChunkDirectory.ReadCollision(stream, header);
    Console.WriteLine();
    Console.WriteLine($"Render chunks   : {meshChunks.GridSize}x{meshChunks.GridSize} + global, data @ +0x{meshChunks.DataOffset:X}");
    Console.WriteLine($"Collision chunks: {collisionChunks.GridSize}x{collisionChunks.GridSize}, data @ +0x{collisionChunks.DataOffset:X}");

    Ps2DmaTag firstDma = FieldDiagnostics.ReadFirstTextureDmaTag(stream, header);
    Console.WriteLine();
    Console.WriteLine($"First texture DMA tag: ID={firstDma.Id}, QWC={firstDma.QuadwordCount}, inlineBytes={firstDma.InlinePayloadBytes}, IRQ={firstDma.Interrupt}");
    Console.WriteLine($"  VIF0=0x{firstDma.VifCode0:X8} VIF1=0x{firstDma.VifCode1:X8}");
    return 0;
}



static int MeshSummary(string discPath, string fieldText)
{
    using IGameDisc disc = GameDisc.Open(discPath);
    string fieldId = NormalizeField(fieldText);
    using Stream stream = disc.OpenFile($"FLD/{fieldId}.BIN");
    FieldHeader header = FieldFile.ReadHeader(stream);
    IReadOnlyList<FieldRenderPrimitive> primitives = FieldRenderPrimitiveReader.ReadAllPrimitives(stream, header);

    int vertices = primitives.Sum(p => p.Vertices.Count);
    int triangles = primitives.Sum(p => p.PrimitiveType == 4 ? Math.Max(0, p.Vertices.Count - 2) : 0);
    var positions = primitives.SelectMany(p => p.Vertices).Select(v => v.Position).ToArray();
    var min = new System.Numerics.Vector3(positions.Min(v => v.X), positions.Min(v => v.Y), positions.Min(v => v.Z));
    var max = new System.Numerics.Vector3(positions.Max(v => v.X), positions.Max(v => v.Y), positions.Max(v => v.Z));

    Console.WriteLine($"Spatial primitives: {primitives.Count:N0}");
    Console.WriteLine($"Vertices          : {vertices:N0}");
    Console.WriteLine($"Triangle-strip tris: {triangles:N0}");
    Console.WriteLine($"Bounds min       : {min}");
    Console.WriteLine($"Bounds max       : {max}");
    var colors = primitives.SelectMany(p => p.Vertices).Select(v => v.DayColor).ToArray();
    var cmin = new System.Numerics.Vector3(colors.Min(v => v.X), colors.Min(v => v.Y), colors.Min(v => v.Z));
    var cmax = new System.Numerics.Vector3(colors.Max(v => v.X), colors.Max(v => v.Y), colors.Max(v => v.Z));
    Console.WriteLine($"Day color min    : {cmin}");
    Console.WriteLine($"Day color max    : {cmax}");
    foreach (var group in primitives.GroupBy(p => p.PrimitiveType).OrderBy(g => g.Key))
        Console.WriteLine($"PRIM {group.Key}: {group.Count():N0} primitives");

    IReadOnlyDictionary<ushort, FieldTextureUpload> uploads = FieldTextureUploadReader.ReadUploads(stream, header);
    Console.WriteLine();
    Console.WriteLine($"Material groups    : {primitives.Select(p => p.Material).Distinct().Count():N0}");
    int contiguousRuns = 0;
    string? previousRunKey = null;
    foreach (FieldRenderPrimitive primitive in primitives)
    {
        string key = $"{primitive.ChunkIndex}:{primitive.TextureMappingEnabled}:{primitive.Material.GetHashCode()}:{primitive.PlacementOffset is not null}";
        if (key == previousRunKey) continue;
        contiguousRuns++;
        previousRunKey = key;
    }
    Console.WriteLine($"Contiguous material runs: {contiguousRuns:N0}");
    foreach (var group in primitives.GroupBy(p => p.Material.Tex0.PixelStorageFormat).OrderBy(g => (byte)g.Key))
    {
        var groupPositions = group.SelectMany(p => p.Vertices).Select(v => v.Position).ToArray();
        var groupMin = new System.Numerics.Vector3(groupPositions.Min(v => v.X), groupPositions.Min(v => v.Y), groupPositions.Min(v => v.Z));
        var groupMax = new System.Numerics.Vector3(groupPositions.Max(v => v.X), groupPositions.Max(v => v.Y), groupPositions.Max(v => v.Z));
        Console.WriteLine($"  PSM 0x{(byte)group.Key:X2}: {group.Count():N0} primitives, {group.Select(p => p.Material.Tex0.TextureBasePointer).Distinct().Count():N0} TBPs, bounds {groupMin}..{groupMax}");
        foreach (var tbpGroup in group.GroupBy(p => p.Material.Tex0.TextureBasePointer).OrderByDescending(g => g.Count()).Take(8))
            Console.WriteLine($"      TBP {tbpGroup.Key}: {tbpGroup.Count():N0} primitives, TEX {tbpGroup.First().Material.Tex0.Width}x{tbpGroup.First().Material.Tex0.Height}, CLUT {tbpGroup.First().Material.Tex0.ClutBasePointer}");
    }
    var missing = primitives
        .Select(p => p.Material.Tex0.TextureBasePointer)
        .Distinct()
        .Where(tbp => !uploads.ContainsKey(tbp))
        .OrderBy(tbp => tbp)
        .ToArray();
    Console.WriteLine($"Missing texture TBPs: {missing.Length:N0}{(missing.Length == 0 ? string.Empty : " -> " + string.Join(", ", missing))}");
    var referencedAddresses = primitives
        .SelectMany(p => new[] { p.Material.Tex0.TextureBasePointer, p.Material.Tex0.ClutBasePointer })
        .ToHashSet();
    var unreferencedImages = uploads.Values
        .Where(u => !referencedAddresses.Contains(u.DestinationBasePointer))
        .Where(u => u.DestinationPixelStorageFormat is GsPixelStorageFormat.PsmCt24 or GsPixelStorageFormat.PsmT8 or GsPixelStorageFormat.PsmT4)
        .Where(u => u.Width >= 32 && u.Height >= 16)
        .OrderByDescending(u => u.Width * u.Height)
        .ToArray();
    Console.WriteLine($"Unreferenced image-like uploads: {unreferencedImages.Length:N0}");
    foreach (var upload in unreferencedImages.Take(30))
        Console.WriteLine($"  upload TBP {upload.DestinationBasePointer}: PSM 0x{(byte)upload.DestinationPixelStorageFormat:X2} {upload.Width}x{upload.Height}, {upload.Data.Length:N0} bytes");
    foreach (var group in primitives.GroupBy(p => p.Material.Tex0.TextureFunction).OrderBy(g => g.Key))
        Console.WriteLine($"TFX {group.Key}: {group.Count():N0} primitives");
    foreach (var group in primitives.GroupBy(p => p.Material.Tex0.RgbaColorComponent).OrderBy(g => g.Key))
        Console.WriteLine($"TCC {(group.Key ? 1 : 0)}: {group.Count():N0} primitives");
    foreach (var group in primitives.GroupBy(p => p.TextureMappingEnabled).OrderBy(g => g.Key))
        Console.WriteLine($"TME {(group.Key ? 1 : 0)}: {group.Count():N0} primitives");
    foreach (var group in primitives.GroupBy(p => p.Material.MaterialGifTag).OrderByDescending(g => g.Count()).Take(12))
        Console.WriteLine($"MAT_GIFTAG NLOOP={group.Key.LoopCount} EOP={(group.Key.EndOfPacket ? 1 : 0)} FLG={group.Key.Format} NREG={group.Key.RegisterCount} REG0=0x{group.Key.GetRegisterDescriptor(0):X}: {group.Count():N0} primitives");
    foreach (var group in primitives.GroupBy(p => p.Material.Tex1).OrderByDescending(g => g.Count()).Take(12))
    {
        ulong tex1 = group.Key;
        int mmag = (int)((tex1 >> 5) & 0x1);
        int mmin = (int)((tex1 >> 6) & 0x7);
        int mxl = (int)((tex1 >> 2) & 0x7);
        Console.WriteLine($"TEX1 0x{tex1:X16}: {group.Count():N0} primitives, MMAG={mmag}, MMIN={mmin}, MXL={mxl}");
    }
    foreach (var group in primitives.GroupBy(p => (p.Material.Clamp.WrapModeS, p.Material.Clamp.WrapModeT)).OrderBy(g => g.Key.WrapModeS).ThenBy(g => g.Key.WrapModeT))
        Console.WriteLine($"CLAMP WMS={group.Key.WrapModeS} WMT={group.Key.WrapModeT}: {group.Count():N0} primitives");

    var globalPrimitives = primitives.Where(p => p.PlacementOffset is not null).ToArray();
    Console.WriteLine($"Global primitives   : {globalPrimitives.Length:N0}");
    foreach (var group in globalPrimitives.GroupBy(p => (p.Material.Tex0.TextureBasePointer, p.Material.Tex0.ClutBasePointer, p.Material.Tex0.PixelStorageFormat)).OrderByDescending(g => g.Count()))
        Console.WriteLine($"  global TBP {group.Key.TextureBasePointer}, CLUT {group.Key.ClutBasePointer}, PSM 0x{(byte)group.Key.PixelStorageFormat:X2}: {group.Count():N0}");
    if (globalPrimitives.Length > 0)
    {
        Console.WriteLine("First global primitive:");
        foreach (var vertex in globalPrimitives[0].Vertices)
            Console.WriteLine($"  pos={vertex.Position} unk={vertex.UnknownVector} uvq={vertex.TextureCoordinate}");
    }

    FieldRenderPrimitive first = primitives[0];
    Console.WriteLine();
    Console.WriteLine($"First primitive: chunk {first.ChunkIndex}, NLOOP={first.GifTag.LoopCount}, PRIM={first.GifTag.Primitive} type={first.PrimitiveType}");
    Console.WriteLine($"  GIF FLG={first.GifTag.Format} NREG={first.GifTag.RegisterCount} REGS=0x{first.GifTag.Registers:X16} descriptors={string.Join(',', Enumerable.Range(0, first.GifTag.RegisterCount).Select(first.GifTag.GetRegisterDescriptor).Select(value => $"0x{value:X}"))}");
    foreach (FieldRenderVertex vertex in first.Vertices)
        Console.WriteLine($"  pos={vertex.Position} day={vertex.DayColor} uvq={vertex.TextureCoordinate}");
    return 0;
}

static int WorldMeshSummary(string discPath)
{
    using IGameDisc disc = GameDisc.Open(discPath);
    long primitiveTotal = 0;
    long rawTriangleTotal = 0;
    long daytimeTriangleTotal = 0;
    var textureFunctions = new Dictionary<byte, long>();
    var textureComponents = new Dictionary<bool, long>();
    var textureMapping = new Dictionary<bool, long>();
    var alphaBlendEnabled = new Dictionary<bool, long>();
    var fogEnabled = new Dictionary<bool, long>();
    var contexts = new Dictionary<int, long>();
    foreach (int fieldNumber in WorldSectorTopology.AllFieldNumbers)
    {
        using Stream stream = disc.OpenFile($"FLD/{fieldNumber:D3}.BIN");
        FieldHeader header = FieldFile.ReadHeader(stream);
        IReadOnlyList<FieldRenderPrimitive> primitives = FieldRenderPrimitiveReader.ReadAllPrimitives(stream, header);
        int rawTriangles = primitives.Sum(primitive => primitive.PrimitiveType == 4 ? Math.Max(0, primitive.Vertices.Count - 2) : 0);
        int daytimeTriangles = primitives
            .Where(primitive => primitive.PrimitiveType == 4 && !primitive.IsNightLightBillboard)
            .Sum(primitive => Math.Max(0, primitive.Vertices.Count - 2));
        primitiveTotal += primitives.Count;
        rawTriangleTotal += rawTriangles;
        daytimeTriangleTotal += daytimeTriangles;
        foreach (var group in primitives.GroupBy(p => p.Material.Tex0.TextureFunction))
            textureFunctions[group.Key] = textureFunctions.GetValueOrDefault(group.Key) + group.LongCount();
        foreach (var group in primitives.GroupBy(p => p.Material.Tex0.RgbaColorComponent))
            textureComponents[group.Key] = textureComponents.GetValueOrDefault(group.Key) + group.LongCount();
        foreach (var group in primitives.GroupBy(p => p.TextureMappingEnabled))
            textureMapping[group.Key] = textureMapping.GetValueOrDefault(group.Key) + group.LongCount();
        foreach (var group in primitives.GroupBy(p => (p.GifTag.Primitive & 0x40) != 0))
            alphaBlendEnabled[group.Key] = alphaBlendEnabled.GetValueOrDefault(group.Key) + group.LongCount();
        foreach (var group in primitives.GroupBy(p => (p.GifTag.Primitive & 0x20) != 0))
            fogEnabled[group.Key] = fogEnabled.GetValueOrDefault(group.Key) + group.LongCount();
        foreach (var group in primitives.GroupBy(p => (p.GifTag.Primitive >> 9) & 1))
            contexts[group.Key] = contexts.GetValueOrDefault(group.Key) + group.LongCount();
        Console.WriteLine($"FLD/{fieldNumber:D3}: {primitives.Count,6:N0} strips | {daytimeTriangles,7:N0} daytime triangles");
    }
    Console.WriteLine();
    Console.WriteLine($"World: {primitiveTotal:N0} strips | {rawTriangleTotal:N0} decoded triangles | {daytimeTriangleTotal:N0} daytime triangles");
    foreach (var pair in textureFunctions.OrderBy(p => p.Key))
        Console.WriteLine($"World TFX {pair.Key}: {pair.Value:N0} primitives");
    foreach (var pair in textureComponents.OrderBy(p => p.Key))
        Console.WriteLine($"World TCC {(pair.Key ? 1 : 0)}: {pair.Value:N0} primitives");
    foreach (var pair in textureMapping.OrderBy(p => p.Key))
        Console.WriteLine($"World TME {(pair.Key ? 1 : 0)}: {pair.Value:N0} primitives");
    foreach (var pair in alphaBlendEnabled.OrderBy(p => p.Key))
        Console.WriteLine($"World ABE {(pair.Key ? 1 : 0)}: {pair.Value:N0} primitives");
    foreach (var pair in fogEnabled.OrderBy(p => p.Key))
        Console.WriteLine($"World FGE {(pair.Key ? 1 : 0)}: {pair.Value:N0} primitives");
    foreach (var pair in contexts.OrderBy(p => p.Key))
        Console.WriteLine($"World CTXT {pair.Key}: {pair.Value:N0} primitives");
    return 0;
}

static int FieldVifInputs(string discPath, string fieldText)
{
    using IGameDisc disc = GameDisc.Open(discPath);
    string fieldId = NormalizeField(fieldText);
    using Stream stream = disc.OpenFile($"FLD/{fieldId}.BIN");
    FieldHeader header = FieldFile.ReadHeader(stream);
    FieldChunkDirectory chunks = FieldChunkDirectory.ReadRenderMeshes(stream, header);
    var dests = new Dictionary<int, int>();
    var gifDests = new Dictionary<int, int>();
    var materialDests = new Dictionary<int, int>();
    var examples = new List<string>();
    int meshCount = 0;
    int memory20Branch = 0;
    int memory21Branch = 0;

    foreach (FieldChunk chunk in chunks.Chunks)
    {
        long chainStart = checked((long)header.RenderMeshes.Offset + chunk.RelativeOffset);
        Ps2DmaChain chain = Ps2DmaChain.ReadInline(stream, chainStart, chunk.Length);
        foreach (Ps2DmaPacket packet in chain.Packets.Where(p => p.Tag.Id == Ps2DmaTagId.Cnt))
        {
            long tagOffset = checked(chainStart + packet.RelativeOffset);
            long payloadOffset = checked(tagOffset + 16);
            Ps2VifStream vif = Ps2VifStream.ReadPacket(stream, tagOffset, packet.Tag);
            for (int i = 0; i + 2 < vif.Instructions.Count; i++)
            {
                Ps2VifInstruction gif = vif.Instructions[i];
                Ps2VifInstruction verts = vif.Instructions[i + 1];
                Ps2VifInstruction exec = vif.Instructions[i + 2];
                if (gif.Kind != Ps2VifCommandKind.Unpack || gif.Code.Command != 0x6C ||
                    verts.Kind != Ps2VifCommandKind.Unpack || verts.Code.Command != 0x68 ||
                    exec.Kind != Ps2VifCommandKind.Mscalf || exec.Code.Immediate != 8)
                    continue;

                int gifDest = gif.Code.Immediate & 0x3FF;
                int vertDest = verts.Code.Immediate & 0x3FF;
                gifDests[gifDest] = gifDests.GetValueOrDefault(gifDest) + 1;
                dests[vertDest] = dests.GetValueOrDefault(vertDest) + 1;
                meshCount++;
                long gifData = payloadOffset + gif.DataOffset;
                stream.Position = gifData;
                byte[] gifBytes = new byte[16];
                stream.ReadExactly(gifBytes);
                ulong gifLow = System.Buffers.Binary.BinaryPrimitives.ReadUInt64LittleEndian(gifBytes[..8]);
                ulong gifHigh = System.Buffers.Binary.BinaryPrimitives.ReadUInt64LittleEndian(gifBytes[8..]);
                uint gifTagY = (uint)(gifLow >> 32);
                bool selectsMemory21 = (gifTagY & 2) != 0;
                if (selectsMemory21) memory21Branch++; else memory20Branch++;
                if (examples.Count < 20)
                {
                    Ps2GifTag tag = Ps2GifTag.FromRawWords(gifLow, gifHigh);
                    examples.Add($"chunk {chunk.Index:D2} gifDest={gifDest} vertDest={vertDest} tagY=0x{gifTagY:X8} bit1={selectsMemory21} gifRaw=0x{gif.Raw:X8} vertRaw=0x{verts.Raw:X8} NLOOP={tag.LoopCount} PRIM=0x{tag.Primitive:X3}");
                }
            }
            foreach (Ps2VifInstruction instruction in vif.Instructions)
            {
                if (instruction.Kind == Ps2VifCommandKind.Unpack && instruction.Code.Command == 0x68 && instruction.Code.Count is 4 or 5)
                {
                    int dest = instruction.Code.Immediate & 0x3FF;
                    materialDests[dest] = materialDests.GetValueOrDefault(dest) + 1;
                }
            }
        }
    }

    Console.WriteLine($"FLD/{fieldId}: {meshCount:N0} MSCALF-8 mesh submissions");
    Console.WriteLine($"VU limit/profile branch: memory20={memory20Branch:N0}, memory21={memory21Branch:N0}");
    Console.WriteLine("GIF UNPACK destinations: " + string.Join(", ", gifDests.OrderBy(p => p.Key).Select(p => $"{p.Key}:{p.Value:N0}")));
    Console.WriteLine("Vertex UNPACK destinations: " + string.Join(", ", dests.OrderBy(p => p.Key).Select(p => $"{p.Key}:{p.Value:N0}")));
    Console.WriteLine("Material V3 UNPACK destinations: " + string.Join(", ", materialDests.OrderBy(p => p.Key).Select(p => $"{p.Key}:{p.Value:N0}")));
    foreach (string example in examples) Console.WriteLine(example);
    return 0;
}

static int VifSummary(string discPath, string fieldText)
{
    using IGameDisc disc = GameDisc.Open(discPath);
    string fieldId = NormalizeField(fieldText);
    using Stream stream = disc.OpenFile($"FLD/{fieldId}.BIN");
    FieldHeader header = FieldFile.ReadHeader(stream);
    FieldChunkDirectory chunks = FieldChunkDirectory.ReadRenderMeshes(stream, header);

    var patterns = new Dictionary<string, (int Count, List<string> Examples)>();
    foreach (FieldChunk chunk in chunks.Chunks)
    {
        long chainStart = header.RenderMeshes.Offset + chunk.RelativeOffset;
        Ps2DmaChain chain = Ps2DmaChain.ReadInline(stream, chainStart, chunk.Length);
        int packetIndex = 0;
        foreach (Ps2DmaPacket packet in chain.Packets.Where(p => p.Tag.Id == Ps2DmaTagId.Cnt))
        {
            Ps2VifStream vif = Ps2VifStream.ReadPacket(stream, chainStart + packet.RelativeOffset, packet.Tag);
            string pattern = string.Join(" ", vif.Instructions.Select(i =>
                i.Kind == Ps2VifCommandKind.Unpack
                    ? $"U{i.Code.Command:X2}x{i.Code.Count}"
                    : i.Kind is Ps2VifCommandKind.Mscal or Ps2VifCommandKind.Mscalf
                        ? $"{i.Kind}({i.Code.Immediate})"
                        : i.Kind.ToString()));
            string example = $"chunk {chunk.Index:D2} ({chunk.X},{chunk.Z}) packet {packetIndex} +0x{packet.RelativeOffset:X} qwc={packet.Tag.QuadwordCount}";
            if (!patterns.TryGetValue(pattern, out var value))
                value = (0, new List<string>());
            value.Count++;
            if (value.Examples.Count < 3) value.Examples.Add(example);
            patterns[pattern] = value;
            packetIndex++;
        }
    }

    foreach (var pair in patterns.OrderByDescending(p => p.Value.Count))
    {
        Console.WriteLine($"{pair.Value.Count,3} x {pair.Key}");
        foreach (string example in pair.Value.Examples) Console.WriteLine($"      {example}");
    }
    return 0;
}


static int WorldMapSvg(string discPath, string outputPath)
{
    using IGameDisc disc = GameDisc.Open(discPath);
    var svg = new System.Text.StringBuilder();
    float width = WorldSectorCartography.MapWidth;
    float height = WorldSectorCartography.MapHeight;
    svg.AppendLine($"<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 {width:0} {height:0}\" width=\"{width:0}\" height=\"{height:0}\">");
    svg.AppendLine("<rect width=\"100%\" height=\"100%\" fill=\"#171a1f\"/>");
    svg.AppendLine("<g fill=\"none\" stroke-linejoin=\"round\" stroke-linecap=\"round\">");

    foreach (int fieldNumber in WorldSectorTopology.AllFieldNumbers)
    {
        using Stream field = disc.OpenFile($"FLD/{fieldNumber:D3}.BIN");
        FieldHeader header = FieldFile.ReadHeader(field);
        IReadOnlyList<FieldMinimapPrimitive> primitives = FieldMinimapReader.Read(field, header);
        foreach (FieldMinimapPrimitive primitive in primitives)
        {
            if (primitive.Vertices.Count < 2)
                continue;
            System.Numerics.Vector3 color = primitive.Vertices[0].Color;
            int r = Math.Clamp((int)MathF.Round(color.X), 0, 255);
            int g = Math.Clamp((int)MathF.Round(color.Y), 0, 255);
            int b = Math.Clamp((int)MathF.Round(color.Z), 0, 255);
            svg.Append($"<polyline stroke=\"rgb({r},{g},{b})\" stroke-width=\"3\" points=\"");
            foreach (FieldMinimapVertex vertex in primitive.Vertices)
            {
                System.Numerics.Vector2 map = WorldSectorCartography.ToMapPosition(
                    fieldNumber,
                    new System.Numerics.Vector2(vertex.Position.X, vertex.Position.Z));
                svg.Append(System.FormattableString.Invariant($"{map.X:0.###},{map.Y:0.###} "));
            }
            svg.AppendLine("\"/>");
        }
    }
    svg.AppendLine("</g>");

    var labels = new Dictionary<int, string>
    {
        [233] = "Papaya Island",
        [203] = "White Mountain",
        [223] = "Peach Town",
        [113] = "Fuji City",
        [013] = "Sandpolis",
        [103] = "Chestnut Canyon",
        [210] = "Mushroom Road",
        [023] = "My City",
        [220] = "Bridge"
    };
    svg.AppendLine("<g font-family=\"sans-serif\" font-size=\"72\" fill=\"white\" stroke=\"black\" stroke-width=\"10\" paint-order=\"stroke\">");
    foreach ((int fieldNumber, string label) in labels)
    {
        System.Numerics.Vector2 centre = WorldSectorCartography.SectorCenter(fieldNumber);
        svg.AppendLine(System.FormattableString.Invariant($"<text x=\"{centre.X:0.###}\" y=\"{centre.Y:0.###}\" text-anchor=\"middle\">{label} ({fieldNumber:D3})</text>"));
    }
    svg.AppendLine("</g>");
    svg.AppendLine("</svg>");

    File.WriteAllText(outputPath, svg.ToString());
    Console.WriteLine($"Wrote canonical HG2 world-map diagnostic: {outputPath}");
    Console.WriteLine("Cartographic orientation is source-space (not MonoGame-reflected); fixed cut starts at storage column 7.");
    return 0;
}

static int DialogueSummary(string discPath, string entityName)
{
    using IGameDisc disc = GameDisc.Open(discPath);
    using Stream executable = disc.OpenFile(RtaGameIdentity.ExpectedEuropeanExecutable);
    PalDialogueEntity entity = PalDialogueDatabase.ReadPeachTownEntity(executable, entityName);
    Console.WriteLine($"Peach Town dialogue entity {entity.EntityIndex}: {entity.Name} @ 0x{entity.EntityAddress:X8}");
    for (int i = 0; i < entity.Variants.Count; i++)
    {
        PalDialogueVariant variant = entity.Variants[i];
        Console.WriteLine($"[slot {variant.PointerTableSlot:X2}] 0x{variant.TextAddress:X8}: {EscapeControls(variant.RawText)}");
    }
    return 0;
}

static int DialogueBytecodeSummary(string discPath, string entityName)
{
    using IGameDisc disc = GameDisc.Open(discPath);
    using Stream executable = disc.OpenFile(RtaGameIdentity.ExpectedEuropeanExecutable);
    PalDialogueEntity entity = PalDialogueDatabase.ReadPeachTownEntity(executable, entityName);
    Console.WriteLine($"Peach Town dialogue entity {entity.EntityIndex}: {entity.Name} @ 0x{entity.EntityAddress:X8}");
    Console.WriteLine($"Variants: {entity.Variants.Count}; pre-text dispatcher 0x{PalDialogueBytecode.PreTextDispatcherAddress:X8}; action dispatcher 0x{PalDialogueBytecode.ActionDispatcherAddress:X8}");
    foreach (PalDialogueVariant variant in entity.Variants)
    {
        Console.WriteLine();
        Console.WriteLine($"slot {variant.PointerTableSlot:X2} @ 0x{variant.TextAddress:X8}");
        foreach (PalDialogueToken token in variant.Tokens)
        {
            switch (token)
            {
                case PalDialogueTextToken text:
                    Console.WriteLine($"  +0x{text.Offset:X3} TEXT {EscapeControls(text.Text)}");
                    break;
                case PalDialogueControlToken control:
                    string operands = control.Operands.Count == 0
                        ? string.Empty
                        : " " + string.Join(" ", control.Operands.Select(value => value.ToString("X2")));
                    Console.WriteLine($"  +0x{control.Offset:X3} {control.Phase,-10} {((byte)control.Opcode):X2} {control.Opcode}{operands}");
                    break;
                case PalDialogueActionToken action:
                    string actionOperands = action.Operands.Count == 0
                        ? string.Empty
                        : " " + string.Join(" ", action.Operands.Select(value => value.ToString("X2")));
                    Console.WriteLine($"  +0x{action.Offset:X3} ACTION     {((byte)action.Opcode):X2} {action.Opcode}{actionOperands}");
                    break;
                case PalDialogueMenuToken menu:
                    Console.WriteLine($"  +0x{menu.Offset:X3} ACTION     09 Menu ({menu.Options.Count} options)");
                    foreach (PalDialogueMenuOption option in menu.Options)
                    {
                        string prefix = option.Bytes.Count > 0 && option.Bytes[0] < 0x20
                            ? $" prefix={option.Bytes[0]:X2}"
                            : string.Empty;
                        Console.WriteLine($"                 {EscapeControls(option.Text)} -> slot {option.TargetSlot:X2}{prefix}");
                    }
                    break;
            }
        }
    }
    return 0;
}

static string EscapeControls(string text)
{
    var output = new System.Text.StringBuilder();
    foreach (char ch in text)
    {
        if (ch == '\f') output.Append("<PAGE>");
        else if (ch == '\n') output.Append("\\n");
        else if (ch == '\r') output.Append("\\r");
        else if (ch == '\t') output.Append("<TAB>");
        else if (ch < ' ') output.Append($"<{(int)ch:X2}>");
        else output.Append(ch);
    }
    return output.ToString();
}

static string NormalizeField(string value)
{
    if (!int.TryParse(value, out int field) || field is < 0 or > 999)
        throw new ArgumentException("Field must be a number from 000 to 999.", nameof(value));
    return field.ToString("D3");
}

static int Usage()
{
    Console.WriteLine("Road Trip Adventure inspection tools");
    Console.WriteLine("  Rta.Tools inspect <disc.cue|disc.bin|disc.iso|directory>");
    Console.WriteLine("  Rta.Tools field       <disc.cue|disc.bin|disc.iso|directory> <field-number>");
    Console.WriteLine("  Rta.Tools vif-summary <disc.cue|disc.bin|disc.iso|directory> <field-number>");
    Console.WriteLine("  Rta.Tools mesh-summary <disc.cue|disc.bin|disc.iso|directory> <field-number>");
    Console.WriteLine("  Rta.Tools world-mesh-summary <disc.cue|disc.bin|disc.iso|directory>");
    Console.WriteLine("  Rta.Tools car-summary  <disc.cue|disc.bin|disc.iso|directory> <Qxx>");
    Console.WriteLine("  Rta.Tools elf-words    <disc.cue|disc.bin|disc.iso|directory> <hex-address> <word-count>");
    Console.WriteLine("  Rta.Tools elf-disasm   <disc.cue|disc.bin|disc.iso|directory> <hex-address> <instruction-count>");
    Console.WriteLine("  Rta.Tools elf-find-word <disc.cue|disc.bin|disc.iso|directory> <hex-word>");
    Console.WriteLine("  Rta.Tools elf-find-address <disc.cue|disc.bin|disc.iso|directory> <hex-address>");
    Console.WriteLine("  Rta.Tools elf-find-ascii <disc.cue|disc.bin|disc.iso|directory> <text>");
    Console.WriteLine("  Rta.Tools elf-find-vif-mpg <disc.cue|disc.bin|disc.iso|directory>");
    Console.WriteLine("  Rta.Tools elf-extract-vu1-mpg <disc.cue|disc.bin|disc.iso|directory> <hex-address> <output.bin>");
    Console.WriteLine("  Rta.Tools elf-find-memory-offset <disc.cue|disc.bin|disc.iso|directory> <hex-min> <hex-max>");
    Console.WriteLine("  Rta.Tools vu1-disasm   <vu1MicroMem.bin> <hex-instruction> <instruction-count>");
    Console.WriteLine("  Rta.Tools dialogue     <disc.cue|disc.bin|disc.iso|directory> <Peach Town entity name>");
    Console.WriteLine("  Rta.Tools dialogue-bytecode <disc.cue|disc.bin|disc.iso|directory> <Peach Town entity name>");
    Console.WriteLine("  Rta.Tools world-map-svg <disc.cue|disc.bin|disc.iso|directory> <output.svg>");
    return 1;
}
