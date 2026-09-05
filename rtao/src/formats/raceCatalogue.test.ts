import { describe, expect, test } from "vitest";
import {
  advanceRaceNavigation,
  ordinaryRaceCourseIds,
  palOrdinaryRaceCount,
  palOrdinaryRaceCourseCount,
  palRaceActivityCount,
  nativeRaceStartSeed,
  ordinaryRaceEntrants,
  readRaceNavigationCourses,
  readRaceFinishGateSets,
  readRaceStartAnchors,
  raceActivitiesForArea,
  racePrizeCakeFromNativeFinishIndices,
  readRaceCatalogue,
} from "./raceCatalogue";
import type { RaceNavigationCourse } from "./raceCatalogue";

describe("PAL race/activity catalogue", () => {
  test("reads the split 39-entry descriptor catalogue and terminated participant pools", () => {
    const bytes = syntheticRaceElf();
    const catalogue = readRaceCatalogue(bytes);
    expect(catalogue.activities).toHaveLength(palRaceActivityCount);
    expect(catalogue.ordinaryRaces).toHaveLength(palOrdinaryRaceCount);
    expect(catalogue.activities[0]).toMatchObject({
      activityId: 0,
      name: "Activity 00",
      ordinaryRace: true,
      descriptorAddress: 0x002bfe48,
      sceneId: 0,
      rawParameter1: 0x18,
      rawParameter2: 3,
      variantId: 0,
      participants: [
        { areaIndex: 8, residentIndex: 17, name: "Racer 8:17", bodyId: 81, packedPaint: 0x810011 },
        { areaIndex: 1, residentIndex: 28, name: "Racer 1:28", bodyId: 128, packedPaint: 0x128001c },
      ],
      handlerAAddress: 0x0022f3f8,
      handlerBAddress: 0x00252ba0,
    });
    expect([...catalogue.activities[0]!.rawSettings]).toEqual([0x36, 2, 2, 2, ...new Array(16).fill(0)]);
    expect(catalogue.activities[23]?.ordinaryRace).toBe(true);
    expect(catalogue.activities[24]?.ordinaryRace).toBe(false);
    expect(catalogue.activities[34]?.descriptorAddress).toBe(0x002c0068);
    expect(catalogue.activities[35]).toMatchObject({
      name: "Activity 35",
      descriptorAddress: 0x002c0090,
      sceneId: 0x13,
    });
    expect(catalogue.activities[38]?.descriptorAddress).toBe(0x002c00c0);
    expect(catalogue.selectorRanges[1]).toEqual({ areaIndex: 1, firstActivityId: 0, activityCount: 3 });
    expect(raceActivitiesForArea(catalogue, 1).map((activity) => activity.activityId)).toEqual([0, 1, 2]);
    expect(raceActivitiesForArea(catalogue, 0)).toEqual([]);
    expect(ordinaryRaceCourseIds(catalogue)).toEqual([...Array(24).keys()]);
  });

  test("reproduces the executable's six-place team Cake schedule", () => {
    expect(racePrizeCakeFromNativeFinishIndices(0, [0])).toBe(800);
    expect(racePrizeCakeFromNativeFinishIndices(1, [0, 2, 5])).toBe(3000);
    expect(racePrizeCakeFromNativeFinishIndices(2, [1, 3, 0xff])).toBe(3200);
    expect(racePrizeCakeFromNativeFinishIndices(3, [0, 1, 2])).toBe(180000);
    expect(racePrizeCakeFromNativeFinishIndices(4, [0])).toBe(0);
  });

  test("reads the three native finish-line strips for every ordinary course", () => {
    const gates = readRaceFinishGateSets(syntheticFinishGateElf());
    expect(gates).toHaveLength(palOrdinaryRaceCourseCount);
    expect(gates[0]).toEqual({
      courseId: 0,
      strips: [
        { minimumX: 588, minimumZ: 535, maximumX: 590, maximumZ: 576.75 },
        { minimumX: 590, minimumZ: 535, maximumX: 592, maximumZ: 576.75 },
        { minimumX: 592, minimumZ: 535, maximumX: 594, maximumZ: 576.75 },
      ],
    });
    expect(gates[14]?.strips[2]).toEqual({ minimumX: 839, minimumZ: 498, maximumX: 841, maximumZ: 549.5 });
  });

  test("reads native start anchors and reproduces the four cardinal stagger branches", () => {
    const anchors = readRaceStartAnchors(syntheticStartAnchorElf());
    expect(anchors).toHaveLength(palOrdinaryRaceCourseCount);
    expect(anchors[0]).toEqual({
      courseId: 0, nativeX: 572.25, nativeY: 1.125, nativeZ: 561.5,
      headingQuarterTurns: 0, lateralPolarity: 0,
    });
    expect(nativeRaceStartSeed(anchors[0]!, 3)).toEqual({
      courseId: 0, startIndex: 3, nativeX: 579.75, nativeY: 1.125,
      nativeZ: 546.5, nativeYaw: 0,
    });
    expect(nativeRaceStartSeed(anchors[1]!, 3)).toMatchObject({ nativeX: 557.25, nativeZ: 569, nativeYaw: 0x4000 });
    expect(nativeRaceStartSeed(anchors[2]!, 3)).toMatchObject({ nativeX: 579.75, nativeZ: 576.5, nativeYaw: 0x8000 });
    expect(nativeRaceStartSeed(anchors[3]!, 3)).toMatchObject({ nativeX: 587.25, nativeZ: 569, nativeYaw: 0xc000 });
    expect(() => nativeRaceStartSeed(anchors[0]!, 32)).toThrow(/0 through 31/);
  });

  test("reproduces the executable's ordinary player and solo opponent order", () => {
    const activity = readRaceCatalogue(syntheticRaceElf()).ordinaryRaces[0]!;
    const participants = Array.from({ length: 23 }, (_, participantIndex) => ({
      areaIndex: 1,
      residentIndex: participantIndex + 1,
      name: `Opponent ${participantIndex}`,
      bodyId: 100 + participantIndex,
      packedPaint: participantIndex,
    }));
    const ordinary = { ...activity, participants };
    const anchor = readRaceStartAnchors(syntheticStartAnchorElf())[0]!;
    const entrants = ordinaryRaceEntrants(ordinary, anchor);
    expect(entrants).toHaveLength(24);
    expect(entrants[0]).toMatchObject({
      kind: "player", carIndex: 0, configPointerIndex: 0, startIndex: 23,
      packedCreationFlags: 0x00025c00, controlSource: "human-input", controllerIndex: 0,
      seed: { startIndex: 23 },
    });
    expect(entrants[1]).toMatchObject({
      kind: "opponent", carIndex: 1, configPointerIndex: 25, participantIndex: 22, startIndex: 0,
      participant: { name: "Opponent 22" },
      packedCreationFlags: 0x00800321, controlSource: "ordinary-ai", controllerIndex: null,
      seed: { startIndex: 0 },
    });
    expect(entrants[6]).toMatchObject({ kind: "opponent", participantIndex: 17, startIndex: 5 });
    expect(entrants[7]).toMatchObject({ kind: "opponent", participantIndex: 0, startIndex: 6 });
    expect(entrants[23]).toMatchObject({
      kind: "opponent", carIndex: 23, configPointerIndex: 19, participantIndex: 16, startIndex: 22,
      participant: { name: "Opponent 16" }, seed: { startIndex: 22 },
    });
  });

  test("places saved teammates first and filters their resident identities from opponents", () => {
    const activity = readRaceCatalogue(syntheticRaceElf()).ordinaryRaces[0]!;
    const participants = Array.from({ length: 23 }, (_, participantIndex) => ({
      areaIndex: 1, residentIndex: participantIndex + 1, name: `Opponent ${participantIndex}`,
      bodyId: 100 + participantIndex, packedPaint: participantIndex,
    }));
    const ordinary = { ...activity, participants };
    const anchor = readRaceStartAnchors(syntheticStartAnchorElf())[0]!;
    const entrants = ordinaryRaceEntrants(ordinary, anchor, [
      { areaIndex: 1, residentIndex: 6 },
      { areaIndex: 1, residentIndex: 21 },
    ]);
    expect(entrants.slice(0, 3)).toMatchObject([
      { kind: "player", carIndex: 0, startIndex: 23 },
      { kind: "teammate", teamSlot: 1, carIndex: 1, configPointerIndex: 1, startIndex: 0, packedCreationFlags: 0x00900021, controlSource: "ordinary-ai" },
      { kind: "teammate", teamSlot: 2, carIndex: 2, configPointerIndex: 2, startIndex: 1, packedCreationFlags: 0x00a00442, controlSource: "ordinary-ai" },
    ]);
    const opponents = entrants.filter((entrant) => entrant.kind === "opponent");
    expect(opponents).toHaveLength(21);
    expect(opponents.map((entrant) => entrant.participantIndex)).toEqual([
      22, 21, 19, 18, 17, 0, 1, 2, 3, 4, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16,
    ]);
    expect(opponents[0]).toMatchObject({ carIndex: 3, startIndex: 2, configPointerIndex: 25 });
    expect(opponents.at(-1)).toMatchObject({ carIndex: 23, startIndex: 22, configPointerIndex: 19 });
  });

  test("reads executable-owned navigation gates and typed routing records", () => {
    const courses = readRaceNavigationCourses(syntheticNavigationElf());
    expect(courses).toHaveLength(palOrdinaryRaceCourseCount);
    expect(courses[0]).toMatchObject({
      courseId: 0,
      gateTableAddress: 0x002ae000,
      recordTableAddress: 0x002ae030,
      gates: [
        { gateIndex: 0, endpointA: { nativeX: 10, nativeZ: 20 }, endpointB: { nativeX: 12, nativeZ: 24 }, branchPoint: { nativeX: 0, nativeZ: 0 } },
        { gateIndex: 1, endpointA: { nativeX: 30, nativeZ: 40 }, endpointB: { nativeX: 32, nativeZ: 44 }, branchPoint: { nativeX: 31, nativeZ: 42 } },
      ],
      records: [
        { recordIndex: 0, backwardBoundaryGateIndex: 0, forwardBoundaryGateIndex: 1,
          backwardRecordIndices: [0, 1], forwardRecordIndices: [0, 1], selectorOutput: 0, reservedByte: 0 },
        { recordIndex: 1, backwardBoundaryGateIndex: 1, forwardBoundaryGateIndex: 0,
          backwardRecordIndices: [1, 0], forwardRecordIndices: [1, 0], selectorOutput: 1, reservedByte: 0 },
      ],
    });
    expect(courses[14]?.records).toHaveLength(2);
  });

  test("mirrors the selector's authored forward fork and returned look-ahead record", () => {
    const course = syntheticSelectorCourse();
    expect(advanceRaceNavigation(course, 0, 15, 1)).toEqual({
      currentRecordIndex: 1,
      selectorOutput: 8,
      returnedRecordIndex: 2,
      forwardChoiceClass: 2,
    });
    expect(advanceRaceNavigation(course, 0, 15, -1)).toEqual({
      currentRecordIndex: 2,
      selectorOutput: 9,
      returnedRecordIndex: 3,
      forwardChoiceClass: 2,
    });
  });

  test("mirrors the selector's backward record walk", () => {
    const course = syntheticSelectorCourse();
    expect(advanceRaceNavigation(course, 1, -5, 1)).toEqual({
      currentRecordIndex: 3,
      selectorOutput: 10,
      returnedRecordIndex: 0,
      forwardChoiceClass: 2,
    });
  });

  test("rejects an unterminated participant pool", () => {
    const bytes = syntheticRaceElf();
    const view = new DataView(bytes.buffer);
    const virtualToFile = (address: number) => 0x100 + address - 0x002bf000;
    for (let index = 0; index < 64; index += 1) {
      bytes.set([1, 28], virtualToFile(0x002c0b00 + index * 2));
    }
    view.setUint32(virtualToFile(0x002c0700), 0x002c0b00, true);
    expect(() => readRaceCatalogue(bytes)).toThrow(/not terminated/);
  });
});

