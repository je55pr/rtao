import { Elf32AddressSpace } from "./elf32";

export interface RaceParticipantReference {
  readonly areaIndex: number;
  readonly residentIndex: number;
  readonly name: string;
  readonly bodyId: number;
  readonly packedPaint: number;
}

export interface RaceActivityDescriptor {
  readonly activityId: number;
  readonly name: string;
  readonly ordinaryRace: boolean;
  readonly descriptorAddress: number;
  readonly sceneId: number;
  readonly rawParameter1: number;
  readonly rawParameter2: number;
  readonly variantId: number;
  readonly settingsAddress: number;
  readonly participantListAddress: number;
  readonly participants: readonly RaceParticipantReference[];
  readonly rawSettings: Uint8Array;
  readonly handlerAAddress: number;
  readonly handlerBAddress: number;
}

export interface RaceCatalogue {
  readonly ordinaryRaces: readonly RaceActivityDescriptor[];
  readonly activities: readonly RaceActivityDescriptor[];
  readonly selectorRanges: readonly RaceSelectorRange[];
}

export interface RaceSelectorRange {
  readonly areaIndex: number;
  readonly firstActivityId: number;
  readonly activityCount: number;
}

export interface RaceFinishGateStrip {
  readonly minimumX: number;
  readonly minimumZ: number;
  readonly maximumX: number;
  readonly maximumZ: number;
}

export interface RaceFinishGateSet {
  readonly courseId: number;
  readonly strips: readonly [RaceFinishGateStrip, RaceFinishGateStrip, RaceFinishGateStrip];
}

export interface RaceStartAnchor {
  readonly courseId: number;
  readonly nativeX: number;
  readonly nativeY: number;
  readonly nativeZ: number;
  readonly headingQuarterTurns: number;
  readonly lateralPolarity: number;
}

export interface RaceStartSeed {
  readonly courseId: number;
  readonly startIndex: number;
  readonly nativeX: number;
  readonly nativeY: number;
  readonly nativeZ: number;
  readonly nativeYaw: number;
}

export interface RaceTeamMemberIdentity {
  readonly areaIndex: number;
  readonly residentIndex: number;
}

interface OrdinaryRaceEntrantBase {
  readonly carIndex: number;
  readonly configPointerIndex: number;
  readonly startIndex: number;
  readonly packedCreationFlags: number;
  readonly controlSource: "human-input" | "ordinary-ai";
  readonly controllerIndex: 0 | null;
  readonly seed: RaceStartSeed;
}

export interface OrdinaryRacePlayerEntrant extends OrdinaryRaceEntrantBase {
  readonly kind: "player";
}

export interface OrdinaryRaceTeammateEntrant extends OrdinaryRaceEntrantBase {
  readonly kind: "teammate";
  readonly teamSlot: 1 | 2;
  readonly identity: RaceTeamMemberIdentity;
}

export interface OrdinaryRaceOpponentEntrant extends OrdinaryRaceEntrantBase {
  readonly kind: "opponent";
  readonly participantIndex: number;
  readonly participant: RaceParticipantReference;
}

export type OrdinaryRaceEntrant =
  | OrdinaryRacePlayerEntrant
  | OrdinaryRaceTeammateEntrant
  | OrdinaryRaceOpponentEntrant;

export interface RaceNavigationPoint {
  readonly nativeX: number;
  readonly nativeZ: number;
}

export interface RaceNavigationGate {
  readonly gateIndex: number;
  readonly endpointA: RaceNavigationPoint;
  readonly endpointB: RaceNavigationPoint;
  /** Authored point used to divide paired predecessor/successor choices. */
  readonly branchPoint: RaceNavigationPoint;
}

export interface RaceNavigationRecord {
  readonly recordIndex: number;
  readonly backwardBoundaryGateIndex: number;
  /** Also selected as the ordinary AI steering target by handler 0x00252BA0. */
  readonly forwardBoundaryGateIndex: number;
  readonly backwardRecordIndices: readonly [number, number];
  readonly forwardRecordIndices: readonly [number, number];
  /** Byte stored at car +0x24B after the selector resolves a record. */
  readonly selectorOutput: number;
  readonly reservedByte: number;
}

