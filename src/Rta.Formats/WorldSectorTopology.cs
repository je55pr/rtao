using System.Numerics;

namespace Rta.Formats;

/// <summary>
/// Canonical HG2 topology for the 64 ordinary outdoor FLD sectors.
///
/// This class intentionally knows nothing about renderer handedness, camera-relative
/// wrapping, or how a paper/debug map chooses to cut the cyclic X axis. Coordinates
/// here are the source coordinates authored by HG2: each FLD is 1600x1600, odd rows
/// are shifted +800 in X, and X wraps with a circumference of eight fields.
/// </summary>
public static class WorldSectorTopology
{
    public const int GridWidth = 8;
    public const int GridHeight = 8;
    public const float FieldExtent = 1600f;
    public const float RowStagger = FieldExtent * 0.5f;
    public const float WorldCircumference = GridWidth * FieldExtent;

    public readonly record struct SectorAddress
    {
        public SectorAddress(int column, int row)
        {
            if (column is < 0 or >= GridWidth)
                throw new ArgumentOutOfRangeException(nameof(column));
            if (row is < 0 or >= GridHeight)
                throw new ArgumentOutOfRangeException(nameof(row));
            Column = column;
            Row = row;
        }

        public int Column { get; }
        public int Row { get; }
        public int FieldNumber => ToFieldNumber(Column, Row);
    }

    public readonly record struct SectorPosition(int FieldNumber, Vector2 LocalPosition)
    {
        public SectorAddress Address => FromFieldNumber(FieldNumber);
    }

    public static IEnumerable<int> AllFieldNumbers
    {
        get
        {
            for (int row = 0; row < GridHeight; row++)
            {
                for (int column = 0; column < GridWidth; column++)
                    yield return ToFieldNumber(column, row);
            }
        }
    }

    public static SectorAddress FromFieldNumber(int fieldNumber)
    {
        int a = fieldNumber / 100;
        int b = (fieldNumber / 10) % 10;
        int c = fieldNumber % 10;
        if (a is < 0 or > 3 || b is < 0 or > 3 || c is < 0 or > 3)
            throw new ArgumentOutOfRangeException(nameof(fieldNumber), "FLD sector names must contain three base-4 digits (000..333).");

        int column = 2 * b + (c & 1);
        int row = 2 * a + (c >> 1);
        return new SectorAddress(column, row);
    }

    public static int ToFieldNumber(int column, int row)
    {
        if (column is < 0 or >= GridWidth)
            throw new ArgumentOutOfRangeException(nameof(column));
        if (row is < 0 or >= GridHeight)
            throw new ArgumentOutOfRangeException(nameof(row));

        int a = row >> 1;
        int b = column >> 1;
        int c = ((row & 1) << 1) | (column & 1);
        return a * 100 + b * 10 + c;
    }

    /// <summary>Converts the executable's 0..63 physical field code to its FLD xyz-style filename.</summary>
    public static int FieldNumberFromAreaCode(int areaCode)
    {
        if (areaCode is < 0 or >= 64)
            throw new ArgumentOutOfRangeException(nameof(areaCode));
        int a = (areaCode >> 4) & 3;
        int b = (areaCode >> 2) & 3;
        int c = areaCode & 3;
        return a * 100 + b * 10 + c;
    }

    public static int AreaCodeFromFieldNumber(int fieldNumber)
    {
        _ = FromFieldNumber(fieldNumber);
        int a = fieldNumber / 100;
        int b = (fieldNumber / 10) % 10;
        int c = fieldNumber % 10;
        return (a << 4) | (b << 2) | c;
    }

    /// <summary>
    /// Canonical HG2 source-space X of a field's local X=0 edge. This is the raw
    /// authored topology: storage columns increase in +X and odd rows are +800.
    /// </summary>
    public static float SourceBaseX(SectorAddress address) =>
        address.Column * FieldExtent + ((address.Row & 1) != 0 ? RowStagger : 0f);

