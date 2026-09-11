import type { Q62CarModel } from "./carView";
import { nativeBrakeForceFraction, nativeBrakeHoldUpdates, nativeBrakeProfile } from "./nativeBrakePerformance";
import { nativeTyreGripMultiplier } from "./nativeTyrePerformance";
import type { PartPerformance } from "./parts";
import type { DrivingSurfaceKind, DrivingWorld, Vec3 } from "./worldCollision";
import type { WorldView } from "./worldView";

export interface DriveInput {
  readonly throttle: number;
  readonly steering: number;
  readonly boost: boolean;
}

export interface CarState {
  readonly fieldNumber: number;
  readonly position: Vec3;
  readonly yaw: number;
  readonly speed: number;
  readonly steeringAngle: number;
  readonly wheelSpin: number;
  readonly pitch: number;
  readonly roll: number;
  readonly surfaceFlags: number;
  readonly surfaceKind: DrivingSurfaceKind;
  /** Monotonic successful travel in browser world units; debug teleports add nothing. */
  readonly distanceTravelled: number;
}

const standardPartPerformance: PartPerformance = {
  acceleration: 1,
  topSpeed: 1,
  steering: 1,
  braking: 1,
  pavedGrip: 1,
  offroadGrip: 1,
};

export class ArcadeCarController {
  private mutable: CarState;
  private partPerformance: PartPerformance = standardPartPerformance;
  private nativeTyreSelector = 0;
  private nativeBrakeSelector = 0;
  private nativeBrakeHeldUpdates = 0;

  constructor(private readonly world: DrivingWorld, fieldNumber = 223, position: Vec3 = { x: 1152, y: 31, z: 555 }, yaw = -0.1) {
    const resolved = world.resolveFootprint(fieldNumber, position, yaw, position.y);
    this.mutable = {
      fieldNumber: resolved?.fieldNumber ?? fieldNumber,
      position: resolved?.position ?? position,
      yaw,
      speed: 0,
      steeringAngle: 0,
      wheelSpin: 0,
      pitch: 0,
      roll: 0,
      surfaceFlags: resolved?.surfaceFlags ?? 0,
      surfaceKind: world.drivingSurface(resolved?.fieldNumber ?? fieldNumber, resolved?.position ?? position, resolved?.y ?? position.y),
      distanceTravelled: 0,
    };
  }

  get state(): CarState { return this.mutable; }

  setPartPerformance(performance: PartPerformance): void {
    this.partPerformance = performance;
  }

  setNativeTyreSelector(selector: number): void {
    // nativeTyreGripMultiplier validates the executable catalogue selector.
    nativeTyreGripMultiplier(selector, "paved-road");
    this.nativeTyreSelector = selector;
  }

  setNativeBrakeSelector(selector: number): void {
    nativeBrakeProfile(selector); // validate against the executable catalogue.
    if (selector !== this.nativeBrakeSelector) this.nativeBrakeHeldUpdates = 0;
    this.nativeBrakeSelector = selector;
  }

  teleport(fieldNumber: number, position: Vec3, yaw: number): void {
    this.nativeBrakeHeldUpdates = 0;
    const resolved = this.world.resolveFootprint(fieldNumber, position, yaw, position.y);
    this.mutable = {
      fieldNumber: resolved?.fieldNumber ?? fieldNumber,
      position: resolved?.position ?? position,
      yaw,
      speed: 0,
      steeringAngle: 0,
      wheelSpin: 0,
      pitch: 0,
      roll: 0,
      surfaceFlags: resolved?.surfaceFlags ?? 0,
      surfaceKind: this.world.drivingSurface(resolved?.fieldNumber ?? fieldNumber, resolved?.position ?? position, resolved?.y ?? position.y),
      distanceTravelled: this.mutable.distanceTravelled,
    };
  }

