import { describe, expect, test } from "vitest";
import type {
  RaceActivityDescriptor,
  RaceNavigationCourse,
  RaceStartAnchor,
} from "../../formats/raceCatalogue";
import {
  advanceOrdinaryRaceEntrantFrame,
  createOrdinaryRaceEntrantInitialCommands,
  type OrdinaryRaceAiRuntimeInput,
} from "./index";

const peachAnchor: RaceStartAnchor = {
  courseId: 0,
  nativeX: 572.2,
  nativeY: 1.1,
  nativeZ: 561.3,
  headingQuarterTurns: 1,
  lateralPolarity: 0,
};

function peachFixture(): RaceActivityDescriptor {
  return {
    activityId: 0,
    name: "Peach fixture",
    ordinaryRace: true,
    descriptorAddress: 0,
    sceneId: 0,
    rawParameter1: 24,
    rawParameter2: 3,
    variantId: 0,
    settingsAddress: 0,
    participantListAddress: 0,
    participants: Array.from({ length: 23 }, (_, participantIndex) => ({
      areaIndex: 1,
      residentIndex: participantIndex + 1,
      name: `Fixture entrant ${participantIndex}`,
      bodyId: 100 + participantIndex,
      packedPaint: participantIndex,
    })),
    rawSettings: new Uint8Array(20),
    handlerAAddress: 0x0022f3f8,
    handlerBAddress: 0x00252ba0,
  };
}

function navigationFixture(): RaceNavigationCourse {
  const gate = (gateIndex: number, nativeX: number) => ({
    gateIndex,
    endpointA: { nativeX, nativeZ: 400 },
    endpointB: { nativeX, nativeZ: 800 },
    branchPoint: { nativeX, nativeZ: 600 },
  });
  return {
    courseId: 0,
    gateTableAddress: 0,
    recordTableAddress: 0,
    gates: [gate(0, 400), gate(1, 700)],
    records: [
      {
        recordIndex: 0,
        backwardBoundaryGateIndex: 0,
        forwardBoundaryGateIndex: 1,
        backwardRecordIndices: [0, 0],
        forwardRecordIndices: [1, 1],
        selectorOutput: 5,
        reservedByte: 0,
      },
      {
        recordIndex: 1,
        backwardBoundaryGateIndex: 0,
        forwardBoundaryGateIndex: 1,
        backwardRecordIndices: [0, 0],
        forwardRecordIndices: [1, 1],
        selectorOutput: 6,
        reservedByte: 0,
      },
    ],
  };
}

describe("ordinary race entrant runtime adapter", () => {
  test("pins Peach Raceway solo entrant order and native start placement", () => {
    const initial = createOrdinaryRaceEntrantInitialCommands(peachFixture(), peachAnchor);
    expect(initial).toHaveLength(24);
    expect(initial[0]).toMatchObject({
      carIndex: 0,
      startIndex: 23,
      packedCreationFlags: 0x00025c00,
      controlSource: "human-input",
      controllerIndex: 0,
      nativePlacement: { nativeX: 457.20000000000005, nativeY: 1.1, nativeZ: 568.8, nativeYaw: 0x4000 },
    });
    expect(initial.slice(1).map((command) => command.entrant.kind === "opponent" ? command.entrant.participantIndex : -1)).toEqual([
      22, 21, 20, 19, 18, 17, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16,
    ]);
    expect(initial[1]).toMatchObject({
      carIndex: 1,
      startIndex: 0,
      configPointerIndex: 25,
      nativePlacement: { nativeX: 572.2, nativeZ: 561.3, nativeYaw: 0x4000 },
    });
    expect(initial[23]).toMatchObject({ carIndex: 23, startIndex: 22, configPointerIndex: 19 });
  });

  test("delegates countdown, live order, and repeatable opponent commands", () => {
    const initial = createOrdinaryRaceEntrantInitialCommands(peachFixture(), peachAnchor);
    const run = () => {
      const aiCars: OrdinaryRaceAiRuntimeInput[] = initial.filter((command) => command.controlSource === "ordinary-ai").map((command) => {
        const speedTargets = new Uint8Array(256);
        speedTargets[0] = 12;
        return {
          carIndex: command.carIndex,
          nativeX: command.nativePlacement.nativeX,
          nativeZ: command.nativePlacement.nativeZ,
          nativeYaw: command.nativePlacement.nativeYaw,
          nativeSpeed: 0,
          currentRecordIndex: 0,
          steeringEnabled: true,
          speedLimit: 0,
          updateSpeedFeedback: false,
          memory: { speedTargets, speedFeedback: new Uint8Array(256) },
        };
      });
      return advanceOrdinaryRaceEntrantFrame(navigationFixture(), initial, {
        countdown: { elapsedUpdates: 200, fadeUpdates: 64, sceneFlags: 0, updatesPerSecond: 50, shortFinalPhase: false },
        aiCars,
        finishCount: 0,
        positionCars: initial.map((command) => ({
          carIndex: command.carIndex,
          flags: command.packedCreationFlags >>> 16,
          completedLaps: 0,
          finishGatePhase: 2,
          navigationOutput: 0,
          navigationDistance: command.startIndex,
        })),
      });
    };
    const first = run();
    const second = run();
    expect(first.countdown).toMatchObject({ sceneFlags: 4, uiStateIndices: [6], completed: false });
    expect(first.commands[0]).toEqual({ kind: "human-input", carIndex: 0, controllerIndex: 0 });
    expect(first.commands[1]).toMatchObject({
      kind: "ordinary-ai",
      carIndex: 1,
      output: {
        commandMask: 0x8001,
        currentRecordIndex: 0,
        lookAheadRecordIndex: 1,
        selectorOutput: 5,
        targetGateIndex: 1,
      },
    });
    expect(second.commands).toEqual(first.commands);
    expect(first.positions.map((position) => position.carIndex)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12,
      13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 0,
    ]);
  });

  test("rejects incomplete AI runtime input instead of inventing a command", () => {
    const initial = createOrdinaryRaceEntrantInitialCommands(peachFixture(), peachAnchor);
    expect(() => advanceOrdinaryRaceEntrantFrame(navigationFixture(), initial, {
      countdown: { elapsedUpdates: 0, fadeUpdates: 64, sceneFlags: 0, updatesPerSecond: 50, shortFinalPhase: false },
      aiCars: [],
      finishCount: 0,
      positionCars: [],
    })).toThrow(/Missing runtime input/);
  });
});
