using System.Buffers.Binary;

namespace Rta.Formats;

public readonly record struct PalRaceParticipantReference(
    byte AreaIndex,
    byte ResidentIndex,
    string Name,
    int BodyId,
    uint PackedPaint);

public sealed record PalRaceActivityDescriptor(
    int ActivityId,
    string Name,
    bool IsOrdinaryRace,
    uint DescriptorAddress,
    byte SceneId,
    byte RawParameter1,
    byte RawParameter2,
    byte VariantId,
    uint SettingsAddress,
    uint ParticipantListAddress,
    IReadOnlyList<PalRaceParticipantReference> Participants,
    byte[] RawSettings,
    uint HandlerAAddress,
    uint HandlerBAddress);

public sealed record PalRaceCatalogue(
    IReadOnlyList<PalRaceActivityDescriptor> OrdinaryRaces,
    IReadOnlyList<PalRaceActivityDescriptor> Activities,
    IReadOnlyList<PalRaceSelectorRange> SelectorRanges)
{
    public IReadOnlyList<PalRaceActivityDescriptor> ActivitiesForArea(int areaIndex)
    {
        if (areaIndex < 0 || areaIndex >= SelectorRanges.Count)
            return Array.Empty<PalRaceActivityDescriptor>();
        PalRaceSelectorRange range = SelectorRanges[areaIndex];
        return range.ActivityCount == 0
            ? Array.Empty<PalRaceActivityDescriptor>()
            : Activities.Skip(range.FirstActivityId).Take(range.ActivityCount).ToArray();
    }
}

public readonly record struct PalRaceSelectorRange(int AreaIndex, byte FirstActivityId, byte ActivityCount);

public readonly record struct PalRaceFinishGateStrip(float MinimumX, float MinimumZ, float MaximumX, float MaximumZ)
{
    public bool Contains(float nativeX, float nativeZ) =>
        MinimumX < nativeX && nativeX < MaximumX && MinimumZ < nativeZ && nativeZ < MaximumZ;
}

public sealed record PalRaceFinishGateSet(int CourseId, IReadOnlyList<PalRaceFinishGateStrip> Strips);
public readonly record struct PalRaceFinishGateAdvance(byte Phase, bool CompletedLap);
public readonly record struct PalRaceStartAnchor(
    int CourseId,
    float NativeX,
    float NativeY,
    float NativeZ,
    short HeadingQuarterTurns,
    short LateralPolarity);
public readonly record struct PalRaceStartSeed(
    int CourseId,
    int StartIndex,
    float NativeX,
    float NativeY,
    float NativeZ,
    ushort NativeYaw);
public readonly record struct PalRaceTeamMemberIdentity(byte AreaIndex, byte ResidentIndex);
public enum PalRaceControlSource
{
    HumanInput,
    OrdinaryAi,
}
public abstract record PalOrdinaryRaceEntrant(
    int CarIndex,
    int ConfigPointerIndex,
    int StartIndex,
    uint PackedCreationFlags,
    PalRaceControlSource ControlSource,
    int? ControllerIndex,
    PalRaceStartSeed Seed);
public sealed record PalOrdinaryRacePlayerEntrant(
    int CarIndex,
    int ConfigPointerIndex,
    int StartIndex,
    uint PackedCreationFlags,
    PalRaceControlSource ControlSource,
    int? ControllerIndex,
    PalRaceStartSeed Seed)
    : PalOrdinaryRaceEntrant(CarIndex, ConfigPointerIndex, StartIndex, PackedCreationFlags, ControlSource, ControllerIndex, Seed);
public sealed record PalOrdinaryRaceTeammateEntrant(
    int CarIndex,
    int ConfigPointerIndex,
    int StartIndex,
    uint PackedCreationFlags,
    PalRaceControlSource ControlSource,
    int? ControllerIndex,
    PalRaceStartSeed Seed,
    int TeamSlot,
    PalRaceTeamMemberIdentity Identity)
    : PalOrdinaryRaceEntrant(CarIndex, ConfigPointerIndex, StartIndex, PackedCreationFlags, ControlSource, ControllerIndex, Seed);
