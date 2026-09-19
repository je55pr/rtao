import type { Q62CarModel } from "./carView";
import {
  NativeDrivingMotion,
  nativeDrivingFixedStepSeconds,
  type NativeDrivingMotionAuthority,
} from "./nativeDrivingMotion";
import { nativeTyreContactThreshold } from "./nativeTyrePerformance";
import {
  advanceNativeChaseCamera,
  createNativeChaseCameraState,
  resetNativeChaseLag,
  type NativeChaseCameraState,
} from "./nativeChaseCamera";
import {
  applyBrowserChaseObstructionSafety,
  browserOrdinaryChasePresetIndex,
} from "./browserChaseCameraSafety";
import type { DrivingSurfaceKind, DrivingWorld, Vec3 } from "./worldCollision";
import { BrowserSemanticInput, type SemanticActionEvent, type SemanticInputScope } from "../input/semanticInput";
import type { WorldView } from "./worldView";

export interface DriveInput {
  readonly throttle: number;
  readonly steering: number;
  readonly boost: boolean;
}

export type CarOutdoorLocation =
  | { readonly kind: "standard-world"; readonly fieldNumber: number }
  | { readonly kind: "special-outdoor"; readonly areaCode: number };

export interface CarState {
  /** Native scene identity. Special outdoor scenes never masquerade as an FLD. */
  readonly location: CarOutdoorLocation;
  /** Compatibility field for ordinary-world UI/contact code; -1 outside FLD topology. */
  readonly fieldNumber: number;
  readonly position: Vec3;
  readonly yaw: number;
  /** Direct native car +0x1D4 camera input. */
  readonly nativeYaw: number;
  /** Direct native car +0x1D6 camera input. */
  readonly nativeSlipAngle: number;
  readonly speed: number;
  readonly steeringAngle: number;
  readonly wheelSpin: number;
  readonly pitch: number;
  readonly roll: number;
  readonly surfaceFlags: number;
  readonly surfaceKind: DrivingSurfaceKind;
  /** Direct recovered car +0x1D0 engine RPM, retained for native engine audio. */
  readonly nativeEngineSpeed: number;
  /** Recovered engine-sound layer selector; semantic polarity is intentionally unnamed. */
  readonly nativeEngineLayerSelector: 0 | 1;
  /** Monotonic successful travel in browser world units; debug teleports add nothing. */
  readonly distanceTravelled: number;
}

export class ArcadeCarController {
  private mutable: CarState;
  private readonly motion: NativeDrivingMotion;
  private nativeTyreSelector = 0;

  constructor(
    private readonly world: DrivingWorld,
    motionAuthority: NativeDrivingMotionAuthority,
    fieldNumber = 223,
    position: Vec3 = { x: 1152, y: 31, z: 555 },
    yaw = -0.1,
  ) {
    this.motion = new NativeDrivingMotion(motionAuthority, yaw);
    const resolved = world.resolveFootprint(fieldNumber, position, yaw, position.y, nativeTyreContactThreshold(this.nativeTyreSelector));
    const resolvedFieldNumber = resolved?.fieldNumber ?? fieldNumber;
    this.mutable = {
      location: { kind: "standard-world", fieldNumber: resolvedFieldNumber },
      fieldNumber: resolvedFieldNumber,
      position: resolved?.position ?? position,
      yaw,
      nativeYaw: this.motion.nativeVehicle.yaw,
      nativeSlipAngle: this.motion.nativeVehicle.slipAngle,
      speed: 0,
      steeringAngle: 0,
      wheelSpin: 0,
      pitch: 0,
      roll: 0,
      surfaceFlags: resolved?.surfaceFlags ?? 0,
      surfaceKind: world.drivingSurface(resolved?.fieldNumber ?? fieldNumber, resolved?.position ?? position, resolved?.y ?? position.y),
      nativeEngineSpeed: 0,
      nativeEngineLayerSelector: 0,
      distanceTravelled: 0,
    };
  }

