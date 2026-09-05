/** Scalar traction/yaw stages at 0x0021B460 and 0x0021AF38. Units remain native. */
const i16 = (n: number): number => (n << 16) >> 16;
const div = (a: number, b: number): number => Math.trunc(a / b) | 0;
const mul = Math.imul;

export function nativeTractionSpeed(localForwardSpeed: number, previousSpeed: number, contactGrip: number, mass: number, brakeForce: number): number {
  const brake = previousSpeed !== 0 ? brakeForce : 0;
  const cap = mul(contactGrip, mass);
  if (cap === 0) return brake === 0 ? previousSpeed : 0;
  if (brake === 0) return localForwardSpeed;
  let force = mul((localForwardSpeed - previousSpeed) | 0, mass);
  if (cap >= 0) force = Math.max(-cap, Math.min(cap, force));
  const speed = (previousSpeed + div(force, mass)) | 0;
  const braking = div(brake, mass);
  return speed < 0 ? Math.min(0, speed + braking) : Math.max(0, speed - braking);
}

export function nativeRaceYawStep(input: {
  nativeSpeed: number; curvature: number; yaw: number; slipAngle: number; driftRate: number; contactAllowsYaw: boolean;
}): { yaw: number; yawStep: number; lateralDemand: number } {
  const yawStep = input.contactAllowsYaw ? i16(div(mul(input.nativeSpeed, input.curvature), 0xab85)) : 0;
  const apply = input.slipAngle === 0 || (input.slipAngle > 0 && yawStep > 0) || (input.slipAngle < 0 && yawStep < 0) || input.driftRate === 0;
  return {
    yaw: apply ? (input.yaw + yawStep) & 65535 : input.yaw,
    yawStep,
    lateralDemand: div(mul(apply ? yawStep + (input.slipAngle === 0 ? 0 : input.driftRate) : input.driftRate, input.nativeSpeed), 10430),
  };
}

export interface NativeRaceDriftInput {
  readonly yaw: number;
  readonly yawStep: number;
  readonly slipAngle: number;
  readonly driftRate: number;
  readonly nativeSpeed: number;
  readonly wheelSpeed: number;
  readonly curvature: number;
  readonly grip: number;
  readonly brakeForce: number;
  readonly lateralDemand: number;
  readonly runtimeFlags: number;
}

/** Native drift feedback 0x0021AF38; preserves its asymmetric integer branches. */
export function advanceNativeRaceDrift(input: NativeRaceDriftInput): { yaw: number; slipAngle: number; driftRate: number; runtimeFlags: number } {
  let driftRate = input.driftRate, slipAngle = input.slipAngle, yaw = input.yaw, runtimeFlags = input.runtimeFlags;
  if (((slipAngle + 4095) & 65535) < 8191) {
    if (input.grip < 0 || Math.abs(input.lateralDemand) <= input.grip) driftRate = 0;
    else if (input.lateralDemand < 0) {
      const target = Math.max(-512, div((input.lateralDemand - input.grip) | 0, 3));
      driftRate = target - driftRate >= 9 ? i16(driftRate - 8) : target;
    } else {
      const target = Math.min(512, div((input.lateralDemand + input.grip) | 0, 3));
      driftRate = target - driftRate >= 9 ? i16(driftRate + 8) : target;
    }
  }
  if (input.nativeSpeed === 0) driftRate = 0;
  const opposing = (slipAngle > 0 && input.yawStep < 0) || (slipAngle < 0 && input.yawStep > 0);
  slipAngle = i16(slipAngle + (opposing ? div(driftRate, 2) : driftRate));
  if (opposing) runtimeFlags |= 0x20;
  yaw = (yaw + driftRate) & 65535;
  if (input.brakeForce < 5000) driftRate = div(driftRate, 8);
  else if ((slipAngle >= 0 && input.curvature > 0) || (slipAngle <= 0 && input.curvature < 0)) yaw = (yaw + div(driftRate, 8)) & 65535;
  if (driftRate === 0) {
    let correction = 0;
    if (input.wheelSpeed !== 0 && input.nativeSpeed !== 0) {
      const magnitude = Math.abs(div(0x1ec000, input.nativeSpeed));
      correction = slipAngle < 0 ? Math.max(slipAngle, -magnitude) : Math.min(slipAngle, magnitude);
    } else if (input.nativeSpeed === 0) correction = slipAngle;
    correction = Math.max(-1024, Math.min(1024, correction));
    slipAngle = i16(slipAngle - correction);
  }
  return { yaw, slipAngle, driftRate, runtimeFlags: runtimeFlags >>> 0 };
}