public sealed record PalOrdinaryRaceOpponentEntrant(
    int CarIndex,
    int ConfigPointerIndex,
    int StartIndex,
    uint PackedCreationFlags,
    PalRaceControlSource ControlSource,
    int? ControllerIndex,
    PalRaceStartSeed Seed,
    int ParticipantIndex,
    PalRaceParticipantReference Participant)
    : PalOrdinaryRaceEntrant(CarIndex, ConfigPointerIndex, StartIndex, PackedCreationFlags, ControlSource, ControllerIndex, Seed);
public readonly record struct PalRaceNavigationPoint(float NativeX, float NativeZ);
public sealed record PalRaceNavigationGate(
    int GateIndex,
    PalRaceNavigationPoint EndpointA,
    PalRaceNavigationPoint EndpointB,
    PalRaceNavigationPoint BranchPoint);
public sealed record PalRaceNavigationRecord(
    int RecordIndex,
    byte BackwardBoundaryGateIndex,
    byte ForwardBoundaryGateIndex,
    IReadOnlyList<byte> BackwardRecordIndices,
    IReadOnlyList<byte> ForwardRecordIndices,
    byte SelectorOutput,
    byte ReservedByte);
public sealed record PalRaceNavigationCourse(
    int CourseId,
    uint GateTableAddress,
    uint RecordTableAddress,
    IReadOnlyList<PalRaceNavigationGate> Gates,
    IReadOnlyList<PalRaceNavigationRecord> Records);
public readonly record struct PalRaceNavigationAdvance(
    int CurrentRecordIndex,
    byte SelectorOutput,
    int ReturnedRecordIndex,
    byte ForwardChoiceClass);

/// <summary>
/// Clean-room reader for HG2 PAL's executable-owned race/activity catalogue.
///
/// Launcher code at 0x002106B8 selects the primary descriptor block for IDs
/// 0..34 and the extended block for 35..38. Code at 0x00238D50 separately
/// establishes IDs 0..23 as the ordinary race range. Parameter bytes whose
/// consumers are not yet proven remain raw rather than receiving guessed names.
/// </summary>
public static class PalRaceCatalogueReader
{
    public const uint ActivityNamePointerTableAddress = 0x002C0410;
    public const uint ResidentDefinitionPointerTableAddress = 0x002C4340;
    public const uint SelectorRangeTableAddress = 0x002C0078;
    public const uint PrimaryDescriptorTableAddress = 0x002BFE48;
    public const uint ExtendedDescriptorTableAddress = 0x002C0090;
    public const uint StartAnchorTableAddress = 0x002A9C10;
    public const uint FinishGateTableAddress = 0x002A9E80;
    public const uint NavigationPointerTableAddress = 0x002BF5F0;
    public const uint OrdinaryRaceAiHandlerAddress = 0x00252BA0;
    public const uint OrdinaryRaceEntrantBuilderAddress = 0x0020F9E8;
    public const uint ModeEightOpponentLoopAddress = 0x00210BA0;
    public const uint RaceInputDispatcherAddress = 0x0021B840;
    public const uint PrimaryControllerManagerAddress = 0x0021F540;
    public const int ActivityCount = 39;
    public const int OrdinaryRaceCount = 24;
    public const int OrdinaryRaceCourseCount = 15;

    public static readonly IReadOnlyList<int[]> PrizeCakeByVariantAndFinishIndex =
    [
        [800, 500, 400, 300, 200, 100],
        [1500, 1200, 1000, 800, 600, 500],
        [2500, 2000, 1600, 1200, 1000, 800],
        [80000, 60000, 40000, 30000, 20000, 10000],
    ];

    private const int PrimaryDescriptorCount = 35;
    private const int DescriptorSize = 16;
    private const int SettingsSize = 24;
    private const int MaximumParticipantReferences = 64;
    private const int SelectorRangeCount = 12;