    public static Vector2 SourceBase(SectorAddress address) =>
        new(SourceBaseX(address), address.Row * FieldExtent);

    public static Vector2 ToCanonicalSource(int fieldNumber, Vector2 localSourcePosition)
    {
        SectorAddress address = FromFieldNumber(fieldNumber);
        Vector2 basePosition = SourceBase(address);
        return basePosition + localSourcePosition;
    }

    /// <summary>
    /// Normalises an arbitrary HG2 source-local X/Z point into the correct FLD.
    /// Horizontal wrapping is cyclic. Crossing beyond the outermost north/south rows
    /// is rejected until HG2's special-world handling is understood.
    /// </summary>
    public static bool TryNormalizeSource(int currentFieldNumber, Vector2 localSourcePosition, out SectorPosition normalized)
    {
        SectorAddress current = FromFieldNumber(currentFieldNumber);
        float canonicalX = SourceBaseX(current) + localSourcePosition.X;

        int rowDelta = FloorDiv(localSourcePosition.Y, FieldExtent);
        int targetRow = current.Row + rowDelta;
        float targetLocalZ = localSourcePosition.Y - rowDelta * FieldExtent;
        if (targetLocalZ < 0f)
        {
            targetRow--;
            targetLocalZ += FieldExtent;
        }
        else if (targetLocalZ >= FieldExtent)
        {
            targetRow++;
            targetLocalZ -= FieldExtent;
        }

        if (targetRow is < 0 or >= GridHeight)
        {
            normalized = default;
            return false;
        }

        for (int column = 0; column < GridWidth; column++)
        {
            var candidate = new SectorAddress(column, targetRow);
            float localX = PositiveModulo(canonicalX - SourceBaseX(candidate), WorldCircumference);
            // Field-local X uses half-open ownership [0, FieldExtent). An exact
            // X=1600 point belongs to the next sector at local X=0; accepting it
            // in the current candidate and then zeroing X changes the canonical
            // position by a full field width.
            if (localX < FieldExtent)
            {
                normalized = new SectorPosition(candidate.FieldNumber, new Vector2(localX, targetLocalZ));
                return true;
            }
        }

        normalized = default;
        return false;
    }

    /// <summary>
    /// Shortest cyclic source-space translation from one field's local frame to
    /// another. This is canonical HG2 orientation, not the reflected MonoGame view.
    /// </summary>
    public static Vector2 RelativeSourceTranslation(int originFieldNumber, int targetFieldNumber)
    {
        SectorAddress origin = FromFieldNumber(originFieldNumber);
        SectorAddress target = FromFieldNumber(targetFieldNumber);
        float dx = SourceBaseX(target) - SourceBaseX(origin);
        dx = WrapShortest(dx, WorldCircumference);
        float dz = (target.Row - origin.Row) * FieldExtent;
        return new Vector2(dx, dz);
    }

    public static int ResolveDescriptorFieldNumber(PalOverworldAreaDescriptor descriptor)
    {
        if (descriptor.Name.Length == 3 && descriptor.Name.All(ch => ch is >= '0' and <= '3') && int.TryParse(descriptor.Name, out int namedField))
            return namedField;
        if (descriptor.AreaCode is >= 0 and < 64)
            return FieldNumberFromAreaCode(descriptor.AreaCode);
        return -1;
    }

    internal static float WrapShortest(float value, float circumference)
    {
        if (value > circumference * 0.5f)
            value -= circumference;
        else if (value < -circumference * 0.5f)
            value += circumference;
        return value;
    }

    internal static float PositiveModulo(float value, float modulus)
    {
        float result = value % modulus;
        return result < 0f ? result + modulus : result;
    }

    private static int FloorDiv(float value, float divisor) => (int)MathF.Floor(value / divisor);
}