export interface RaceNavigationCourse {
  readonly courseId: number;
  readonly gateTableAddress: number;
  readonly recordTableAddress: number;
  readonly gates: readonly RaceNavigationGate[];
  readonly records: readonly RaceNavigationRecord[];
}

export interface RaceNavigationAdvance {
  /** Record retained in the car's +0x24A byte. */
  readonly currentRecordIndex: number;
  /** Byte written to car +0x24B. */
  readonly selectorOutput: number;
  /** Forward record returned to dispatcher 0x0021B840 and passed to ordinary AI. */
  readonly returnedRecordIndex: number;
  /** Native internal fork class: 2 means the two forward choices are identical. */
  readonly forwardChoiceClass: 0 | 1 | 2;
}

export const palRaceLicenseClassNames = ["C", "B", "A", "Super A"] as const;

/** Six-place Cake schedule selected by descriptor byte 3 at 0x00237A00. */
export const palRacePrizeCakeTable = [
  [800, 500, 400, 300, 200, 100],
  [1500, 1200, 1000, 800, 600, 500],
  [2500, 2000, 1600, 1200, 1000, 800],
  [80000, 60000, 40000, 30000, 20000, 10000],
] as const;

export const palRaceActivityCount = 39;
export const palOrdinaryRaceCount = 24;
export const palOrdinaryRaceCourseCount = 15;
export const palRaceStartAnchorTableAddress = 0x002a9c10;
export const palRaceFinishGateTableAddress = 0x002a9e80;
export const palRaceNavigationPointerTableAddress = 0x002bf5f0;
export const palOrdinaryRaceAiHandlerAddress = 0x00252ba0;
export const palOrdinaryRaceEntrantBuilderAddress = 0x0020f9e8;
export const palModeEightOpponentLoopAddress = 0x00210ba0;
export const palRaceInputDispatcherAddress = 0x0021b840;
export const palPrimaryControllerManagerAddress = 0x0021f540;

const activityNamePointerTableAddress = 0x002c0410;
const residentDefinitionPointerTableAddress = 0x002c4340;
const selectorRangeTableAddress = 0x002c0078;
const selectorRangeCount = 12;
const primaryDescriptorTableAddress = 0x002bfe48;
const primaryDescriptorCount = 35;
const extendedDescriptorTableAddress = 0x002c0090;
const descriptorSize = 16;
const settingsSize = 24;
const maximumParticipantReferences = 64;

/**
 * Reads HG2 PAL's original race/activity catalogue.
 *
 * The selector/launcher at 0x002106B8 uses 0x002BFE48 for IDs 0..34 and
 * 0x002C0090 for IDs 35..38. Selection code at 0x00238D50 treats IDs below
 * 24 as the ordinary race range. Descriptor bytes 1 and 2 and most of the
 * settings block remain raw until their native consumers are fully traced.
 */