    public static PalRaceCatalogue Read(Stream executable)
    {
        var elf = new Elf32AddressSpace(executable);
        var activities = new PalRaceActivityDescriptor[ActivityCount];
        for (int activityId = 0; activityId < activities.Length; activityId++)
        {
            uint descriptorAddress = activityId < PrimaryDescriptorCount
                ? PrimaryDescriptorTableAddress + (uint)(activityId * DescriptorSize)
                : ExtendedDescriptorTableAddress + (uint)((activityId - PrimaryDescriptorCount) * DescriptorSize);
            byte[] descriptor = elf.ReadBytes(descriptorAddress, DescriptorSize);
            uint settingsAddress = ReadUInt32(descriptor, 4);
            if (settingsAddress == 0 || !elf.IsFileBacked(settingsAddress, SettingsSize))
                throw new InvalidDataException($"PAL race/activity {activityId} has an invalid settings pointer.");
            byte[] settings = elf.ReadBytes(settingsAddress, SettingsSize);
            uint participantListAddress = ReadUInt32(settings, 0);
            activities[activityId] = new PalRaceActivityDescriptor(
                activityId,
                elf.ReadAsciiZ(elf.ReadUInt32(ActivityNamePointerTableAddress + (uint)(activityId * 4))),
                activityId < OrdinaryRaceCount,
                descriptorAddress,
                descriptor[0],
                descriptor[1],
                descriptor[2],
                descriptor[3],
                settingsAddress,
                participantListAddress,
                ReadParticipantReferences(elf, participantListAddress, activityId),
                settings[4..],
                ReadUInt32(descriptor, 8),
                ReadUInt32(descriptor, 12));
        }

        var selectorRanges = new PalRaceSelectorRange[SelectorRangeCount];
        for (int areaIndex = 0; areaIndex < selectorRanges.Length; areaIndex++)
        {
            byte[] range = elf.ReadBytes(SelectorRangeTableAddress + (uint)(areaIndex * 2), 2);
            selectorRanges[areaIndex] = new PalRaceSelectorRange(areaIndex, range[0], range[1]);
        }
        return new PalRaceCatalogue(activities[..OrdinaryRaceCount], activities, selectorRanges);
    }

    /// <summary>Mirrors PAL 0x00237A00; finish indices outside 0..5 pay zero.</summary>
    public static int PrizeCake(int variantId, IEnumerable<int> nativeFinishIndices)
    {
        if (variantId < 0 || variantId >= PrizeCakeByVariantAndFinishIndex.Count)
            return 0;
        IReadOnlyList<int> row = PrizeCakeByVariantAndFinishIndex[variantId];
        return nativeFinishIndices.Sum(index => index >= 0 && index < row.Count ? row[index] : 0);
    }

    /// <summary>
    /// Reads the three adjacent native-space finish-line strips consumed by
    /// ordinary handler 0x0022EBA0.
    /// </summary>
    public static IReadOnlyList<PalRaceFinishGateSet> ReadFinishGateSets(Stream executable)
    {
        var elf = new Elf32AddressSpace(executable);
        var result = new PalRaceFinishGateSet[OrdinaryRaceCourseCount];
        for (int courseId = 0; courseId < result.Length; courseId++)
        {
            var strips = new PalRaceFinishGateStrip[3];
            for (int stripIndex = 0; stripIndex < strips.Length; stripIndex++)
            {
                byte[] raw = elf.ReadBytes(FinishGateTableAddress + (uint)(courseId * 48 + stripIndex * 16), 16);
                strips[stripIndex] = new PalRaceFinishGateStrip(
                    ReadSingle(raw, 0), ReadSingle(raw, 4), ReadSingle(raw, 8), ReadSingle(raw, 12));
                PalRaceFinishGateStrip strip = strips[stripIndex];
                if (!float.IsFinite(strip.MinimumX) || !float.IsFinite(strip.MinimumZ) ||
                    !float.IsFinite(strip.MaximumX) || !float.IsFinite(strip.MaximumZ) ||
                    strip.MinimumX >= strip.MaximumX || strip.MinimumZ >= strip.MaximumZ)
                    throw new InvalidDataException($"PAL race course C{courseId:D2} has an invalid finish strip {stripIndex}.");
            }
            result[courseId] = new PalRaceFinishGateSet(courseId, strips);
        }
        return result;
    }