  update(dt: number, input: DriveInput): void {
    const old = this.mutable;
    const throttle = clamp(input.throttle, -1, 1);
    const steering = clamp(input.steering, -1, 1);
    const boost = input.boost ? 5 : 1;
    const surfaceKind = this.world.drivingSurface(old.fieldNumber, old.position, old.position.y);
    const [baseForwardAcceleration, baseReverseAcceleration, coastDrag, baseMaxForwardSpeed] = surfaceKind === "dirt"
      ? [8.4, 5.5, 3.4, 23.5]
      : surfaceKind === "grass"
        ? [6.2, 4.5, 5.8, 16]
        : surfaceKind !== "paved-road"
          ? [7.5, 5, 4.2, 20]
          : [9.5, 6, 2.8, 28];
    const compatibilityGrip = surfaceKind === "paved-road" || surfaceKind === "dry" ? this.partPerformance.pavedGrip : this.partPerformance.offroadGrip;
    const grip = compatibilityGrip * nativeTyreGripMultiplier(this.nativeTyreSelector, surfaceKind);
    const forwardAcceleration = baseForwardAcceleration * this.partPerformance.acceleration * grip;
    const reverseAcceleration = baseReverseAcceleration * this.partPerformance.acceleration * grip;
    const maxForwardSpeed = baseMaxForwardSpeed * this.partPerformance.topSpeed * (0.7 + grip * 0.3);
    const brakeActive = throttle < 0;
    this.nativeBrakeHeldUpdates = brakeActive ? Math.min(nativeBrakeHoldUpdates, this.nativeBrakeHeldUpdates + 1) : 0;
    const opposingAcceleration = 18 * this.partPerformance.braking * grip;
    const braking = brakeActive
      ? opposingAcceleration * nativeBrakeForceFraction(this.nativeBrakeSelector, this.nativeBrakeHeldUpdates)
      : opposingAcceleration;
    let speed = old.speed;
    if (throttle > 0) {
      speed = speed < -0.5 ? moveTowards(speed, 0, braking * boost * dt) : Math.min(maxForwardSpeed * boost, speed + forwardAcceleration * boost * dt);
    } else if (throttle < 0) {
      speed = speed > 0.5 ? moveTowards(speed, 0, braking * boost * dt) : Math.max(-9 * boost, speed - reverseAcceleration * boost * dt);
    } else {
      speed = moveTowards(speed, 0, coastDrag * boost * dt);
    }
    if (!input.boost) {
      if (speed > maxForwardSpeed) speed = moveTowards(speed, maxForwardSpeed, 90 * dt);
      else if (speed < -9) speed = moveTowards(speed, -9, 90 * dt);
    }
    const steeringAngle = moveTowards(old.steeringAngle, -steering * Math.min(0.72, 0.48 * this.partPerformance.steering), 3.4 * this.partPerformance.steering * dt);
    let wheelSpin = old.wheelSpin - speed * dt / 0.355;
    if (Math.abs(wheelSpin) > Math.PI * 2) wheelSpin %= Math.PI * 2;
    let yaw = old.yaw;
    const speedFraction = clamp(Math.abs(speed) / 12, 0, 1);
    if (speedFraction > 0.02 && Math.abs(steering) > 0.01) {
      const direction = speed >= 0 ? 1 : -1;
      const turnRate = lerp(0.45, 1.65, speedFraction) * this.partPerformance.steering * Math.sqrt(grip);
      const turnScale = clamp(Math.abs(speed) / maxForwardSpeed, 1, 5);
      yaw -= steering * direction * turnRate * turnScale * dt;
    }

    const forwardX = Math.sin(yaw), forwardZ = Math.cos(yaw);
    const moveX = forwardX * speed * dt, moveZ = forwardZ * speed * dt;
    const candidate = { x: old.position.x + moveX, y: old.position.y, z: old.position.z + moveZ };
    let resolved = this.world.resolveFootprint(old.fieldNumber, candidate, yaw, old.position.y);
    let distanceMoved = resolved ? Math.hypot(moveX, moveZ) : 0;
    if (!resolved) {
      const x = this.world.resolveFootprint(old.fieldNumber, { x: old.position.x + moveX, y: old.position.y, z: old.position.z }, yaw, old.position.y);
      const z = this.world.resolveFootprint(old.fieldNumber, { x: old.position.x, y: old.position.y, z: old.position.z + moveZ }, yaw, old.position.y);
      resolved = x && (!z || Math.abs(moveX) >= Math.abs(moveZ)) ? x : z;
      if (resolved) distanceMoved = resolved === x ? Math.abs(moveX) : Math.abs(moveZ);
    }
    if (!resolved) {
      speed = 0;
      resolved = {
        fieldNumber: old.fieldNumber,
        position: old.position,
        y: old.position.y,
        surfaceFlags: old.surfaceFlags,
      };
    }

    const attitude = this.groundAttitude(resolved.fieldNumber, resolved.position, yaw, old.pitch, old.roll, dt);
    this.mutable = {
      fieldNumber: resolved.fieldNumber,
      position: { x: resolved.position.x, y: attitude.y, z: resolved.position.z },
      yaw,
      speed,
      steeringAngle,
      wheelSpin,
      pitch: attitude.pitch,
      roll: attitude.roll,
      surfaceFlags: resolved.surfaceFlags,
      surfaceKind,
      distanceTravelled: old.distanceTravelled + distanceMoved,
    };
  }

  private groundAttitude(fieldNumber: number, position: Vec3, yaw: number, pitch: number, roll: number, dt: number): { y: number; pitch: number; roll: number } {
    const contacts: ReadonlyArray<readonly [number, number]> = [
      [-0.741544, 0.68], [0.741544, 0.68], [-0.724481, -0.66], [0.724481, -0.66],
    ];
    const sine = Math.sin(yaw), cosine = Math.cos(yaw);
    const heights = contacts.map(([x, z]) => this.world.sampleGround(fieldNumber, {
      x: position.x + x * cosine + z * sine,
      y: position.y,
      z: position.z - x * sine + z * cosine,
    }, position.y)?.y);
    if (heights.some((height) => height === undefined)) return { y: position.y, pitch, roll };
    const [fl = position.y, fr = position.y, rl = position.y, rr = position.y] = heights as number[];
    const targetPitch = Math.atan2((fl + fr - rl - rr) * 0.5, 1.34);
    const targetRoll = Math.atan2((fr + rr - fl - rl) * 0.5, 1.466025);
    return {
      y: moveTowards(position.y, (fl + fr + rl + rr) * 0.25, 12 * dt),
      pitch: moveTowards(pitch, targetPitch, 5.5 * dt),
      roll: moveTowards(roll, targetRoll, 5.5 * dt),
    };
  }
}