/// <summary>
/// Adapter between canonical HG2 source coordinates and the reflected local X axis
/// used by the current MonoGame renderer. Keeping this separate prevents renderer
/// handedness from leaking into world topology or cartographic/debug-map code.
/// </summary>
public static class ReflectedWorldSectorTopology
{
    public static Vector2 SourceLocalToRenderLocal(Vector2 sourceLocal) =>
        new(WorldSectorTopology.FieldExtent - sourceLocal.X, sourceLocal.Y);

    public static Vector2 RenderLocalToSourceLocal(Vector2 renderLocal) =>
        new(WorldSectorTopology.FieldExtent - renderLocal.X, renderLocal.Y);

    public static bool TryNormalizeRender(int currentFieldNumber, Vector2 localRenderPosition, out WorldSectorTopology.SectorPosition normalized)
    {
        Vector2 source = RenderLocalToSourceLocal(localRenderPosition);
        if (!WorldSectorTopology.TryNormalizeSource(currentFieldNumber, source, out WorldSectorTopology.SectorPosition sourceNormalized))
        {
            normalized = default;
            return false;
        }

        normalized = new WorldSectorTopology.SectorPosition(
            sourceNormalized.FieldNumber,
            SourceLocalToRenderLocal(sourceNormalized.LocalPosition));
        return true;
    }

    /// <summary>
    /// Camera/render-space translation for drawing target FLD vertices in origin
    /// FLD's reflected local frame. It is derived from canonical source topology,
    /// then reflected exactly once.
    /// </summary>
    public static Vector2 RelativeRenderTranslation(int originFieldNumber, int targetFieldNumber)
    {
        Vector2 sourceDelta = WorldSectorTopology.RelativeSourceTranslation(originFieldNumber, targetFieldNumber);
        return new Vector2(-sourceDelta.X, sourceDelta.Y);
    }
}

/// <summary>
/// Fixed, non-camera-relative unwrap used for world-map/debug-atlas presentation.
/// It preserves HG2 source orientation (no renderer X reflection) and chooses the
/// cyclic cut immediately before FLD storage column 7 so Papaya (233) appears west
/// of White Mountain (203), matching HG2's authored world-map relationship.
/// </summary>
public static class WorldSectorCartography
{
    public const int CutColumn = 7;
    public const float MapWidth = WorldSectorTopology.WorldCircumference + WorldSectorTopology.RowStagger;
    public const float MapHeight = WorldSectorTopology.GridHeight * WorldSectorTopology.FieldExtent;

    /// <summary>
    /// Stable unwrapped base for a sector on a paper/debug map. Unlike camera-relative
    /// wrapping this never changes with the observer. The extra half-field width is
    /// intentional: odd rows remain visibly staggered across the fixed cyclic cut.
    /// </summary>
    public static Vector2 SectorBase(int fieldNumber)
    {
        WorldSectorTopology.SectorAddress address = WorldSectorTopology.FromFieldNumber(fieldNumber);
        int unwrappedColumn = (address.Column - CutColumn + WorldSectorTopology.GridWidth) % WorldSectorTopology.GridWidth;
        float x = unwrappedColumn * WorldSectorTopology.FieldExtent +
            ((address.Row & 1) != 0 ? WorldSectorTopology.RowStagger : 0f);
        return new Vector2(x, address.Row * WorldSectorTopology.FieldExtent);
    }

    public static Vector2 ToMapPosition(int fieldNumber, Vector2 localSourcePosition)
    {
        Vector2 sourceMap = SectorBase(fieldNumber) + localSourcePosition;
        // SVG/image Y grows downward while HG2 source Z grows along the storage
        // rows. Flip only for presentation; canonical world topology is unchanged.
        return new Vector2(sourceMap.X, MapHeight - sourceMap.Y);
    }

    public static Vector2 SectorCenter(int fieldNumber) =>
        ToMapPosition(
            fieldNumber,
            new Vector2(WorldSectorTopology.FieldExtent * 0.5f, WorldSectorTopology.FieldExtent * 0.5f));
}