    /// <summary>
    /// Reads the native per-course start seeds consumed at 0x002195F4 before
    /// the executable invokes its subsequent course-placement helper.
    /// </summary>
    public static IReadOnlyList<PalRaceStartAnchor> ReadStartAnchors(Stream executable)
    {
        var elf = new Elf32AddressSpace(executable);
        var result = new PalRaceStartAnchor[OrdinaryRaceCourseCount];
        for (int courseId = 0; courseId < result.Length; courseId++)
        {
            byte[] raw = elf.ReadBytes(StartAnchorTableAddress + (uint)(courseId * 16), 16);
            var anchor = new PalRaceStartAnchor(
                courseId,
                ReadSingle(raw, 0),
                ReadSingle(raw, 4),
                ReadSingle(raw, 8),
                BinaryPrimitives.ReadInt16LittleEndian(raw.AsSpan(12, 2)),
                BinaryPrimitives.ReadInt16LittleEndian(raw.AsSpan(14, 2)));
            if (!float.IsFinite(anchor.NativeX) || !float.IsFinite(anchor.NativeY) || !float.IsFinite(anchor.NativeZ) ||
                anchor.HeadingQuarterTurns is < 0 or > 3 || anchor.LateralPolarity is < 0 or > 1)
                throw new InvalidDataException($"PAL race course C{courseId:D2} has an invalid start anchor.");
            result[courseId] = anchor;
        }
        return result;
    }

    /// <summary>Mirrors the four cardinal stagger branches at 0x002195F4.</summary>
    public static PalRaceStartSeed StartSeed(PalRaceStartAnchor anchor, int startIndex)
    {
        if (startIndex is < 0 or > 31)
            throw new ArgumentOutOfRangeException(nameof(startIndex), "Native race start index must be 0..31.");
        float nativeX = anchor.NativeX;
        float nativeZ = anchor.NativeZ;
        float longitudinal = startIndex * 5f;
        float lateralMagnitude = (startIndex & 1) * 7.5f;
        float lateral = (anchor.LateralPolarity == 0 ? 1f : -1f) * lateralMagnitude;
        switch (anchor.HeadingQuarterTurns)
        {
            case 0: nativeX += lateral; nativeZ -= longitudinal; break;
            case 1: nativeX -= longitudinal; nativeZ += lateral; break;
            case 2: nativeX -= lateral; nativeZ += longitudinal; break;
            case 3: nativeX += longitudinal; nativeZ -= lateral; break;
            default: throw new ArgumentOutOfRangeException(nameof(anchor), "Native race heading must be 0..3.");
        }
        return new PalRaceStartSeed(
            anchor.CourseId,
            startIndex,
            nativeX,
            anchor.NativeY,
            nativeZ,
            checked((ushort)(anchor.HeadingQuarterTurns << 14)));
    }

