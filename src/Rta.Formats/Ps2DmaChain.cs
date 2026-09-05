namespace Rta.Formats;

public sealed record Ps2DmaPacket(uint RelativeOffset, Ps2DmaTag Tag, uint PayloadOffset, uint PayloadLength);

public sealed class Ps2DmaChain
{
    private Ps2DmaChain(IReadOnlyList<Ps2DmaPacket> packets, uint consumedBytes, Ps2DmaTagId terminator)
    {
        Packets = packets;
        ConsumedBytes = consumedBytes;
        Terminator = terminator;
    }

    public IReadOnlyList<Ps2DmaPacket> Packets { get; }
    public uint ConsumedBytes { get; }
    public Ps2DmaTagId Terminator { get; }

    public static Ps2DmaChain ReadInline(Stream stream, long absoluteOffset, uint maximumLength)
    {
        ArgumentNullException.ThrowIfNull(stream);
        if (!stream.CanRead || !stream.CanSeek)
            throw new ArgumentException("DMA stream must be readable and seekable.", nameof(stream));

        long originalPosition = stream.Position;
        try
        {
            uint relative = 0;
            var packets = new List<Ps2DmaPacket>();
            while (relative + 16 <= maximumLength)
            {
                stream.Position = checked(absoluteOffset + relative);
                Ps2DmaTag tag = Ps2DmaTag.Read(stream);
                uint payloadLength = checked((uint)tag.InlinePayloadBytes);

                if (tag.Id is not (Ps2DmaTagId.Cnt or Ps2DmaTagId.Ret or Ps2DmaTagId.End))
                    throw new NotSupportedException($"Inline DMA chain encountered {tag.Id} at +0x{relative:X}; referenced/jumping DMA tags are not decoded yet.");

                uint packetBytes = checked(16u + payloadLength);
                if (relative + packetBytes > maximumLength)
                    throw new InvalidDataException($"DMA packet at +0x{relative:X} exceeds its containing section/chunk.");

                packets.Add(new Ps2DmaPacket(relative, tag, relative + 16, payloadLength));
                relative += packetBytes;

                if (tag.Id is Ps2DmaTagId.Ret or Ps2DmaTagId.End)
                    return new Ps2DmaChain(packets, relative, tag.Id);
            }

            throw new InvalidDataException("DMA chain reached its containing boundary without RET or END.");
        }
        finally
        {
            stream.Position = originalPosition;
        }
    }
}