export function readRaceCatalogue(bytes: Uint8Array): RaceCatalogue {
  const elf = new Elf32AddressSpace(bytes);
  const activities: RaceActivityDescriptor[] = [];
  for (let activityId = 0; activityId < palRaceActivityCount; activityId += 1) {
    const descriptorAddress = activityId < primaryDescriptorCount
      ? primaryDescriptorTableAddress + activityId * descriptorSize
      : extendedDescriptorTableAddress + (activityId - primaryDescriptorCount) * descriptorSize;
    const descriptor = elf.bytes(descriptorAddress, descriptorSize);
    const settingsAddress = u32(descriptor, 4);
    if (settingsAddress === 0 || !elf.isFileBacked(settingsAddress, settingsSize)) {
      throw new Error(`PAL race/activity ${activityId} has an invalid settings pointer.`);
    }
    const settings = elf.bytes(settingsAddress, settingsSize);
    const participantListAddress = u32(settings, 0);
    activities.push({
      activityId,
      name: elf.asciiZ(elf.u32(activityNamePointerTableAddress + activityId * 4)),
      ordinaryRace: activityId < palOrdinaryRaceCount,
      descriptorAddress,
      sceneId: descriptor[0] ?? 0,
      rawParameter1: descriptor[1] ?? 0,
      rawParameter2: descriptor[2] ?? 0,
      variantId: descriptor[3] ?? 0,
      settingsAddress,
      participantListAddress,
      participants: readParticipantReferences(elf, participantListAddress, activityId),
      rawSettings: settings.slice(4),
      handlerAAddress: u32(descriptor, 8),
      handlerBAddress: u32(descriptor, 12),
    });
  }
  const selectorRanges: RaceSelectorRange[] = [];
  for (let areaIndex = 0; areaIndex < selectorRangeCount; areaIndex += 1) {
    const range = elf.bytes(selectorRangeTableAddress + areaIndex * 2, 2);
    selectorRanges.push({ areaIndex, firstActivityId: range[0] ?? 0, activityCount: range[1] ?? 0 });
  }
  return { ordinaryRaces: activities.slice(0, palOrdinaryRaceCount), activities, selectorRanges };
}

export function raceActivitiesForArea(catalogue: RaceCatalogue, areaIndex: number): readonly RaceActivityDescriptor[] {
  const range = catalogue.selectorRanges[areaIndex];
  if (!range || range.activityCount === 0) return [];
  return catalogue.activities.slice(range.firstActivityId, range.firstActivityId + range.activityCount);
}

export function ordinaryRaceCourseIds(catalogue: RaceCatalogue): readonly number[] {
  return [...new Set(catalogue.ordinaryRaces.map((activity) => activity.sceneId))].sort((a, b) => a - b);
}

/**
 * Reads the three adjacent finish-line strips consumed by ordinary handler
 * 0x0022EBA0. Coordinates remain in native course space; render-space X is
 * reflected separately by the course renderer.
 */
export function readRaceFinishGateSets(bytes: Uint8Array): readonly RaceFinishGateSet[] {
  const elf = new Elf32AddressSpace(bytes);
  return Array.from({ length: palOrdinaryRaceCourseCount }, (_, courseId) => {
    const strips = Array.from({ length: 3 }, (_, stripIndex): RaceFinishGateStrip => {
      const address = palRaceFinishGateTableAddress + courseId * 48 + stripIndex * 16;
      const raw = elf.bytes(address, 16);
      const view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
      const strip = {
        minimumX: view.getFloat32(0, true), minimumZ: view.getFloat32(4, true),
        maximumX: view.getFloat32(8, true), maximumZ: view.getFloat32(12, true),
      };
      if (!Object.values(strip).every(Number.isFinite) || strip.minimumX >= strip.maximumX || strip.minimumZ >= strip.maximumZ) {
        throw new Error(`PAL race course C${courseId.toString().padStart(2, "0")} has an invalid finish strip ${stripIndex}.`);
      }
      return strip;
    }) as [RaceFinishGateStrip, RaceFinishGateStrip, RaceFinishGateStrip];
    return { courseId, strips };
  });
}

/**
 * Reads the 16-byte per-course start anchors consumed by car initialiser
 * 0x00219308. Coordinates are the native seed supplied before the executable's
 * subsequent course-placement helper runs.
 */
export function readRaceStartAnchors(bytes: Uint8Array): readonly RaceStartAnchor[] {
  const elf = new Elf32AddressSpace(bytes);
  return Array.from({ length: palOrdinaryRaceCourseCount }, (_, courseId) => {
    const address = palRaceStartAnchorTableAddress + courseId * 16;
    const raw = elf.bytes(address, 16);
    const view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
    const anchor: RaceStartAnchor = {
      courseId,
      nativeX: view.getFloat32(0, true),
      nativeY: view.getFloat32(4, true),
      nativeZ: view.getFloat32(8, true),
      headingQuarterTurns: view.getInt16(12, true),
      lateralPolarity: view.getInt16(14, true),
    };
    if (![anchor.nativeX, anchor.nativeY, anchor.nativeZ].every(Number.isFinite) ||
        anchor.headingQuarterTurns < 0 || anchor.headingQuarterTurns > 3 ||
        (anchor.lateralPolarity !== 0 && anchor.lateralPolarity !== 1)) {
      throw new Error(`PAL race course C${courseId.toString().padStart(2, "0")} has an invalid start anchor.`);
    }
    return anchor;
  });
}

