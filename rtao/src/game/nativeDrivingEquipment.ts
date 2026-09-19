export interface NativeDrivingEquipmentSource {
  selectedItem(loadoutIndex: number, category: number): number;
}

export interface NativeDrivingEquipmentTarget {
  setNativeTyreSelector(selector: number): void;
  setNativeEngineSelector(selector: number): void;
  setNativeChassisSelector(selector: number): void;
  setNativeTransmissionSelector(selector: number): void;
  setNativeSteeringSelector(selector: number): void;
  setNativeBrakeSelector(selector: number): void;
}

export const nativePlayerEquipmentCategoryCount = 15;

/** Captures one complete native player selector block for race/free-roam handoffs. */
export function nativePlayerEquipmentSelectors(
  equipment: NativeDrivingEquipmentSource | undefined,
  loadoutIndex = 0,
): readonly number[] {
  if (!equipment) return Object.freeze(Array<number>(nativePlayerEquipmentCategoryCount).fill(0));
  const selectors = Array.from(
    { length: nativePlayerEquipmentCategoryCount },
    (_unused, category) => equipment.selectedItem(loadoutIndex, category),
  );
  for (const [category, selector] of selectors.entries()) {
    if (!Number.isInteger(selector) || selector < 0 || selector > 0xff) {
      throw new RangeError(`Native equipment selector ${category} must be a byte; got ${selector}.`);
    }
  }
  return Object.freeze(selectors);
}

/**
 * Applies the six recovered scalar-driving categories. Categories 7..14 are
 * deliberately excluded: their unresolved equip-side effects remain issue #30
 * archaeology rather than browser handling guesses.
 */
export function applyNativeDrivingEquipment(
  target: NativeDrivingEquipmentTarget,
  equipment: NativeDrivingEquipmentSource | undefined,
  loadoutIndex = 0,
): void {
  const selectors = nativePlayerEquipmentSelectors(equipment, loadoutIndex);
  target.setNativeTyreSelector(selectors[1] ?? 0);
  target.setNativeEngineSelector(selectors[2] ?? 0);
  target.setNativeChassisSelector(selectors[3] ?? 0);
  target.setNativeTransmissionSelector(selectors[4] ?? 0);
  target.setNativeSteeringSelector(selectors[5] ?? 0);
  target.setNativeBrakeSelector(selectors[6] ?? 0);
}
