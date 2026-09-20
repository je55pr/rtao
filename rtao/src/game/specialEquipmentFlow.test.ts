import { describe, expect, test } from "vitest";
import type { CompiledFieldCollision } from "../formats/fieldCollision";
import { DialogueRuntimeState } from "../formats/dialogue";
import { purchaseIndexedItem, RecoveredCommerceState } from "./commerceProgress";
import { createRecoveredDialogueStateSave, restoreRecoveredDialogueStateSave } from "./dialogueProgress";
import { ArcadeCarController } from "./drivingGame";
import { nativeDrivingFixedStepSeconds } from "./nativeDrivingMotion";
import { syntheticNativeDrivingMotionAuthority } from "./nativeDrivingMotion.testSupport";
import { fitOwnedNativeEquipmentPart, RecoveredEquipmentState } from "./equipmentProgress";
import { applyNativeDrivingEquipment } from "./nativeDrivingEquipment";
import {
  advanceNativeFlightWingFlags,
  nativeFreeRoamSpecialAbilityFlags,
  nativeOrdinaryRaceSpecialAbilityFlags,
  nativeSpecialAbilityFlags,
  nativeSpecialEquipmentConfigurationFlags,
} from "./nativeSpecialAbilityRuntime";
import { allWorldFieldNumbers } from "./worldTopology";
import { DrivingWorld, flatFieldCollision } from "./worldCollision";

interface PurchasedPart {
  readonly category: number;
  readonly item: number;
  readonly priceCake: number;
}
function purchaseFitReload(parts: readonly PurchasedPart[]): RecoveredEquipmentState {
  const ownership = new DialogueRuntimeState();
  const commerce = new RecoveredCommerceState(100_000);
  const equipment = new RecoveredEquipmentState();
  for (const part of parts) {
    expect(purchaseIndexedItem(ownership, commerce, part.category, part.item, part.priceCake).status)
      .toBe("purchased");
    expect(fitOwnedNativeEquipmentPart(ownership, equipment, 0, part.category, part.item))
      .toBe("fitted");
  }
  const save = createRecoveredDialogueStateSave(
    ownership,
    "2026-09-20T11:00:00.000Z",
    commerce,
    equipment,
  );
  const restoredOwnership = new DialogueRuntimeState();
  const restoredCommerce = new RecoveredCommerceState();
  const restoredEquipment = new RecoveredEquipmentState();
  restoreRecoveredDialogueStateSave(save, restoredOwnership, restoredCommerce, restoredEquipment);
  for (const part of parts) {
    expect(restoredOwnership.indexedFlagCount(part.category, part.item)).toBe(1);
    expect(restoredEquipment.selectedItem(0, part.category)).toBe(part.item);
  }
  return restoredEquipment;
}

function flatWorld(): DrivingWorld {
  const world = new DrivingWorld();
  for (const field of allWorldFieldNumbers()) world.addCompiledField(field, flatFieldCollision());
  return world;
}
function drive(car: ArcadeCarController, frames: number, throttle: number, steering: number): void {
  for (let frame = 0; frame < frames; frame += 1) {
    car.update(nativeDrivingFixedStepSeconds, { throttle, steering, boost: false });
  }
}

function auxiliaryOnlyCollision(extraY: number): CompiledFieldCollision {
  return {
    triangleCount: 2,
    positions: new Float32Array([
      0, extraY, 0, 1600, extraY, 0, 0, extraY, 1600,
      1600, extraY, 0, 1600, extraY, 1600, 0, extraY, 1600,
    ]),
    surfaceFlags: new Uint32Array([0x1000_0000, 0x1000_0000]),
  };
}

