/** PAL 0x00219D90. Native integer longitudinal/lateral force and engine state. */
export interface NativeRaceDriveForceInput {
  readonly localForwardSpeed: number;
  readonly localSideSpeed: number;
  readonly engineSpeed: number;
  readonly engineScalar: number;
  readonly gearWord: number;
  readonly mass: number;
  /** Caller multiplies signed surface grip by contact acceleration and divides by 256. */
  readonly grip: number;
  readonly brakeForce: number;
  readonly commands: number;
  readonly driveEnabled: boolean;
  readonly fuel: number;
  readonly fuelConsumption: number;
  readonly runtimeFlags: number;
}
export interface NativeRaceDriveForceOutput {
  readonly localForwardSpeed: number;
  readonly localSideSpeed: number;
  readonly engineSpeed: number;
  /** car +0x1BC, engine-derived wheel speed, distinct from +0x1B8 traction speed. */
  readonly wheelSpeed: number;
  readonly fuel: number;
  readonly runtimeFlags: number;
  readonly slipMagnitude: number;
}
const div = (a: number, b: number): number => Math.trunc(a / b) | 0;
const add = (a: number, b: number): number => (a + b) | 0;
const sub = (a: number, b: number): number => (a - b) | 0;
const mul = Math.imul;
const f = Math.fround;
const signedLimit = (value: number, limit: number): number => value < 0 ? Math.max(value, -limit) : Math.min(value, limit);

export function advanceNativeRaceDriveForce(input: NativeRaceDriveForceInput): NativeRaceDriveForceOutput {
  const { engineScalar, gearWord, mass, brakeForce } = input;
  if (!Number.isInteger(mass) || mass <= 0 || !Number.isInteger(gearWord) || gearWord === 0 || (gearWord << 16 >> 16) !== gearWord ||
    !Number.isInteger(input.engineSpeed) || input.engineSpeed < 0 || input.engineSpeed > 10000 ||
    !Number.isInteger(brakeForce) || brakeForce < 0 || brakeForce > 10000) throw new RangeError('Invalid native drive state.');
  let fuel = input.fuel | 0;
  let targetEngineSpeed = 0;
  if (input.engineSpeed < 9501 && (input.commands & 1) !== 0) {
    fuel = sub(fuel, input.fuelConsumption);
    if (fuel < 0) { fuel = 0; targetEngineSpeed = 3000; }
    else targetEngineSpeed = 9000;
  }
  const couplingMass = input.driveEnabled && input.grip !== 0 ? mass : 0;
  const tractionLimit = input.driveEnabled ? mul(input.grip, mass) : 0;
  const gearScale = Math.max(1, Math.abs(div(640, gearWord)));
  let engineForce = input.engineSpeed < targetEngineSpeed ? div(engineScalar << 7, gearWord)
    : input.engineSpeed > targetEngineSpeed ? div(-256000, gearWord) : 0;
  const previousWheelSpeed = div(mul(input.engineSpeed, gearWord), 128);
  const speedDifference = tractionLimit !== 0 ? sub(input.localForwardSpeed, previousWheelSpeed) : 0;
  const couplingForce = mul(speedDifference, couplingMass);
  let engineAcceleration = div(add(engineForce, couplingForce), mass);
  const predictedWheelSpeed = add(previousWheelSpeed, engineAcceleration);
  engineForce = sub(engineForce, signedLimit(mul(predictedWheelSpeed, couplingMass), brakeForce));
  let forwardAcceleration = div(engineForce, mass);
  const forceDifference = sub(engineForce, couplingForce);
  let sideForce = mul(-input.localSideSpeed | 0, couplingMass);
  let slipMagnitude = 0;
  if (tractionLimit === 0) sideForce = 0;
  else if (tractionLimit > 0) {
    const longitudinal = f(forceDifference), lateral = f(sideForce), cap = f(tractionLimit);
    const magnitude = f(Math.sqrt(f(f(longitudinal * longitudinal) + f(lateral * lateral))));
    if (magnitude > cap) {
      sideForce = signedLimit(sideForce, tractionLimit << 1);
      slipMagnitude = Math.trunc(f(magnitude / cap)) | 0;
    }
  }
  let uncoupledForce = 0;
  if (input.grip < 0) {
    if (add(input.engineSpeed, div(engineAcceleration << 7, gearWord)) < 0) forwardAcceleration = -input.localForwardSpeed | 0;
  } else if (forceDifference > tractionLimit) {
    uncoupledForce = sub(engineForce, tractionLimit);
    engineAcceleration = div(tractionLimit, mass);
    if (speedDifference < 0 && add(engineAcceleration, div(uncoupledForce, gearScale)) <= speedDifference) {
      engineAcceleration = speedDifference; uncoupledForce = 0;
    }
    forwardAcceleration = div(tractionLimit, mass);
  } else if (forceDifference < -tractionLimit) {
    uncoupledForce = add(engineForce, tractionLimit);
    engineAcceleration = div(-tractionLimit, mass);
    if (speedDifference > 0 && add(engineAcceleration, div(uncoupledForce, gearScale)) >= speedDifference) {
      engineAcceleration = speedDifference; uncoupledForce = 0;
    }
    forwardAcceleration = div(-tractionLimit, mass);
  }
  let localForwardSpeed = add(input.localForwardSpeed, forwardAcceleration);
  let localSideSpeed = add(input.localSideSpeed, div(sideForce, mass));
  const engineDelta = div(add(engineAcceleration, div(uncoupledForce, gearScale)) << 7, gearWord);
  const engineSpeed = Math.max(0, Math.min(10000, (add(input.engineSpeed, engineDelta) << 16) >> 16));
  const wheelSpeed = input.driveEnabled ? div(mul(engineSpeed, gearWord), 128) : 0;
  if (!input.driveEnabled) { localForwardSpeed = 0; localSideSpeed = 0; slipMagnitude = 0; }
  return { localForwardSpeed, localSideSpeed, engineSpeed, wheelSpeed, fuel,
    runtimeFlags: (input.runtimeFlags | 2) >>> 0, slipMagnitude };
}