    /// <summary>
    /// Mirrors PAL's ordinary-race entrant builder at 0x0020F9E8. Car 0 uses
    /// persistent config pointer 0 and the final grid slot. Active team slots
    /// use config pointers 1/2 and the first grid slots. Opponents then follow
    /// the native 22..17, 0..22 two-pass participant order with saved teammate
    /// identities filtered by 0x0023F6E0. The loop at 0x00210BA0 belongs to
    /// separate mode 8 / activity 24 and is not an ordinary-race roster.
    /// </summary>
    public static IReadOnlyList<PalOrdinaryRaceEntrant> OrdinaryRaceEntrants(
        PalRaceActivityDescriptor activity,
        PalRaceStartAnchor anchor,
        IReadOnlyList<PalRaceTeamMemberIdentity?>? teamMembers = null)
    {
        if (!activity.IsOrdinaryRace)
            throw new ArgumentException("Activity is not an ordinary PAL race.", nameof(activity));
        if (activity.SceneId != anchor.CourseId)
            throw new ArgumentException("PAL race activity and course start anchor do not match.", nameof(anchor));
        int carCount = activity.RawParameter1;
        if (carCount is < 2 or > 32 || activity.Participants.Count < carCount - 1)
            throw new InvalidDataException($"PAL race activity {activity.ActivityId} has an incomplete participant pool.");
        teamMembers ??= Array.Empty<PalRaceTeamMemberIdentity?>();
        if (teamMembers.Count > 2)
            throw new ArgumentOutOfRangeException(nameof(teamMembers), "PAL ordinary races support at most two saved teammates.");

        var result = new List<PalOrdinaryRaceEntrant>(carCount);
        uint Flags(int carIndex, int configPointerIndex, int startIndex, ushort highFlags) =>
            ((uint)highFlags << 16) | ((uint)startIndex << 10) | ((uint)configPointerIndex << 5) | (uint)carIndex;
        result.Add(new PalOrdinaryRacePlayerEntrant(
            0, 0, carCount - 1, Flags(0, 0, carCount - 1, 0x0002),
            PalRaceControlSource.HumanInput, 0, StartSeed(anchor, carCount - 1)));

        int nextStartIndex = 0;
        for (int slotIndex = 0; slotIndex < 2; slotIndex++)
        {
            PalRaceTeamMemberIdentity? identity = slotIndex < teamMembers.Count ? teamMembers[slotIndex] : null;
            if (identity is null || identity.Value.AreaIndex == 0) continue;
            int teamSlot = slotIndex + 1;
            int carIndex = result.Count;
            ushort highFlags = teamSlot == 1 ? (ushort)0x0090 : (ushort)0x00A0;
            result.Add(new PalOrdinaryRaceTeammateEntrant(
                carIndex, teamSlot, nextStartIndex, Flags(carIndex, teamSlot, nextStartIndex, highFlags),
                PalRaceControlSource.OrdinaryAi, null, StartSeed(anchor, nextStartIndex), teamSlot, identity.Value));
            nextStartIndex++;
        }

        bool IsSavedTeammate(PalRaceParticipantReference participant) => teamMembers.Any(member =>
            member is { } identity && identity.AreaIndex == participant.AreaIndex && identity.ResidentIndex == participant.ResidentIndex);
        void AddOpponent(int participantIndex)
        {
            if (result.Count >= carCount) return;
            PalRaceParticipantReference participant = activity.Participants[participantIndex];
            if (IsSavedTeammate(participant)) return;
            int carIndex = result.Count;
            int configPointerIndex = participantIndex + 3;
            result.Add(new PalOrdinaryRaceOpponentEntrant(
                carIndex, configPointerIndex, nextStartIndex,
                Flags(carIndex, configPointerIndex, nextStartIndex, 0x0080),
                PalRaceControlSource.OrdinaryAi, null, StartSeed(anchor, nextStartIndex), participantIndex, participant));
            nextStartIndex++;
        }

        for (int participantIndex = carCount - 2; participantIndex > carCount - 8; participantIndex--)
            AddOpponent(participantIndex);
        for (int participantIndex = 0; participantIndex < carCount - 1 && result.Count < carCount; participantIndex++)
            AddOpponent(participantIndex);
        if (result.Count != carCount)
            throw new InvalidDataException($"PAL race activity {activity.ActivityId} could not fill its native entrant field.");
        return result;
    }

    /// <summary>
    /// Reads the native ordinary-course navigation tables installed by
    /// 0x00251F98 and consumed by 0x00252328 / ordinary AI 0x00252BA0.
    /// Bytes 0/1 are boundary gate indices, bytes 2..5 are paired backward and
    /// forward record indices, byte 6 is the +0x24B selector output, and byte 7
    /// remains reserved.
    /// </summary>
    public static IReadOnlyList<PalRaceNavigationCourse> ReadNavigationCourses(Stream executable)
    {
        var elf = new Elf32AddressSpace(executable);
        var result = new PalRaceNavigationCourse[OrdinaryRaceCourseCount];
        for (int courseId = 0; courseId < result.Length; courseId++)
        {
            uint pointerAddress = NavigationPointerTableAddress + (uint)(courseId * 8);
            uint gateTableAddress = elf.ReadUInt32(pointerAddress);
            uint recordTableAddress = elf.ReadUInt32(pointerAddress + 4);
            uint span = recordTableAddress - gateTableAddress;
            if (gateTableAddress == 0 || recordTableAddress <= gateTableAddress || span % 24 != 0)
                throw new InvalidDataException($"PAL race course C{courseId:D2} has invalid navigation pointers.");
            int count = checked((int)(span / 24));
            if (count is < 1 or > 255 || !elf.IsFileBacked(gateTableAddress, count * 24) ||
                !elf.IsFileBacked(recordTableAddress, count * 8))
                throw new InvalidDataException($"PAL race course C{courseId:D2} has an invalid navigation table span.");

            var gates = new PalRaceNavigationGate[count];
            var records = new PalRaceNavigationRecord[count];
            for (int index = 0; index < count; index++)
            {
                byte[] gateRaw = elf.ReadBytes(gateTableAddress + (uint)(index * 24), 24);
                var gate = new PalRaceNavigationGate(
                    index,
                    new PalRaceNavigationPoint(ReadSingle(gateRaw, 0), ReadSingle(gateRaw, 4)),
                    new PalRaceNavigationPoint(ReadSingle(gateRaw, 8), ReadSingle(gateRaw, 12)),
                    new PalRaceNavigationPoint(ReadSingle(gateRaw, 16), ReadSingle(gateRaw, 20)));
                if (!float.IsFinite(gate.EndpointA.NativeX) || !float.IsFinite(gate.EndpointA.NativeZ) ||
                    !float.IsFinite(gate.EndpointB.NativeX) || !float.IsFinite(gate.EndpointB.NativeZ) ||
                    !float.IsFinite(gate.BranchPoint.NativeX) || !float.IsFinite(gate.BranchPoint.NativeZ))
                    throw new InvalidDataException($"PAL race course C{courseId:D2} has a non-finite navigation gate {index}.");
                gates[index] = gate;

                byte[] recordRaw = elf.ReadBytes(recordTableAddress + (uint)(index * 8), 8);
                if (recordRaw[..7].Any(value => value >= count))
                    throw new InvalidDataException($"PAL race course C{courseId:D2} navigation record {index} has an invalid gate/record index.");
                records[index] = new PalRaceNavigationRecord(
                    index,
                    recordRaw[0],
                    recordRaw[1],
                    recordRaw[2..4],
                    recordRaw[4..6],
                    recordRaw[6],
                    recordRaw[7]);
            }
            result[courseId] = new PalRaceNavigationCourse(courseId, gateTableAddress, recordTableAddress, gates, records);
        }
        return result;
    }