function slopedWaterCollision(groundY: number, shoreZ: number, deepZ: number, deepY: number): CompiledFieldCollision {
  return {
    triangleCount: 4,
    positions: new Float32Array([
      0, groundY, 0, 1600, groundY, 0, 0, groundY, 1600,
      1600, groundY, 0, 1600, groundY, 1600, 0, groundY, 1600,
      0, groundY, shoreZ, 1600, groundY, shoreZ, 0, deepY, deepZ,
      1600, groundY, shoreZ, 1600, deepY, deepZ, 0, deepY, deepZ,
    ]),
    surfaceFlags: new Uint32Array([0, 0, 0x1000_0000, 0x1000_0000]),
  };
}
describe("special equipment end-to-end flow", () => {
  test("Water Ski and Propeller survive purchase, Q's Factory fitting and reload, then enter and exit water", () => {
    const equipment = purchaseFitReload([
      { category: 10, item: 1, priceCake: 3_000 },
      { category: 11, item: 1, priceCake: 3_000 },
    ]);

    const baseline = new ArcadeCarController(flatWorld(), syntheticNativeDrivingMotionAuthority());
    const equippedDry = new ArcadeCarController(flatWorld(), syntheticNativeDrivingMotionAuthority());
    applyNativeDrivingEquipment(equippedDry, equipment);
    drive(baseline, 120, 1, 1);
    drive(equippedDry, 120, 1, 1);
    expect(equippedDry.state).toEqual(baseline.state);

    const unsupportedWorld = new DrivingWorld();
    unsupportedWorld.addCompiledField(223, auxiliaryOnlyCollision(0.8));
    const unsupported = new ArcadeCarController(
      unsupportedWorld,
      syntheticNativeDrivingMotionAuthority(),
      223,
      { x: 800, y: 0, z: 800 },
      0,
    );
    applyNativeDrivingEquipment(unsupported, equipment);
    drive(unsupported, 120, 1, 1);
    expect(unsupported.state.contactSpecialState).toBe(1);
    expect(unsupported.state.contactHasGroundSupport).toBe(false);
    expect(unsupported.state.distanceTravelled).toBeGreaterThan(0);
    expect(Math.abs(unsupported.state.yaw)).toBeGreaterThan(0);
    const shorelineWorld = new DrivingWorld();
    shorelineWorld.addCompiledField(223, slopedWaterCollision(0, 555, 575, 1));
    const shoreline = new ArcadeCarController(
      shorelineWorld,
      syntheticNativeDrivingMotionAuthority(),
      223,
      { x: 800, y: 0, z: 552 },
      0,
    );
    applyNativeDrivingEquipment(shoreline, equipment);
    let sawShallow = false;
    let sawDeep = false;
    for (let frame = 0; frame < 600 && !sawDeep; frame += 1) {
      shoreline.update(nativeDrivingFixedStepSeconds, { throttle: 1, steering: 0, boost: false });
      sawShallow ||= shoreline.state.contactSpecialState === -1;
      sawDeep ||= shoreline.state.contactSpecialState === 1;
    }
    expect(sawShallow).toBe(true);
    expect(sawDeep).toBe(true);

    let sawOrdinaryAgain = false;
    for (let frame = 0; frame < 800 && !sawOrdinaryAgain; frame += 1) {
      shoreline.update(nativeDrivingFixedStepSeconds, { throttle: -1, steering: 0, boost: false });
      sawOrdinaryAgain ||= sawShallow && shoreline.state.contactSpecialState === 0;
    }
    expect(sawOrdinaryAgain).toBe(true);
  });
  test("Wing Set and Jet Turbine flow into ordinary-race flags without changing free-roam driving", () => {
    const equipment = purchaseFitReload([
      { category: 9, item: 1, priceCake: 3_000 },
      { category: 10, item: 2, priceCake: 10_000 },
    ]);
    const selectors = equipment.selectorEntries()[0] ?? [];
    expect(nativeOrdinaryRaceSpecialAbilityFlags(selectors)).toBe(
      nativeSpecialAbilityFlags.wingSet | nativeSpecialAbilityFlags.jetTurbine,
    );
    expect(nativeFreeRoamSpecialAbilityFlags(selectors)).toBe(0);

    const baseline = new ArcadeCarController(flatWorld(), syntheticNativeDrivingMotionAuthority());
    const equipped = new ArcadeCarController(flatWorld(), syntheticNativeDrivingMotionAuthority());
    applyNativeDrivingEquipment(equipped, equipment);
    drive(baseline, 120, 1, 1);
    drive(equipped, 120, 1, 1);
    expect(equipped.state).toEqual(baseline.state);
  });

  test("Flight Wing survives fitting/reload, replays deploy/retract, and remains gated from normal race launch", () => {
    const equipment = purchaseFitReload([{ category: 11, item: 2, priceCake: 50_000 }]);
    const selectors = equipment.selectorEntries()[0] ?? [];
    const fitted = nativeSpecialEquipmentConfigurationFlags(selectors);
    expect(fitted).toBe(nativeSpecialAbilityFlags.flightWingFitted);
    expect(() => nativeOrdinaryRaceSpecialAbilityFlags(selectors)).toThrow(/Flight Wing/);

    expect(advanceNativeFlightWingFlags(fitted, 300)).toBe(nativeSpecialAbilityFlags.flightWingFitted);
    const active = advanceNativeFlightWingFlags(fitted, 300.0001);
    expect(active).toBe(nativeSpecialAbilityFlags.flightWingActive);
    expect(advanceNativeFlightWingFlags(active, 300)).toBe(nativeSpecialAbilityFlags.flightWingActive);
    expect(advanceNativeFlightWingFlags(active, 299.9999)).toBe(nativeSpecialAbilityFlags.flightWingFitted);
    const baseline = new ArcadeCarController(flatWorld(), syntheticNativeDrivingMotionAuthority());
    const equipped = new ArcadeCarController(flatWorld(), syntheticNativeDrivingMotionAuthority());
    applyNativeDrivingEquipment(equipped, equipment);
    drive(baseline, 120, 1, 1);
    drive(equipped, 120, 1, 1);
    expect(equipped.state).toEqual(baseline.state);
  });
});