/**
 * Mirrors the ordinary-course branch at 0x002195F4. The native start index is
 * the five-bit value extracted from creation flags at 0x002195E8. Even slots
 * stay on the anchor lane; odd slots receive the native 7.5-unit stagger.
 */
export function nativeRaceStartSeed(anchor: RaceStartAnchor, startIndex: number): RaceStartSeed {
  if (!Number.isInteger(startIndex) || startIndex < 0 || startIndex > 31) {
    throw new RangeError("Native race start index must be an integer from 0 through 31.");
  }
  let nativeX = anchor.nativeX;
  let nativeZ = anchor.nativeZ;
  const longitudinal = startIndex * 5;
  const lateralMagnitude = (startIndex & 1) * 7.5;
  const lateral = (anchor.lateralPolarity === 0 ? 1 : -1) * lateralMagnitude;
  switch (anchor.headingQuarterTurns) {
    case 0: nativeX += lateral; nativeZ -= longitudinal; break;
    case 1: nativeX -= longitudinal; nativeZ += lateral; break;
    case 2: nativeX -= lateral; nativeZ += longitudinal; break;
    case 3: nativeX += longitudinal; nativeZ -= lateral; break;
    default: throw new RangeError("Native race heading must be a cardinal quarter turn from 0 through 3.");
  }
  return {
    courseId: anchor.courseId,
    startIndex,
    nativeX,
    nativeY: anchor.nativeY,
    nativeZ,
    nativeYaw: anchor.headingQuarterTurns << 14,
  };
}

/**
 * Mirrors PAL's ordinary-race entrant builder at 0x0020F9E8.
 *
 * Car 0 uses persistent config pointer 0 and the final grid slot. Active saved
 * team identities use config pointers 1/2 and the first grid slots. Opponents
 * then fill the field from the descriptor's resident pool: indices 22..17 are
 * considered first, followed by 0..22, with saved teammates filtered by the
 * exact identity comparison at 0x0023F6E0. The independent 0x00210BA0 loop is
 * mode 8 / activity 24 and must not be used as an ordinary-race roster.
 */
