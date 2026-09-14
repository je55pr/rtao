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

/** Applies native save categories 1..6 to the browser driving bridge. */
export function applyNativeDrivingEquipment(
  target: NativeDrivingEquipmentTarget,
  equipment: NativeDrivingEquipmentSource | undefined,
  loadoutIndex = 0,
): void {
  target.setNativeTyreSelector(equipment?.selectedItem(loadoutIndex, 1) ?? 0);
  target.setNativeEngineSelector(equipment?.selectedItem(loadoutIndex, 2) ?? 0);
  target.setNativeChassisSelector(equipment?.selectedItem(loadoutIndex, 3) ?? 0);
  target.setNativeTransmissionSelector(equipment?.selectedItem(loadoutIndex, 4) ?? 0);
  target.setNativeSteeringSelector(equipment?.selectedItem(loadoutIndex, 5) ?? 0);
  target.setNativeBrakeSelector(equipment?.selectedItem(loadoutIndex, 6) ?? 0);
}
