using System.Buffers.Binary;

namespace Rta.Formats;

public enum Ps2VifCommandKind
{
    Nop,
    Stcycl,
    Offset,
    Base,
    Itop,
    Stmod,
    Mskpath3,
    Mark,
    Flushe,
    Flush,
    Flusha,
    Mscal,
    Mscalf,
    Mscnt,
    Stmask,
    Strow,
    Stcol,
    Mpg,
    Direct,
    DirectHl,
    Unpack,
    Unknown
}

public sealed record Ps2VifInstruction(
    uint Raw,
    Ps2VifCode Code,
    Ps2VifCommandKind Kind,
    bool IsEmbeddedInDmaTag,
    uint DataOffset,
    uint DataLength);

public sealed class Ps2VifStream
{
    private Ps2VifStream(IReadOnlyList<Ps2VifInstruction> instructions, uint consumedPayloadBytes)
    {
        Instructions = instructions;
        ConsumedPayloadBytes = consumedPayloadBytes;
    }

    public IReadOnlyList<Ps2VifInstruction> Instructions { get; }
    public uint ConsumedPayloadBytes { get; }

    public static Ps2VifStream ReadPacket(Stream stream, long dmaTagAbsoluteOffset, Ps2DmaTag tag)
    {
        ArgumentNullException.ThrowIfNull(stream);
        if (!stream.CanRead || !stream.CanSeek)
            throw new ArgumentException("VIF stream must be readable and seekable.", nameof(stream));

        uint payloadLength = checked((uint)tag.InlinePayloadBytes);
        long payloadAbsoluteOffset = checked(dmaTagAbsoluteOffset + 16);
        long originalPosition = stream.Position;

        try
        {
            var instructions = new List<Ps2VifInstruction>();
            uint payloadCursor = 0;
            Span<byte> codeBytes = stackalloc byte[4];

            DecodeCode(tag.VifCode0, embedded: true);
            DecodeCode(tag.VifCode1, embedded: true);

            while (payloadCursor < payloadLength)
            {
                if (payloadLength - payloadCursor < 4)
                    throw new InvalidDataException("VIF payload ends with a partial command word.");

                stream.Position = checked(payloadAbsoluteOffset + payloadCursor);
                stream.ReadExactly(codeBytes);
                uint raw = BinaryPrimitives.ReadUInt32LittleEndian(codeBytes);
                payloadCursor += 4;
                DecodeCode(raw, embedded: false);
            }

            return new Ps2VifStream(instructions, payloadCursor);

            void DecodeCode(uint raw, bool embedded)
            {
                Ps2VifCode code = Ps2VifCode.Decode(raw);
                Ps2VifCommandKind kind = GetKind(code.Command);
                uint dataLength = GetDataLength(code, kind);
                uint dataOffset = payloadCursor;
                if (payloadCursor + dataLength > payloadLength)
                    throw new InvalidDataException($"VIF {kind} at payload +0x{payloadCursor:X} requests {dataLength} bytes beyond the DMA packet.");

                instructions.Add(new Ps2VifInstruction(raw, code, kind, embedded, dataOffset, dataLength));
                payloadCursor += dataLength;
            }
        }
        finally
        {
            stream.Position = originalPosition;
        }
    }

    public static Ps2VifCommandKind GetKind(byte command) => command switch
    {
        0x00 => Ps2VifCommandKind.Nop,
        0x01 => Ps2VifCommandKind.Stcycl,
        0x02 => Ps2VifCommandKind.Offset,
        0x03 => Ps2VifCommandKind.Base,
        0x04 => Ps2VifCommandKind.Itop,
        0x05 => Ps2VifCommandKind.Stmod,
        0x06 => Ps2VifCommandKind.Mskpath3,
        0x07 => Ps2VifCommandKind.Mark,
        0x10 => Ps2VifCommandKind.Flushe,
        0x11 => Ps2VifCommandKind.Flush,
        0x13 => Ps2VifCommandKind.Flusha,
        0x14 => Ps2VifCommandKind.Mscal,
        0x15 => Ps2VifCommandKind.Mscalf,
        0x17 => Ps2VifCommandKind.Mscnt,
        0x20 => Ps2VifCommandKind.Stmask,
        0x30 => Ps2VifCommandKind.Strow,
        0x31 => Ps2VifCommandKind.Stcol,
        0x4A => Ps2VifCommandKind.Mpg,
        0x50 => Ps2VifCommandKind.Direct,
        0x51 => Ps2VifCommandKind.DirectHl,
        >= 0x60 and <= 0x7F => Ps2VifCommandKind.Unpack,
        _ => Ps2VifCommandKind.Unknown
    };

    private static uint GetDataLength(Ps2VifCode code, Ps2VifCommandKind kind) => kind switch
    {
        Ps2VifCommandKind.Stmask => 4,
        Ps2VifCommandKind.Strow or Ps2VifCommandKind.Stcol => 16,
        Ps2VifCommandKind.Mpg => checked((uint)EffectiveCount(code.Count) * 8u),
        Ps2VifCommandKind.Direct or Ps2VifCommandKind.DirectHl => checked((uint)code.Immediate * 16u),
        Ps2VifCommandKind.Unpack => GetUnpackDataLength(code),
        _ => 0
    };

    private static uint GetUnpackDataLength(Ps2VifCode code)
    {
        int format = code.Command & 0x0F;
        int vectorComponents = ((format >> 2) & 0x3) + 1;
        int vectorLength = format & 0x3;
        int count = EffectiveCount(code.Count);

        if (vectorLength == 3)
        {
            if (vectorComponents != 4)
                throw new NotSupportedException($"Reserved/unsupported VIF UNPACK format 0x{code.Command:X2}.");
            return checked((uint)count * 2u); // V4-5: one packed 16-bit vector.
        }

        int bitsPerComponent = 32 >> vectorLength;
        return checked((uint)(count * vectorComponents * bitsPerComponent / 8));
    }

    private static int EffectiveCount(byte count) => count == 0 ? 256 : count;
}
