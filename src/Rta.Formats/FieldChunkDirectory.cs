namespace Rta.Formats;

public sealed record FieldChunk(
    int Index,
    int X,
    int Z,
    bool IsGlobal,
    uint RelativeOffset,
    uint Length,
    ushort DeclaredPacketCount);

public sealed class FieldChunkDirectory
{
    private FieldChunkDirectory(int gridSize, bool hasGlobalChunk, IReadOnlyList<FieldChunk> chunks, uint dataOffset)
    {
        GridSize = gridSize;
        HasGlobalChunk = hasGlobalChunk;
        Chunks = chunks;
        DataOffset = dataOffset;
    }

    public int GridSize { get; }
    public int SpatialChunkCount => GridSize * GridSize;
    public int TotalChunkCount => Chunks.Count;
    public bool HasGlobalChunk { get; }
    public uint DataOffset { get; }
    public IReadOnlyList<FieldChunk> Chunks { get; }
    public FieldChunk? GlobalChunk => HasGlobalChunk ? Chunks[^1] : null;

    public static FieldChunkDirectory ReadRenderMeshes(Stream stream, FieldHeader header) =>
        Read(stream, header.RenderMeshes, 8, hasGlobalChunk: true);

    public static FieldChunkDirectory ReadCollision(Stream stream, FieldHeader header) =>
        Read(stream, header.Collision, 16, hasGlobalChunk: false);

    public static FieldChunkDirectory Read(Stream stream, FieldSection section, int gridSize, bool hasGlobalChunk)
    {
        ArgumentNullException.ThrowIfNull(stream);
        if (!stream.CanRead || !stream.CanSeek)
            throw new ArgumentException("Chunk-directory stream must be readable and seekable.", nameof(stream));
        if (gridSize <= 0)
            throw new ArgumentOutOfRangeException(nameof(gridSize));

        int spatialCount = checked(gridSize * gridSize);
        int chunkCount = checked(spatialCount + (hasGlobalChunk ? 1 : 0));
        int rawDirectoryBytes = checked(chunkCount * sizeof(uint) + chunkCount * sizeof(ushort));
        if (section.Length < rawDirectoryBytes)
            throw new InvalidDataException("Field section is too small for its chunk directory.");

        long originalPosition = stream.Position;
        try
        {
            stream.Position = section.Offset;
            uint[] offsets = new uint[chunkCount];
            for (int i = 0; i < offsets.Length; i++)
                offsets[i] = BinaryStream.ReadUInt32LittleEndian(stream);

            ushort[] counts = new ushort[chunkCount];
            Span<byte> countBytes = stackalloc byte[2];
            for (int i = 0; i < counts.Length; i++)
            {
                stream.ReadExactly(countBytes);
                counts[i] = System.Buffers.Binary.BinaryPrimitives.ReadUInt16LittleEndian(countBytes);
            }

            uint firstDataOffset = offsets[0];
            if (firstDataOffset < rawDirectoryBytes || firstDataOffset > section.Length)
                throw new InvalidDataException($"Chunk data starts at invalid section-relative offset 0x{firstDataOffset:X}.");

            uint previous = firstDataOffset;
            for (int i = 0; i < offsets.Length; i++)
            {
                uint value = offsets[i];
                if (value < previous || value > section.Length)
                    throw new InvalidDataException("Chunk offsets are not monotonic or exceed their field section.");
                previous = value;
            }

            var chunks = new FieldChunk[chunkCount];
            for (int i = 0; i < chunkCount; i++)
            {
                uint end = i + 1 < chunkCount ? offsets[i + 1] : section.Length;
                bool global = hasGlobalChunk && i == spatialCount;
                chunks[i] = new FieldChunk(
                    Index: i,
                    X: global ? -1 : i % gridSize,
                    Z: global ? -1 : i / gridSize,
                    IsGlobal: global,
                    RelativeOffset: offsets[i],
                    Length: end - offsets[i],
                    DeclaredPacketCount: counts[i]);
            }

            return new FieldChunkDirectory(gridSize, hasGlobalChunk, chunks, firstDataOffset);
        }
        finally
        {
            stream.Position = originalPosition;
        }
    }
}