  get state(): CarState { return this.mutable; }

  setNativeTyreSelector(selector: number): void {
    this.motion.setSelector(1, selector);
    this.nativeTyreSelector = selector;
  }

  setNativeEngineSelector(selector: number): void {
    this.motion.setSelector(2, selector);
  }

  setNativeChassisSelector(selector: number): void {
    this.motion.setSelector(3, selector);
  }

  setNativeTransmissionSelector(selector: number): void {
    this.motion.setSelector(4, selector);
  }

  setNativeSteeringSelector(selector: number): void {
    this.motion.setSelector(5, selector);
  }

  setNativeBrakeSelector(selector: number): void {
    this.motion.setSelector(6, selector);
  }

  enterArea(fieldNumber: number, position: { readonly x: number; readonly z: number }): void {
    const current = this.mutable;
    this.relocate(fieldNumber, { x: position.x, y: current.position.y, z: position.z }, current.yaw);
  }

  enterSpecialOutdoor(areaCode: number, position: { readonly x: number; readonly z: number }): void {
    const current = this.mutable;
    const candidate = { x: position.x, y: current.position.y, z: position.z };
    const resolved = this.world.resolveSpecialOutdoorFootprint(
      areaCode,
      candidate,
      current.yaw,
      current.position.y,
      nativeTyreContactThreshold(this.nativeTyreSelector),
    );
    this.motion.reset(current.yaw);
    this.mutable = {
      location: { kind: "special-outdoor", areaCode },
      fieldNumber: -1,
      position: resolved?.position ?? candidate,
      yaw: current.yaw,
      nativeYaw: this.motion.nativeVehicle.yaw,
      nativeSlipAngle: this.motion.nativeVehicle.slipAngle,
      speed: 0,
      steeringAngle: 0,
      wheelSpin: 0,
      pitch: 0,
      roll: 0,
      surfaceFlags: resolved?.surfaceFlags ?? 0,
      surfaceKind: this.world.specialOutdoorDrivingSurface(areaCode, resolved?.position ?? candidate, resolved?.y ?? candidate.y),
      nativeEngineSpeed: 0,
      nativeEngineLayerSelector: 0,
      distanceTravelled: current.distanceTravelled,
    };
  }

  /** Dev/probe relocation. Player-facing area transitions use enterArea instead. */
  teleport(fieldNumber: number, position: Vec3, yaw: number): void {
    this.relocate(fieldNumber, position, yaw);
  }

  private relocate(fieldNumber: number, position: Vec3, yaw: number): void {
    this.motion.reset(yaw);
    const resolved = this.world.resolveFootprint(fieldNumber, position, yaw, position.y, nativeTyreContactThreshold(this.nativeTyreSelector));
    const resolvedFieldNumber = resolved?.fieldNumber ?? fieldNumber;
    this.mutable = {
      location: { kind: "standard-world", fieldNumber: resolvedFieldNumber },
      fieldNumber: resolvedFieldNumber,
      position: resolved?.position ?? position,
      yaw,
      nativeYaw: this.motion.nativeVehicle.yaw,
      nativeSlipAngle: this.motion.nativeVehicle.slipAngle,
      speed: 0,
      steeringAngle: 0,
      wheelSpin: 0,
      pitch: 0,
      roll: 0,
      surfaceFlags: resolved?.surfaceFlags ?? 0,
      surfaceKind: this.world.drivingSurface(resolved?.fieldNumber ?? fieldNumber, resolved?.position ?? position, resolved?.y ?? position.y),
      nativeEngineSpeed: 0,
      nativeEngineLayerSelector: 0,
      distanceTravelled: this.mutable.distanceTravelled,
    };
  }