function syntheticRaceElf(): Uint8Array {
  const virtualBase = 0x002bf000;
  const fileBase = 0x100;
  const bytes = new Uint8Array(0x7000);
  const view = new DataView(bytes.buffer);
  bytes.set([0x7f, 0x45, 0x4c, 0x46, 1, 1], 0);
  view.setUint32(0x1c, 0x34, true); view.setUint16(0x2a, 32, true); view.setUint16(0x2c, 1, true);
  view.setUint32(0x34, 1, true); view.setUint32(0x38, fileBase, true); view.setUint32(0x3c, virtualBase, true);
  view.setUint32(0x44, bytes.length - fileBase, true); view.setUint32(0x48, bytes.length - fileBase, true);
  const file = (address: number) => fileBase + address - virtualBase;
  const putU32 = (address: number, value: number) => view.setUint32(file(address), value, true);
  bytes.set([0, 0, 0, 3, 3, 3, 6, 4, 10, 4, 14, 4, 18, 2, 20, 4, 25, 1, 24, 1, 0, 0, 0, 0], file(0x002c0078));
  for (const areaIndex of [1, 8]) {
    const residentBlock = 0x002c1800 + areaIndex * 0x200;
    putU32(0x002c4340 + areaIndex * 4, residentBlock);
    for (const residentIndex of areaIndex === 1 ? [28] : [17]) {
      const definition = residentBlock + residentIndex * 16;
      const nameAddress = 0x002c1600 + areaIndex * 0x40 + residentIndex;
      const label = new TextEncoder().encode(`Racer ${areaIndex}:${residentIndex}\0`);
      bytes.set(label, file(nameAddress));
      putU32(definition, areaIndex === 1 ? 0x128001c : 0x810011);
      putU32(definition + 4, areaIndex === 1 ? 128 : 81);
      putU32(definition + 12, nameAddress);
    }
  }

  for (let activityId = 0; activityId < palRaceActivityCount; activityId += 1) {
    const nameAddress = 0x002c1000 + activityId * 24;
    const name = new TextEncoder().encode(`Activity ${activityId.toString().padStart(2, "0")}\0`);
    bytes.set(name, file(nameAddress));
    putU32(0x002c0410 + activityId * 4, nameAddress);

    const descriptorAddress = activityId < 35
      ? 0x002bfe48 + activityId * 16
      : 0x002c0090 + (activityId - 35) * 16;
    const settingsAddress = 0x002c0700 + activityId * 24;
    const participantAddress = 0x002c0b00 + activityId * 8;
    bytes.set([
      activityId < 35 ? activityId : 0x13 + activityId - 35,
      0x18,
      3,
      activityId & 3,
    ], file(descriptorAddress));
    putU32(descriptorAddress + 4, settingsAddress);
    putU32(descriptorAddress + 8, 0x0022f3f8);
    putU32(descriptorAddress + 12, 0x00252ba0);
    putU32(settingsAddress, participantAddress);
    bytes.set([0x36, 2, 2, 2, ...new Array(16).fill(0)], file(settingsAddress + 4));
    bytes.set([8, 17, 1, 28, 0, 0], file(participantAddress));
  }
  return bytes;
}