export function ordinaryRaceEntrants(
  activity: RaceActivityDescriptor,
  anchor: RaceStartAnchor,
  teamMembers: readonly (RaceTeamMemberIdentity | undefined)[] = [],
): readonly OrdinaryRaceEntrant[] {
  if (!activity.ordinaryRace) throw new Error(`Activity ${activity.activityId} is not an ordinary PAL race.`);
  if (activity.sceneId !== anchor.courseId) {
    throw new Error(`PAL race activity ${activity.activityId} and course start anchor do not match.`);
  }
  const carCount = activity.rawParameter1;
  if (carCount < 2 || carCount > 32 || activity.participants.length < carCount - 1) {
    throw new Error(`PAL race activity ${activity.activityId} has an incomplete participant pool.`);
  }
  if (teamMembers.length > 2) throw new RangeError("PAL ordinary races support at most two saved teammates.");
  for (const member of teamMembers) {
    if (member && (!Number.isInteger(member.areaIndex) || member.areaIndex < 0 || member.areaIndex > 0xff ||
        !Number.isInteger(member.residentIndex) || member.residentIndex < 0 || member.residentIndex > 0xff)) {
      throw new RangeError("PAL teammate identities must contain byte-sized area and resident indices.");
    }
  }

  const result: OrdinaryRaceEntrant[] = [];
  const addBase = (kind: "player" | "teammate" | "opponent", carIndex: number, configPointerIndex: number,
    startIndex: number, highFlags: number): OrdinaryRaceEntrantBase & { readonly kind: typeof kind } => {
    const packedCreationFlags = ((highFlags & 0xffff) << 16) | (startIndex << 10) | (configPointerIndex << 5) | carIndex;
    const ordinaryAi = (highFlags & 0x0080) !== 0;
    return { kind, carIndex, configPointerIndex, startIndex, packedCreationFlags: packedCreationFlags >>> 0,
      controlSource: ordinaryAi ? "ordinary-ai" : "human-input", controllerIndex: ordinaryAi ? null : 0,
      seed: nativeRaceStartSeed(anchor, startIndex) };
  };
  result.push(addBase("player", 0, 0, carCount - 1, 0x0002) as OrdinaryRacePlayerEntrant);

  let nextStartIndex = 0;
  for (let slotIndex = 0; slotIndex < 2; slotIndex += 1) {
    const identity = teamMembers[slotIndex];
    if (!identity || identity.areaIndex === 0) continue;
    const teamSlot = (slotIndex + 1) as 1 | 2;
    result.push({
      ...addBase("teammate", result.length, teamSlot, nextStartIndex, teamSlot === 1 ? 0x0090 : 0x00a0),
      teamSlot,
      identity,
    } as OrdinaryRaceTeammateEntrant);
    nextStartIndex += 1;
  }

  const isSavedTeammate = (participant: RaceParticipantReference): boolean => teamMembers.some((member) =>
    member?.areaIndex === participant.areaIndex && member.residentIndex === participant.residentIndex);
  const addOpponent = (participantIndex: number): void => {
    if (result.length >= carCount) return;
    const participant = activity.participants[participantIndex];
    if (!participant) throw new Error(`PAL race activity ${activity.activityId} is missing participant ${participantIndex}.`);
    if (isSavedTeammate(participant)) return;
    result.push({
      ...addBase("opponent", result.length, participantIndex + 3, nextStartIndex, 0x0080),
      participantIndex,
      participant,
    } as OrdinaryRaceOpponentEntrant);
    nextStartIndex += 1;
  };
  for (let participantIndex = carCount - 2; participantIndex > carCount - 8; participantIndex -= 1) {
    addOpponent(participantIndex);
  }
  for (let participantIndex = 0; participantIndex < carCount - 1 && result.length < carCount; participantIndex += 1) {
    addOpponent(participantIndex);
  }
  if (result.length !== carCount) throw new Error(`PAL race activity ${activity.activityId} could not fill its native entrant field.`);
  return result;
}

/**
 * Reads the native ordinary-course navigation tables installed by car setup
 * 0x00251F98 and consumed by selector 0x00252328 / AI handler 0x00252BA0.
 * Each course owns one 24-byte gate and one 8-byte routing record per index.
 * Selector 0x00252328 proves bytes 0/1 are boundary gate indices, bytes 2..5
 * are paired backward/forward record indices, and byte 6 is stored at car
 * +0x24B. Byte 7 remains reserved.
 */