    /// <summary>
    /// Mirrors the record-transition portion of PAL selector 0x00252328. The
    /// native code walks backward while the car is behind byte-0's gate, or
    /// forward after crossing byte-1's gate. Authored forks select between the
    /// paired records using the car's side of the branch-point divider.
    /// </summary>
    public static PalRaceNavigationAdvance AdvanceNavigation(
        PalRaceNavigationCourse course,
        int currentRecordIndex,
        float nativeX,
        float nativeZ)
    {
        if (currentRecordIndex < 0 || currentRecordIndex >= course.Records.Count)
            throw new ArgumentOutOfRangeException(nameof(currentRecordIndex), "Native navigation record index is outside this course.");
        if (!float.IsFinite(nativeX) || !float.IsFinite(nativeZ))
            throw new ArgumentOutOfRangeException(nameof(nativeX), "Native navigation position must be finite.");

        PalRaceNavigationRecord Record(int index) => index >= 0 && index < course.Records.Count
            ? course.Records[index]
            : throw new InvalidDataException($"Native navigation record {index} is missing.");
        PalRaceNavigationGate Gate(int index) => index >= 0 && index < course.Gates.Count
            ? course.Gates[index]
            : throw new InvalidDataException($"Native navigation gate {index} is missing.");
        bool GateSide(int index)
        {
            PalRaceNavigationGate value = Gate(index);
            return NonNegativeCross(value.EndpointA, value.EndpointB, nativeX, nativeZ);
        }
        byte ForkClass(PalRaceNavigationRecord value)
        {
            if (value.ForwardRecordIndices[0] == value.ForwardRecordIndices[1]) return 2;
            PalRaceNavigationPoint backward = Gate(value.BackwardBoundaryGateIndex).BranchPoint;
            PalRaceNavigationPoint forward = Gate(value.ForwardBoundaryGateIndex).BranchPoint;
            return NonNegativeCross(backward, forward, nativeX, nativeZ) ? (byte)1 : (byte)0;
        }
        int ChooseBackward(PalRaceNavigationRecord value)
        {
            if (value.BackwardRecordIndices[0] == value.BackwardRecordIndices[1]) return value.BackwardRecordIndices[0];
            PalRaceNavigationPoint backward = Gate(value.BackwardBoundaryGateIndex).BranchPoint;
            PalRaceNavigationPoint forward = Gate(value.ForwardBoundaryGateIndex).BranchPoint;
            return value.BackwardRecordIndices[NonNegativeCross(backward, forward, nativeX, nativeZ) ? 1 : 0];
        }
        int ChooseForward(PalRaceNavigationRecord value)
        {
            byte kind = ForkClass(value);
            return value.ForwardRecordIndices[kind == 0 ? 0 : 1];
        }

        int current = currentRecordIndex;
        int transitions = 0;
        void Transition(int next)
        {
            current = next;
            if (++transitions > course.Records.Count * 2)
                throw new InvalidDataException("PAL navigation transition did not converge for this position.");
        }
        if (GateSide(Record(current).BackwardBoundaryGateIndex))
        {
            while (GateSide(Record(current).ForwardBoundaryGateIndex))
                Transition(ChooseForward(Record(current)));
        }
        else
        {
            do Transition(ChooseBackward(Record(current)));
            while (!GateSide(Record(current).BackwardBoundaryGateIndex));
        }

        PalRaceNavigationRecord resolved = Record(current);
        byte forwardChoiceClass = ForkClass(resolved);
        return new PalRaceNavigationAdvance(
            current,
            resolved.SelectorOutput,
            resolved.ForwardRecordIndices[forwardChoiceClass == 0 ? 0 : 1],
            forwardChoiceClass);
    }