function syntheticFinishGateElf(): Uint8Array {
  const virtualBase = 0x002a9000, fileBase = 0x100;
  const bytes = new Uint8Array(0x3000), view = new DataView(bytes.buffer);
  bytes.set([0x7f, 0x45, 0x4c, 0x46, 1, 1], 0);
  view.setUint32(0x1c, 0x34, true); view.setUint16(0x2a, 32, true); view.setUint16(0x2c, 1, true);
  view.setUint32(0x34, 1, true); view.setUint32(0x38, fileBase, true); view.setUint32(0x3c, virtualBase, true);
  view.setUint32(0x44, bytes.length - fileBase, true); view.setUint32(0x48, bytes.length - fileBase, true);
  const file = (address: number) => fileBase + address - virtualBase;
  for (let courseId = 0; courseId < palOrdinaryRaceCourseCount; courseId += 1) {
    const base = file(0x002a9e80 + courseId * 48);
    const strips = courseId === 0
      ? [[588, 535, 590, 576.75], [590, 535, 592, 576.75], [592, 535, 594, 576.75]]
      : courseId === 14
        ? [[843, 498, 845, 549.5], [841, 498, 843, 549.5], [839, 498, 841, 549.5]]
        : [[10, 20, 12, 30], [12, 20, 14, 30], [14, 20, 16, 30]];
    strips.flat().forEach((value, index) => view.setFloat32(base + index * 4, value, true));
  }
  return bytes;
}