export function readRaceNavigationCourses(bytes: Uint8Array): readonly RaceNavigationCourse[] {
  const elf = new Elf32AddressSpace(bytes);
  return Array.from({ length: palOrdinaryRaceCourseCount }, (_, courseId) => {
    const pointerAddress = palRaceNavigationPointerTableAddress + courseId * 8;
    const gateTableAddress = elf.u32(pointerAddress);
    const recordTableAddress = elf.u32(pointerAddress + 4);
    const span = recordTableAddress - gateTableAddress;
    if (gateTableAddress === 0 || recordTableAddress <= gateTableAddress || span % 24 !== 0) {
      throw new Error(`PAL race course C${courseId.toString().padStart(2, "0")} has invalid navigation pointers.`);
    }
    const count = span / 24;
    if (count < 1 || count > 255 || !elf.isFileBacked(gateTableAddress, count * 24) ||
        !elf.isFileBacked(recordTableAddress, count * 8)) {
      throw new Error(`PAL race course C${courseId.toString().padStart(2, "0")} has an invalid navigation table span.`);
    }
    const gates = Array.from({ length: count }, (_, gateIndex): RaceNavigationGate => {
      const raw = elf.bytes(gateTableAddress + gateIndex * 24, 24);
      const view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
      const point = (offset: number): RaceNavigationPoint => ({
        nativeX: view.getFloat32(offset, true),
        nativeZ: view.getFloat32(offset + 4, true),
      });
      const gate = { gateIndex, endpointA: point(0), endpointB: point(8), branchPoint: point(16) };
      if (![gate.endpointA, gate.endpointB, gate.branchPoint]
          .flatMap((value) => [value.nativeX, value.nativeZ]).every(Number.isFinite)) {
        throw new Error(`PAL race course C${courseId.toString().padStart(2, "0")} has a non-finite navigation gate ${gateIndex}.`);
      }
      return gate;
    });
    const records = Array.from({ length: count }, (_, recordIndex): RaceNavigationRecord => {
      const raw = [...elf.bytes(recordTableAddress + recordIndex * 8, 8)];
      const consumed = raw.slice(0, 7);
      if (consumed.some((index) => index >= count)) {
        throw new Error(`PAL race course C${courseId.toString().padStart(2, "0")} navigation record ${recordIndex} has an invalid gate/record index.`);
      }
      return {
        recordIndex,
        backwardBoundaryGateIndex: consumed[0]!,
        forwardBoundaryGateIndex: consumed[1]!,
        backwardRecordIndices: [consumed[2]!, consumed[3]!],
        forwardRecordIndices: [consumed[4]!, consumed[5]!],
        selectorOutput: consumed[6]!,
        reservedByte: raw[7]!,
      };
    });
    return { courseId, gateTableAddress, recordTableAddress, gates, records };
  });
}

/**
 * Mirrors the record-transition portion of PAL selector 0x00252328.
 *
 * The native code walks backward while the car remains behind byte-0's gate,
 * or forward while it has crossed byte-1's gate. At authored forks it chooses
 * between the paired records by the car's side of the line joining the two
 * gates' branch points. The returned look-ahead record is passed unchanged by
 * dispatcher 0x0021B840 to the ordinary AI handler.
 */
export function advanceRaceNavigation(
  course: RaceNavigationCourse,
  currentRecordIndex: number,
  nativeX: number,
  nativeZ: number,
): RaceNavigationAdvance {
  if (!Number.isInteger(currentRecordIndex) || currentRecordIndex < 0 || currentRecordIndex >= course.records.length) {
    throw new RangeError("Native navigation record index is outside this course.");
  }
  if (!Number.isFinite(nativeX) || !Number.isFinite(nativeZ)) {
    throw new RangeError("Native navigation position must be finite.");
  }
  const record = (index: number): RaceNavigationRecord => {
    const value = course.records[index];
    if (!value) throw new RangeError(`Native navigation record ${index} is missing.`);
    return value;
  };
  const gate = (index: number): RaceNavigationGate => {
    const value = course.gates[index];
    if (!value) throw new RangeError(`Native navigation gate ${index} is missing.`);
    return value;
  };
  const gateSide = (index: number): boolean => {
    const value = gate(index);
    return nonNegativeCross(value.endpointA, value.endpointB, nativeX, nativeZ);
  };
  const forkClass = (value: RaceNavigationRecord): 0 | 1 | 2 => {
    if (value.forwardRecordIndices[0] === value.forwardRecordIndices[1]) return 2;
    const backward = gate(value.backwardBoundaryGateIndex).branchPoint;
    const forward = gate(value.forwardBoundaryGateIndex).branchPoint;
    return nonNegativeCross(backward, forward, nativeX, nativeZ) ? 1 : 0;
  };
  const chooseBackward = (value: RaceNavigationRecord): number => {
    if (value.backwardRecordIndices[0] === value.backwardRecordIndices[1]) return value.backwardRecordIndices[0];
    const backward = gate(value.backwardBoundaryGateIndex).branchPoint;
    const forward = gate(value.forwardBoundaryGateIndex).branchPoint;
    return value.backwardRecordIndices[nonNegativeCross(backward, forward, nativeX, nativeZ) ? 1 : 0];
  };
  const chooseForward = (value: RaceNavigationRecord): number => {
    const kind = forkClass(value);
    return value.forwardRecordIndices[kind === 0 ? 0 : 1];
  };

  let current = currentRecordIndex;
  let transitions = 0;
  const transition = (next: number): void => {
    current = next;
    transitions += 1;
    if (transitions > course.records.length * 2) {
      throw new Error("PAL navigation transition did not converge for this position.");
    }
  };
  if (gateSide(record(current).backwardBoundaryGateIndex)) {
    while (gateSide(record(current).forwardBoundaryGateIndex)) transition(chooseForward(record(current)));
  } else {
    do transition(chooseBackward(record(current)));
    while (!gateSide(record(current).backwardBoundaryGateIndex));
  }

  const resolved = record(current);
  const forwardChoiceClass = forkClass(resolved);
  return {
    currentRecordIndex: current,
    selectorOutput: resolved.selectorOutput,
    returnedRecordIndex: resolved.forwardRecordIndices[forwardChoiceClass === 0 ? 0 : 1],
    forwardChoiceClass,
  };
}