  update(dt: number, input: DriveInput): void {
    if (Math.abs(dt - nativeDrivingFixedStepSeconds) > 1e-9) {
      throw new RangeError(`Recovered driving motion requires the PAL 50 Hz fixed step; got ${dt}.`);
    }
    const old = this.mutable;
    const throttle = clamp(input.throttle, -1, 1);
    const steering = clamp(input.steering, -1, 1);
    const surfaceKind = old.location.kind === "special-outdoor"
      ? this.world.specialOutdoorDrivingSurface(old.location.areaCode, old.position, old.position.y)
      : this.world.drivingSurface(old.fieldNumber, old.position, old.position.y);
    const motion = this.motion.step({
      throttle,
      steering,
      surfaceKind,
      contact: {
        // Free-roam still uses the browser footprint bridge, not PAL's seven-
        // probe support solver. 89 is PAL's recovered gravity quantum and is
        // used here only as the explicit level-support compatibility input.
        driveContact: true,
        accelerationY: 89,
        allowsYaw: true,
      },
    });

    // Shift/RB is a browser development traversal aid, not a recovered PAL
    // equipment path. Keep it outside native state so it cannot amplify yaw.
    const developerTravelScale = input.boost ? 5 : 1;
    let speed = motion.speed * developerTravelScale;
    const yaw = motion.yaw;
    const moveX = motion.deltaX * developerTravelScale;
    const moveZ = motion.deltaZ * developerTravelScale;
    // Wheel animation is downstream of the recovered frame boundary. Retain a
    // presentation-only projection of recovered steering/speed until recovered.
    const steeringAngle = -motion.steeringFraction * 0.48;
    let wheelSpin = old.wheelSpin - speed * dt / 0.355;
    if (Math.abs(wheelSpin) > Math.PI * 2) wheelSpin %= Math.PI * 2;
    const candidate = { x: old.position.x + moveX, y: old.position.y, z: old.position.z + moveZ };
    const contactThreshold = nativeTyreContactThreshold(this.nativeTyreSelector);
    const resolveCandidate = (position: Vec3) => old.location.kind === "special-outdoor"
      ? this.world.resolveSpecialOutdoorFootprint(old.location.areaCode, position, yaw, old.position.y, contactThreshold)
      : this.world.resolveFootprint(old.fieldNumber, position, yaw, old.position.y, contactThreshold);
    let resolved = resolveCandidate(candidate);
    let distanceMoved = resolved ? Math.hypot(moveX, moveZ) : 0;
    if (!resolved) {
      const x = resolveCandidate({ x: old.position.x + moveX, y: old.position.y, z: old.position.z });
      const z = resolveCandidate({ x: old.position.x, y: old.position.y, z: old.position.z + moveZ });
      resolved = x && (!z || Math.abs(moveX) >= Math.abs(moveZ)) ? x : z;
      if (resolved) distanceMoved = resolved === x ? Math.abs(moveX) : Math.abs(moveZ);
    }
    if (!resolved) {
      speed = 0;
      // Full PAL outdoor contact/obstacle response is not recovered. When the
      // existing footprint bridge rejects all movement, stop native translation
      // rather than inventing a bounce or impulse.
      this.motion.haltTranslation();
      resolved = { position: old.position, y: old.position.y, surfaceFlags: old.surfaceFlags };
    }

    const resolvedFieldNumber = "fieldNumber" in resolved && typeof resolved.fieldNumber === "number"
      ? resolved.fieldNumber
      : old.fieldNumber;
    const nextLocation: CarOutdoorLocation = old.location.kind === "special-outdoor"
      ? old.location
      : { kind: "standard-world", fieldNumber: resolvedFieldNumber };
    const attitude = this.groundAttitude(nextLocation, resolved.position, yaw, old.pitch, old.roll, dt);
    this.mutable = {
      location: nextLocation,
      fieldNumber: nextLocation.kind === "standard-world" ? nextLocation.fieldNumber : -1,
      position: { x: resolved.position.x, y: attitude.y, z: resolved.position.z },
      yaw,
      nativeYaw: motion.nativeVehicle.yaw,
      nativeSlipAngle: motion.nativeVehicle.slipAngle,
      speed,
      steeringAngle,
      wheelSpin,
      pitch: attitude.pitch,
      roll: attitude.roll,
      surfaceFlags: resolved.surfaceFlags,
      surfaceKind,
      nativeEngineSpeed: motion.nativeVehicle.engineSpeed,
      nativeEngineLayerSelector: (motion.commands & 1) as 0 | 1,
      distanceTravelled: old.distanceTravelled + distanceMoved,
    };
  }

