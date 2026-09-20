import { nativeBrakeProfile } from "./nativeBrakePerformance";
import { nativeVehicleMass } from "./nativeChassisPerformance";
import { nativeEngineDriveScalar, nativeSteeringScalars } from "./nativeEquipmentPerformance";
import { nativeTransmissionProfile } from "./nativeTransmissionPerformance";
import type { NativeDrivingMotionAuthority } from "./nativeDrivingMotion";
import { nativeTyreGripProfile } from "./nativeTyrePerformance";
import type { NativeRaceEquipment } from "./nativeRaceVehicle";

/** Copyright-safe deterministic fixture for unit tests. PAL-backed tests use the executable reader. */
export function syntheticNativeDrivingMotionAuthority(): NativeDrivingMotionAuthority {
  const positionDivisor = 20_971.51953125;
  const yawScale = Math.fround(Math.PI);
  return {
    contact: {
      probes: [
        [0, 0, 0.68, 0],
        [-0.66, 0, 0.68, 0],
        [0.66, 0, 0.68, 0],
        [-0.66, 0, 0, 0],
        [0.66, 0, 0, 0],
        [-0.66, 0, -0.66, 0],
        [0.66, 0, -0.66, 0],
      ],
      positionDivisor,
      bigTyreThreshold: Math.fround(1.35),
      yawScale,
    },
    math: {
      // sin(x) Taylor coefficients in the native powers 9,7,5,3 layout.
      rotationCoefficients: [
        Math.fround(1 / 362_880),
        Math.fround(-1 / 5_040),
        Math.fround(1 / 120),
        Math.fround(-1 / 6),
      ],
      normalYThreshold: 0.5,
      normalYIncrement: 0.1,
    },
    positionDivisor,
    yawScale,
    body: {
      bodySideDivisor: 32768,
      bodyForwardDivisor: 32768,
      bigTyreLift: Math.fround(0.85),
    },
    obstacle: { minimumX: -1, maximumX: 1 },
    obstacleYawScale: Math.fround(Math.PI),
    equipment: syntheticEquipment,
  };
}
function syntheticEquipment(selectors: readonly number[]): NativeRaceEquipment {
  const tyre = nativeTyreGripProfile(selectors[1] ?? 0);
  const engineSelector = selectors[2] ?? 0;
  const chassisSelector = selectors[3] ?? 0;
  const transmissionSelector = selectors[4] ?? 0;
  const steeringSelector = selectors[5] ?? 0;
  const brakeSelector = selectors[6] ?? 0;
  const steeringScalar = nativeSteeringScalars[steeringSelector];
  if (steeringScalar === undefined) throw new RangeError("Invalid synthetic steering selector.");
  return {
    surfaceGrips: [tyre.dry, tyre.offroad, tyre.wet, tyre.grass, tyre.snow, tyre.ice],
    engineScalar: nativeEngineDriveScalar(engineSelector),
    fuelConsumption: 0,
    mass: nativeVehicleMass(chassisSelector, selectors[1] ?? 0),
    steeringScalar,
    brakeCurve: Uint8Array.from(nativeBrakeProfile(brakeSelector).curve),
    gearWords: [...nativeTransmissionProfile(transmissionSelector).ratios],
  };
}