function nonNegativeCross(
  start: RaceNavigationPoint,
  end: RaceNavigationPoint,
  nativeX: number,
  nativeZ: number,
): boolean {
  const dx = Math.fround(end.nativeX - start.nativeX);
  const dz = Math.fround(end.nativeZ - start.nativeZ);
  const fromEndX = Math.fround(nativeX - end.nativeX);
  const fromEndZ = Math.fround(nativeZ - end.nativeZ);
  return 0 <= Math.fround(Math.fround(dz * fromEndX) - Math.fround(dx * fromEndZ));
}

/**
 * Mirrors 0x00237A00: each participating team car contributes the prize at its
 * zero-based finish index; indices outside 0..5 contribute nothing.
 */
export function racePrizeCakeFromNativeFinishIndices(variantId: number, finishIndices: readonly number[]): number {
  const row = palRacePrizeCakeTable[variantId];
  if (!row) return 0;
  return finishIndices.reduce((sum, finishIndex) => sum + (row[finishIndex] ?? 0), 0);
}

function readParticipantReferences(elf: Elf32AddressSpace, address: number, activityId: number): RaceParticipantReference[] {
  if (address === 0 || !elf.isFileBacked(address, 2)) {
    throw new Error(`PAL race/activity ${activityId} has an invalid participant-list pointer.`);
  }
  const result: RaceParticipantReference[] = [];
  for (let index = 0; index < maximumParticipantReferences; index += 1) {
    const pair = elf.bytes(address + index * 2, 2);
    const areaIndex = pair[0] ?? 0, residentIndex = pair[1] ?? 0;
    if (areaIndex === 0 && residentIndex === 0) return result;
    const residentBlock = elf.u32(residentDefinitionPointerTableAddress + areaIndex * 4);
    const definitionAddress = residentBlock + residentIndex * 16;
    if (residentBlock === 0 || !elf.isFileBacked(definitionAddress, 16)) {
      throw new Error(`PAL race/activity ${activityId} participant ${areaIndex}:${residentIndex} has no resident definition.`);
    }
    result.push({
      areaIndex,
      residentIndex,
      name: elf.asciiZ(elf.u32(definitionAddress + 12)),
      bodyId: elf.u32(definitionAddress + 4),
      packedPaint: elf.u32(definitionAddress),
    });
  }
  throw new Error(`PAL race/activity ${activityId} participant list is not terminated.`);
}

function u32(bytes: Uint8Array, offset: number): number {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(offset, true);
}