function syntheticStartAnchorElf(): Uint8Array {
  const virtualBase = 0x002a9000, fileBase = 0x100;
  const bytes = new Uint8Array(0x3000), view = new DataView(bytes.buffer);
  bytes.set([0x7f, 0x45, 0x4c, 0x46, 1, 1], 0);
  view.setUint32(0x1c, 0x34, true); view.setUint16(0x2a, 32, true); view.setUint16(0x2c, 1, true);
  view.setUint32(0x34, 1, true); view.setUint32(0x38, fileBase, true); view.setUint32(0x3c, virtualBase, true);
  view.setUint32(0x44, bytes.length - fileBase, true); view.setUint32(0x48, bytes.length - fileBase, true);
  const file = (address: number) => fileBase + address - virtualBase;
  for (let courseId = 0; courseId < palOrdinaryRaceCourseCount; courseId += 1) {
    const base = file(0x002a9c10 + courseId * 16);
    view.setFloat32(base, 572.25, true); view.setFloat32(base + 4, 1.125, true); view.setFloat32(base + 8, 561.5, true);
    view.setInt16(base + 12, courseId & 3, true); view.setInt16(base + 14, courseId === 2 || courseId === 3 ? 1 : 0, true);
  }
  return bytes;
}

function syntheticNavigationElf(): Uint8Array {
  const virtualBase = 0x002ad000, fileBase = 0x100;
  const bytes = new Uint8Array(0x14000), view = new DataView(bytes.buffer);
  bytes.set([0x7f, 0x45, 0x4c, 0x46, 1, 1], 0);
  view.setUint32(0x1c, 0x34, true); view.setUint16(0x2a, 32, true); view.setUint16(0x2c, 1, true);
  view.setUint32(0x34, 1, true); view.setUint32(0x38, fileBase, true); view.setUint32(0x3c, virtualBase, true);
  view.setUint32(0x44, bytes.length - fileBase, true); view.setUint32(0x48, bytes.length - fileBase, true);
  const file = (address: number) => fileBase + address - virtualBase;
  const gateTableAddress = 0x002ae000, recordTableAddress = gateTableAddress + 48;
  for (let courseId = 0; courseId < palOrdinaryRaceCourseCount; courseId += 1) {
    view.setUint32(file(0x002bf5f0 + courseId * 8), gateTableAddress, true);
    view.setUint32(file(0x002bf5f4 + courseId * 8), recordTableAddress, true);
  }
  [10, 20, 12, 24, 0, 0, 30, 40, 32, 44, 31, 42]
    .forEach((value, index) => view.setFloat32(file(gateTableAddress) + index * 4, value, true));
  bytes.set([0, 1, 0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 1, 0, 1, 0], file(recordTableAddress));
  return bytes;
}