  private groundAttitude(location: CarOutdoorLocation, position: Vec3, yaw: number, pitch: number, roll: number, dt: number): { y: number; pitch: number; roll: number } {
    const contacts: ReadonlyArray<readonly [number, number]> = [
      [-0.741544, 0.68], [0.741544, 0.68], [-0.724481, -0.66], [0.724481, -0.66],
    ];
    const sine = Math.sin(yaw), cosine = Math.cos(yaw);
    const heights = contacts.map(([x, z]) => {
      const point = {
        x: position.x + x * cosine + z * sine,
        y: position.y,
        z: position.z - x * sine + z * cosine,
      };
      return location.kind === "special-outdoor"
        ? this.world.sampleSpecialOutdoorGround(location.areaCode, point, position.y)?.y
        : this.world.sampleGround(location.fieldNumber, point, position.y)?.y;
    });
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
  private readonly controls: SemanticInputScope;
  private unsubscribeControls: (() => void) | undefined;
  private frameHandle = 0;
  private lastTime = 0;
  private accumulator = 0;
  private running = false;
  private paused = false;
  private inputOverride: DriveInput | undefined;
  private chaseCameraState: NativeChaseCameraState =
    createNativeChaseCameraState(browserOrdinaryChasePresetIndex);

  constructor(
    private readonly world: DrivingWorld,
    private readonly view: WorldView,
    private readonly car: Q62CarModel,
    private readonly onState: (state: CarState) => void,
    private readonly input: BrowserSemanticInput,
    motionAuthority: NativeDrivingMotionAuthority,
    private readonly onNativeEngineState?: (state: CarState, active: boolean) => void,
  ) {
    this.controller = new ArcadeCarController(world, motionAuthority);
    this.controls = input.createScope();
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    this.accumulator = 0;
    this.controls.reset();
    this.unsubscribeControls = this.input.subscribe(this.handleControlEvent);
    const state = this.controller.state;
    this.chaseCameraState = createNativeChaseCameraState(browserOrdinaryChasePresetIndex);
    this.advanceCamera(state);
    this.view.startDriving(this.car, state.fieldNumber, state.position, state.yaw);
    this.applyState(state);
    this.frameHandle = requestAnimationFrame(this.frame);
  }

  stop(): void {
    if (!this.running) return;
    this.running = false;
    cancelAnimationFrame(this.frameHandle);
    this.unsubscribeControls?.();
    this.unsubscribeControls = undefined;
    this.controls.reset();
    this.onNativeEngineState?.(this.controller.state, false);
    this.view.stopDriving();
  }

  setInputOverride(input: DriveInput | undefined): void { this.inputOverride = input; }

  setNativeTyreSelector(selector: number): void { this.controller.setNativeTyreSelector(selector); }

  setNativeEngineSelector(selector: number): void { this.controller.setNativeEngineSelector(selector); }

  setNativeChassisSelector(selector: number): void { this.controller.setNativeChassisSelector(selector); }

  setNativeTransmissionSelector(selector: number): void { this.controller.setNativeTransmissionSelector(selector); }

  setNativeSteeringSelector(selector: number): void { this.controller.setNativeSteeringSelector(selector); }

  setNativeBrakeSelector(selector: number): void { this.controller.setNativeBrakeSelector(selector); }

  setPaused(paused: boolean): void {
    if (this.paused === paused) return;
    this.paused = paused;
    this.accumulator = 0;
    this.lastTime = performance.now();
    this.controls.reset();
    this.onNativeEngineState?.(this.controller.state, this.running && !paused);
  }

  enterArea(fieldNumber: number, position: { readonly x: number; readonly z: number }): void {
    this.controls.reset();
    this.controller.enterArea(fieldNumber, position);
    this.chaseCameraState = resetNativeChaseLag(this.chaseCameraState);
    this.accumulator = 0;
    this.lastTime = performance.now();
    this.applyState(this.controller.state);
  }

  enterSpecialOutdoor(areaCode: number, position: { readonly x: number; readonly z: number }): void {
    this.controls.reset();
    this.controller.enterSpecialOutdoor(areaCode, position);
    this.chaseCameraState = resetNativeChaseLag(this.chaseCameraState);
    this.accumulator = 0;
    this.lastTime = performance.now();
    this.applyState(this.controller.state);
  }

  private readonly frame = (time: number): void => {
    if (!this.running) return;
    if (this.paused) {
      this.lastTime = time;
      this.applyState(this.controller.state);
      this.frameHandle = requestAnimationFrame(this.frame);
      return;
    }
    this.accumulator += Math.min(0.1, (time - this.lastTime) / 1000);
    this.lastTime = time;
    while (this.accumulator >= nativeDrivingFixedStepSeconds) {
      this.controller.update(nativeDrivingFixedStepSeconds, this.driveInput());
      this.advanceCamera(this.controller.state);
      this.accumulator -= nativeDrivingFixedStepSeconds;
    }
    this.applyState(this.controller.state);
    this.frameHandle = requestAnimationFrame(this.frame);
  };

  private advanceCamera(state: CarState): void {
    this.chaseCameraState = advanceNativeChaseCamera(
      this.chaseCameraState,
      {
        position: [state.position.x, state.position.y, state.position.z],
        nativeYaw: state.nativeYaw,
        nativeSlip: state.nativeSlipAngle,
      },
    );
  }

  private applyState(state: CarState): void {
    this.car.setWheelState(state.steeringAngle, state.wheelSpin);
    const nativePose = {
      position: this.chaseCameraState.position,
      target: this.chaseCameraState.target,
    };
    const chase = applyBrowserChaseObstructionSafety(nativePose, (point) =>
      state.location.kind === "special-outdoor"
        ? this.world.sampleSpecialOutdoorHighest(state.location.areaCode, point)
        : this.world.sampleHighest(state.fieldNumber, point)
    );
    if (state.location.kind === "special-outdoor") {
      this.view.updateSpecialOutdoorDriving(
        state.location.areaCode,
        state.position,
        state.yaw,
        state.pitch,
        state.roll,
        chase,
      );
    } else {
      this.view.updateDriving(
        state.location.fieldNumber,
        state.position,
        state.yaw,
        state.pitch,
        state.roll,
        chase,
      );
    }
    this.onState(state);
    this.onNativeEngineState?.(state, this.running && !this.paused);
  }

  private driveInput(): DriveInput {
    if (this.inputOverride) return this.inputOverride;
    return {
      throttle: this.controls.axis("driveThrottle"),
      steering: this.controls.axis("driveSteering"),
      boost: this.controls.action("boost").held,
    };
  }

  // While active, driving owns only movement/boost actions. Its scope resets at
  // pause and scene boundaries so held controls cannot leak across contexts.
  private readonly handleControlEvent = (event: SemanticActionEvent): void => {
    if (!this.paused && ["up", "down", "left", "right", "boost"].includes(event.action)) event.consume();
  };
}
function moveTowards(value: number, target: number, amount: number): number { return value < target ? Math.min(target, value + amount) : value > target ? Math.max(target, value - amount) : target; }
function clamp(value: number, minimum: number, maximum: number): number { return Math.max(minimum, Math.min(maximum, value)); }
