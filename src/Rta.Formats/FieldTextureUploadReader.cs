namespace Rta.Formats;

public static class FieldTextureUploadReader
{
    public static IReadOnlyDictionary<ushort, FieldTextureUpload> ReadUploads(Stream stream, FieldHeader header)
    {
        ArgumentNullException.ThrowIfNull(header);
        return ReadUploads(stream, header.Textures.Offset, header.Textures.Length);
    }

    public static IReadOnlyDictionary<ushort, FieldTextureUpload> ReadUploads(Stream stream, long offset, uint length)
    {
        // Compatibility view used by the first renderer: the last upload to a GS
        // base pointer wins. Code that cares about true GS state should use the
        // ordered sequence and replay it through GsLocalMemory instead.
        var uploads = new Dictionary<ushort, FieldTextureUpload>();
        foreach (FieldTextureUpload upload in ReadUploadSequence(stream, offset, length))
            uploads[upload.DestinationBasePointer] = upload;
        return uploads;
    }

    public static IReadOnlyList<FieldTextureUpload> ReadUploadSequence(Stream stream, FieldHeader header)
    {
        ArgumentNullException.ThrowIfNull(header);
        return ReadUploadSequence(stream, header.Textures.Offset, header.Textures.Length);
    }

    public static IReadOnlyList<FieldTextureUpload> ReadUploadSequence(Stream stream, long offset, uint length)
    {
        ArgumentNullException.ThrowIfNull(stream);
        Ps2DmaChain chain = Ps2DmaChain.ReadInline(stream, offset, length);
        var uploads = new List<FieldTextureUpload>();
        int packetIndex = 0;

        foreach (Ps2DmaPacket packet in chain.Packets.Where(packet => packet.Tag.Id == Ps2DmaTagId.Cnt))
        {
            long payloadOffset = checked(offset + packet.PayloadOffset);
            uploads.Add(Ps2GsImageTransferReader.ReadUpload(stream, payloadOffset, packetIndex++));
        }

        return uploads;
    }
}