function syntheticSelectorCourse(): RaceNavigationCourse {
  const gate = (gateIndex: number, x: number) => ({
    gateIndex,
    endpointA: { nativeX: x, nativeZ: -1 },
    endpointB: { nativeX: x, nativeZ: 1 },
    branchPoint: { nativeX: x, nativeZ: 0 },
  });
  return {
    courseId: 0,
    gateTableAddress: 0,
    recordTableAddress: 0,
    gates: [gate(0, 0), gate(1, 10), gate(2, 20), gate(3, -10)],
    records: [
      { recordIndex: 0, backwardBoundaryGateIndex: 0, forwardBoundaryGateIndex: 1,
        backwardRecordIndices: [3, 3], forwardRecordIndices: [1, 2], selectorOutput: 7, reservedByte: 0 },
      { recordIndex: 1, backwardBoundaryGateIndex: 1, forwardBoundaryGateIndex: 2,
        backwardRecordIndices: [0, 3], forwardRecordIndices: [2, 2], selectorOutput: 8, reservedByte: 0 },
      { recordIndex: 2, backwardBoundaryGateIndex: 1, forwardBoundaryGateIndex: 2,
        backwardRecordIndices: [0, 0], forwardRecordIndices: [3, 3], selectorOutput: 9, reservedByte: 0 },
      { recordIndex: 3, backwardBoundaryGateIndex: 3, forwardBoundaryGateIndex: 0,
        backwardRecordIndices: [3, 3], forwardRecordIndices: [0, 0], selectorOutput: 10, reservedByte: 0 },
    ],
  };
}