export class BrowserDrivingGame {
  readonly controller: ArcadeCarController;
  private readonly keys = new Set<string>();
  private frameHandle = 0;
  private lastTime = 0;
  private accumulator = 0;
  private running = false;
  private paused = false;
  private inputOverride: DriveInput | undefined;

  constructor(
    private readonly world: DrivingWorld,
    private readonly view: WorldView,
    private readonly car: Q62CarModel,
    private readonly onState: (state: CarState) => void,
  ) {
    this.controller = new ArcadeCarController(world);
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    this.accumulator = 0;
    window.addEventListener("keydown", this.keyDown);
    window.addEventListener("keyup", this.keyUp);
    const state = this.controller.state;
    this.view.startDriving(this.car, state.fieldNumber, state.position, state.yaw);
    this.applyState(state, true);
    this.frameHandle = requestAnimationFrame(this.frame);
  }

  stop(): void {
    if (!this.running) return;
    this.running = false;
    cancelAnimationFrame(this.frameHandle);
    window.removeEventListener("keydown", this.keyDown);
    window.removeEventListener("keyup", this.keyUp);
    this.keys.clear();
    this.view.stopDriving();
  }

  setInputOverride(input: DriveInput | undefined): void { this.inputOverride = input; }

  setPartPerformance(performance: PartPerformance): void { this.controller.setPartPerformance(performance); }

  setNativeTyreSelector(selector: number): void { this.controller.setNativeTyreSelector(selector); }

  setNativeBrakeSelector(selector: number): void { this.controller.setNativeBrakeSelector(selector); }

  setPaused(paused: boolean): void {
    this.paused = paused;
    this.accumulator = 0;
    this.lastTime = performance.now();
    if (paused) this.keys.clear();
  }

  private readonly frame = (time: number): void => {
    if (!this.running) return;
    if (this.paused) {
      this.lastTime = time;
      this.applyState(this.controller.state, false);
      this.frameHandle = requestAnimationFrame(this.frame);
      return;
    }
    this.accumulator += Math.min(0.1, (time - this.lastTime) / 1000);
    this.lastTime = time;
    const fixedStep = 1 / 60;
    while (this.accumulator >= fixedStep) {
      this.controller.update(fixedStep, this.input());
      this.accumulator -= fixedStep;
    }
    this.applyState(this.controller.state, false);
    this.frameHandle = requestAnimationFrame(this.frame);
  };

  private applyState(state: CarState, snap: boolean): void {
    this.car.setWheelState(state.steeringAngle, state.wheelSpin);
    const forwardX = Math.sin(state.yaw), forwardZ = Math.cos(state.yaw);
    let cameraLift = 4.2;
    for (let step = 1; step <= 6; step += 1) {
      const distance = 7.8 * step / 6;
      const obstruction = this.world.sampleHighest(state.fieldNumber, {
        x: state.position.x - forwardX * distance,
        y: state.position.y,
        z: state.position.z - forwardZ * distance,
      });
      if (obstruction) cameraLift = Math.max(cameraLift, obstruction.y - state.position.y + 1.8);
    }
    this.view.updateDriving(state.fieldNumber, state.position, state.yaw, state.pitch, state.roll, snap, cameraLift);
    this.onState(state);
  }

  private input(): DriveInput {
    if (this.inputOverride) return this.inputOverride;
    return {
      throttle: (this.down("KeyW", "ArrowUp") ? 1 : 0) - (this.down("KeyS", "ArrowDown") ? 1 : 0),
      steering: (this.down("KeyD", "ArrowRight") ? 1 : 0) - (this.down("KeyA", "ArrowLeft") ? 1 : 0),
      boost: this.down("ShiftLeft", "ShiftRight"),
    };
  }

  private down(...codes: string[]): boolean { return codes.some((code) => this.keys.has(code)); }
  // While paused the pause/settings layer owns the keyboard, so drive keys are
  // neither swallowed nor held.
  private readonly keyDown = (event: KeyboardEvent): void => { if (!this.paused && isDriveKey(event.code)) { event.preventDefault(); this.keys.add(event.code); } };
  private readonly keyUp = (event: KeyboardEvent): void => { if (!this.paused && isDriveKey(event.code)) { event.preventDefault(); this.keys.delete(event.code); } };
}

function isDriveKey(code: string): boolean { return ["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowLeft", "ArrowDown", "ArrowRight", "ShiftLeft", "ShiftRight"].includes(code); }
function moveTowards(value: number, target: number, amount: number): number { return value < target ? Math.min(target, value + amount) : value > target ? Math.max(target, value - amount) : target; }
function clamp(value: number, minimum: number, maximum: number): number { return Math.max(minimum, Math.min(maximum, value)); }
function lerp(a: number, b: number, t: number): number { return a + (b - a) * t; }