    /// <summary>Mirrors the ordered crossing state machine at 0x0022EBA0.</summary>
    public static PalRaceFinishGateAdvance AdvanceFinishGate(
        PalRaceFinishGateSet gates, byte phase, float nativeX, float nativeZ)
    {
        if (phase is < 1 or > 4)
            throw new ArgumentOutOfRangeException(nameof(phase), "Native race finish-gate phase must be 1..4.");
        if (gates.Strips.Count != 3)
            throw new ArgumentException("A native ordinary race requires exactly three finish strips.", nameof(gates));
        if (gates.Strips[0].Contains(nativeX, nativeZ))
            return new PalRaceFinishGateAdvance(2, phase == 4);
        if (gates.Strips[1].Contains(nativeX, nativeZ))
            return new PalRaceFinishGateAdvance(3, false);
        if (gates.Strips[2].Contains(nativeX, nativeZ))
            return new PalRaceFinishGateAdvance(phase == 3 ? (byte)4 : phase, false);
        return new PalRaceFinishGateAdvance(phase == 2 ? (byte)1 : phase, false);
    }

    private static IReadOnlyList<PalRaceParticipantReference> ReadParticipantReferences(Elf32AddressSpace elf, uint address, int activityId)
    {
        if (address == 0 || !elf.IsFileBacked(address, 2))
            throw new InvalidDataException($"PAL race/activity {activityId} has an invalid participant-list pointer.");

        var result = new List<PalRaceParticipantReference>();
        for (int index = 0; index < MaximumParticipantReferences; index++)
        {
            byte[] pair = elf.ReadBytes(address + (uint)(index * 2), 2);
            if (pair[0] == 0 && pair[1] == 0)
                return result;
            uint residentBlock = elf.ReadUInt32(ResidentDefinitionPointerTableAddress + (uint)(pair[0] * 4));
            uint definitionAddress = residentBlock + (uint)(pair[1] * 16);
            if (residentBlock == 0 || !elf.IsFileBacked(definitionAddress, 16))
                throw new InvalidDataException($"PAL race/activity {activityId} participant {pair[0]}:{pair[1]} has no resident definition.");
            result.Add(new PalRaceParticipantReference(
                pair[0],
                pair[1],
                elf.ReadAsciiZ(elf.ReadUInt32(definitionAddress + 12)),
                checked((int)elf.ReadUInt32(definitionAddress + 4)),
                elf.ReadUInt32(definitionAddress)));
        }
        throw new InvalidDataException($"PAL race/activity {activityId} participant list is not terminated.");
    }

    private static uint ReadUInt32(byte[] bytes, int offset) =>
        BinaryPrimitives.ReadUInt32LittleEndian(bytes.AsSpan(offset, 4));

    private static float ReadSingle(byte[] bytes, int offset) =>
        BitConverter.Int32BitsToSingle(BinaryPrimitives.ReadInt32LittleEndian(bytes.AsSpan(offset, 4)));

    private static bool NonNegativeCross(
        PalRaceNavigationPoint start,
        PalRaceNavigationPoint end,
        float nativeX,
        float nativeZ)
    {
        float dx = end.NativeX - start.NativeX;
        float dz = end.NativeZ - start.NativeZ;
        float fromEndX = nativeX - end.NativeX;
        float fromEndZ = nativeZ - end.NativeZ;
        return 0f <= dz * fromEndX - dx * fromEndZ;
    }
}
