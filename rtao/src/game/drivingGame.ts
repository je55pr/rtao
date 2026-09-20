import type { Q62CarModel } from "./carView";
import type { NativeRaceMatrix } from "./nativeRaceMath";
import {
  NativeDrivingMotion,
  nativeDrivingFixedStepSeconds,
  nativeDrivingSurfaceIndex,
  type NativeDrivingMotionAuthority,
} from "./nativeDrivingMotion";
import { applyNativeDrivingEquipment, type NativeDrivingEquipmentSource } from "./nativeDrivingEquipment";
import { nativeBigTyreSelector, nativeTyreContactThreshold } from "./nativeTyrePerformance";
import {
  nativeOptionConfigurationFlag,
  nativeSpecialAbilityFlags,
  nativeSpecialPartsConfigurationFlag,
} from "./nativeSpecialAbilityRuntime";
import { NativeOutdoorContact } from "./nativeOutdoorContact";
import {
  advanceNativeAuxiliaryContactState,
  nativeDeepAuxiliarySurface,
  type NativeAuxiliaryContactState,
} from "./nativeRaceContact";
import { advanceNativeChaseCamera } from "./nativeChaseCamera";
import {
  createNativeCameraRuntimeContractState,
  reflectNativeCameraPointX,
  replaceNativeCameraController,
  selectNativeCameraRenderPose,
  type NativeCameraRuntimeContractState,
} from "./nativeCameraRuntimeContract";
import {
  advanceBrowserChaseCamera,
  rebaseBrowserChaseCamera,
  type BrowserChaseCameraState,
} from "./browserChaseCamera";
import { fieldExtent, relativeRenderTranslation } from "./worldTopology";
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
  /** Retained PAL local chassis transform; absent on compatibility-only outdoor paths. */
  readonly nativeBodyMatrix?: NativeRaceMatrix;
  readonly surfaceFlags: number;
  readonly surfaceKind: DrivingSurfaceKind;
  /** PAL car +0x213 auxiliary-height state: ordinary 0, shallow -1, deep +1. */
  readonly contactSpecialState: NativeAuxiliaryContactState;
  /** Recovered per-update contact transition flags; 0x40 marks shallow/exit transitions. */
  readonly contactRuntimeFlags: number;
  /** Browser footprint support channel, kept separate from auxiliary-height contact. */
  readonly contactHasGroundSupport: boolean;
  readonly contactAuxiliaryY: number | undefined;
  /** Runtime surface word after PAL's deep-contact 0x100651 replacement. */
  readonly nativeContactSurfaceFlags: number;
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
  private nativeContact: NativeOutdoorContact | undefined;
  private nativeTyreSelector = 0;
  /** Proven special-contact equipment bits only: Propeller 0x40 and Water Ski 0x100. */
  private nativeSpecialContactEquipmentFlags = 0;

  constructor(
    private readonly world: DrivingWorld,
    private readonly motionAuthority: NativeDrivingMotionAuthority,
    fieldNumber = 223,
    position: Vec3 = { x: 1152, y: 31, z: 555 },
    yaw = -0.1,
    initialEquipment?: NativeDrivingEquipmentSource,
  ) {
    this.motion = new NativeDrivingMotion(this.motionAuthority, yaw);
    // Startup equipment must exist before the first native contact prime: Big Tyre
    // changes both body lift and the auxiliary threshold, while Water Ski changes
    // the native contact flag word consumed by that same recurrence.
    applyNativeDrivingEquipment(this, initialEquipment);
    this.mutable = this.standardWorldState(fieldNumber, position, yaw, 0);
    this.resetNativeContact(this.mutable.fieldNumber, this.mutable.position, yaw);
  }

  get state(): CarState { return this.mutable; }

  setNativeTyreSelector(selector: number): void {
    this.motion.setSelector(1, selector);
    this.nativeTyreSelector = selector;
  }

  private nativeContactEquipmentFlags(): number {
    return this.nativeSpecialContactEquipmentFlags
      | (this.nativeTyreSelector === nativeBigTyreSelector ? 0x400 : 0);
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

  setNativeSpecialSelector(selector: number): void {
    const fittedFlags = nativeSpecialPartsConfigurationFlag(selector);
    this.nativeSpecialContactEquipmentFlags =
      (this.nativeSpecialContactEquipmentFlags & ~nativeSpecialAbilityFlags.propeller)
      | (fittedFlags & nativeSpecialAbilityFlags.propeller);
  }

  setNativeOptionSelector(selector: number): void {
    const fittedFlags = nativeOptionConfigurationFlag(selector);
    this.nativeSpecialContactEquipmentFlags =
      (this.nativeSpecialContactEquipmentFlags & ~nativeSpecialAbilityFlags.waterSki)
      | (fittedFlags & nativeSpecialAbilityFlags.waterSki);
  }

  setNativeSpecialAbilityFlags(flags: number): void {
    const contactAbilityMask = nativeSpecialAbilityFlags.propeller | nativeSpecialAbilityFlags.waterSki;
    this.nativeSpecialContactEquipmentFlags = flags & contactAbilityMask;
  }

  private auxiliaryContact(
    referenceY: number,
    auxiliaryY: number | undefined,
    previousSpecialState: NativeAuxiliaryContactState = 0,
  ): { readonly specialState: NativeAuxiliaryContactState; readonly runtimeFlags: number } {
    return advanceNativeAuxiliaryContactState({
      referenceY,
      extraY: auxiliaryY,
      threshold: nativeTyreContactThreshold(this.nativeTyreSelector),
      previousSpecialState,
      // The PAL frame supplies a fresh runtime flag word before this contact stage;
      // retain the recovered 0x40 transition as a per-update pulse here as well.
      runtimeFlags: 0,
    });
  }

  private standardWorldState(
    fieldNumber: number,
    position: Vec3,
    yaw: number,
    distanceTravelled: number,
  ): CarState {
    if (this.world.hasNativeField(fieldNumber)) {
      return {
        location: { kind: "standard-world", fieldNumber },
        fieldNumber,
        position,
        yaw,
        nativeYaw: this.motion.nativeVehicle.yaw,
        nativeSlipAngle: this.motion.nativeVehicle.slipAngle,
        speed: 0,
        steeringAngle: 0,
        wheelSpin: 0,
        pitch: 0,
        roll: 0,
        surfaceFlags: 0,
        surfaceKind: "other",
        contactSpecialState: 0,
        contactRuntimeFlags: 0,
        contactHasGroundSupport: false,
        contactAuxiliaryY: undefined,
        nativeContactSurfaceFlags: 0,
        nativeEngineSpeed: 0,
        nativeEngineLayerSelector: 0,
        distanceTravelled,
      };
    }

    // Compiled-only fixtures retain the old browser compatibility bridge.
    const resolved = this.world.resolveFootprint(fieldNumber, position, yaw, position.y);
    const resolvedFieldNumber = resolved?.fieldNumber ?? fieldNumber;
    const contact = this.auxiliaryContact(position.y, resolved?.auxiliaryY);
    return {
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
      surfaceKind: this.world.drivingSurface(
        resolved?.fieldNumber ?? fieldNumber,
        resolved?.position ?? position,
        resolved?.y ?? position.y,
      ),
      contactSpecialState: contact.specialState,
      contactRuntimeFlags: contact.runtimeFlags,
      contactHasGroundSupport: resolved?.hasGroundSupport ?? false,
      contactAuxiliaryY: resolved?.auxiliaryY,
      nativeContactSurfaceFlags: contact.specialState > 0
        ? nativeDeepAuxiliarySurface(resolved?.surfaceFlags ?? 0)
        : resolved?.surfaceFlags ?? 0,
      nativeEngineSpeed: 0,
      nativeEngineLayerSelector: 0,
      distanceTravelled,
    };
  }

  private resetNativeContact(fieldNumber: number, position: Vec3, yaw: number): void {
    if (!this.world.hasNativeField(fieldNumber)) {
      this.nativeContact = undefined;
      return;
    }
    const runtime = new NativeOutdoorContact(
      this.motionAuthority,
      fieldNumber,
      position,
      this.motion.nativeVehicle.yaw,
    );
    const equipmentFlags = this.nativeContactEquipmentFlags();
    runtime.prime(
      (sourceField, point) => this.world.queryNativeContact(sourceField, point),
      equipmentFlags,
      equipmentFlags & 0x400,
    );
    this.nativeContact = runtime;
    this.mutable = this.applyNativeContactPose(this.mutable, runtime.pose(yaw));
  }

  private applyNativeContactPose(
    state: CarState,
    pose: ReturnType<NativeOutdoorContact["pose"]>,
  ): CarState {
    const runtime = this.nativeContact;
    if (!runtime) return state;
    return {
      ...state,
      location: { kind: "standard-world", fieldNumber: pose.fieldNumber },
      fieldNumber: pose.fieldNumber,
      position: pose.position,
      pitch: pose.pitch,
      roll: pose.roll,
      nativeBodyMatrix: pose.bodyMatrix,
      surfaceFlags: pose.surfaceFlags,
      surfaceKind: this.world.drivingSurface(pose.fieldNumber, pose.position, pose.position.y),
      contactSpecialState: runtime.specialState,
      contactRuntimeFlags: runtime.runtimeFlags,
      contactHasGroundSupport: pose.hasGroundSupport,
      contactAuxiliaryY: pose.auxiliaryY,
      nativeContactSurfaceFlags: pose.surfaceFlags,
    };
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
    );
    const contact = this.auxiliaryContact(current.position.y, resolved?.auxiliaryY);
    this.motion.reset(current.yaw);
    this.nativeContact = undefined;
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
      contactSpecialState: contact.specialState,
      contactRuntimeFlags: contact.runtimeFlags,
      contactHasGroundSupport: resolved?.hasGroundSupport ?? false,
      contactAuxiliaryY: resolved?.auxiliaryY,
      nativeContactSurfaceFlags: contact.specialState > 0
        ? nativeDeepAuxiliarySurface(resolved?.surfaceFlags ?? 0)
        : resolved?.surfaceFlags ?? 0,
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
    const distanceTravelled = this.mutable.distanceTravelled;
    this.motion.reset(yaw);
    this.mutable = this.standardWorldState(fieldNumber, position, yaw, distanceTravelled);
    this.resetNativeContact(this.mutable.fieldNumber, this.mutable.position, yaw);
  }

  update(dt: number, input: DriveInput): void {
    if (Math.abs(dt - nativeDrivingFixedStepSeconds) > 1e-9) {
      throw new RangeError(`Recovered driving motion requires the PAL 50 Hz fixed step; got ${dt}.`);
    }
    const old = this.mutable;
    const throttle = clamp(input.throttle, -1, 1);
    const steering = clamp(input.steering, -1, 1);
    const nativeContact = old.location.kind === "standard-world" ? this.nativeContact : undefined;
    const motion = this.motion.step({
      throttle,
      steering,
      surfaceIndex: nativeContact ? undefined : nativeDrivingSurfaceIndex(old.surfaceKind),
      contact: nativeContact ? {
        // Standard FLD gameplay derives drive/yaw/vertical support inputs from
        // retained PAL suspension history. Browser level-support summaries do not enter this path.
        specialState: nativeContact.specialState,
        propellerEnabled: (this.nativeSpecialContactEquipmentFlags & 0x40) !== 0,
        waterSkiEnabled: (this.nativeSpecialContactEquipmentFlags & 0x100) !== 0,
        native: nativeContact.retainedContact,
      } : {
        // Compiled-only and special-outdoor scenes retain the explicit compatibility bridge.
        driveContact: old.contactHasGroundSupport,
        accelerationY: 89,
        allowsYaw: old.contactHasGroundSupport
          || (old.contactSpecialState !== 0 && (this.nativeSpecialContactEquipmentFlags & 0x100) !== 0),
        specialState: old.contactSpecialState,
        propellerEnabled: (this.nativeSpecialContactEquipmentFlags & 0x40) !== 0,
        waterSkiEnabled: (this.nativeSpecialContactEquipmentFlags & 0x100) !== 0,
      },
    });

    if (nativeContact) {
      const equipmentFlags = this.nativeContactEquipmentFlags();
      const advanced = nativeContact.advance(
        motion,
        (sourceField, point) => this.world.queryNativeContact(sourceField, point),
        equipmentFlags,
        equipmentFlags & 0x400,
        (sourceField, position, inverseYaw, height) => this.world.queryNativeObstacle(
          sourceField,
          position,
          inverseYaw,
          height,
          this.motionAuthority.obstacle,
        ),
      );
      if (!advanced) {
        // The browser north/south torus is intentionally not a native-contact
        // input. Fail closed only at that unrecovered outer-world boundary.
        this.motion.haltTranslation();
        this.mutable = {
          ...old,
          speed: 0,
          nativeEngineSpeed: motion.nativeVehicle.engineSpeed,
          nativeEngineLayerSelector: (motion.commands & 1) as 0 | 1,
        };
        return;
      }
      this.motion.applyNativeContactResponse(advanced.velocity, advanced.yaw, advanced.runtimeFlags);
      const nativeVehicle = this.motion.nativeVehicle;
      const yaw = advanced.browserYaw;
      const pose = nativeContact.pose(yaw);
      const speed = motion.speed;
      const steeringAngle = -motion.steeringFraction * 0.48;
      let wheelSpin = old.wheelSpin - speed * dt / 0.355;
      if (Math.abs(wheelSpin) > Math.PI * 2) wheelSpin %= Math.PI * 2;
      const state: CarState = {
        ...old,
        yaw,
        nativeYaw: nativeVehicle.yaw,
        nativeSlipAngle: nativeVehicle.slipAngle,
        speed,
        steeringAngle,
        wheelSpin,
        nativeEngineSpeed: nativeVehicle.engineSpeed,
        nativeEngineLayerSelector: (motion.commands & 1) as 0 | 1,
        distanceTravelled: old.distanceTravelled + Math.hypot(motion.deltaX, motion.deltaZ),
      };
      this.mutable = this.applyNativeContactPose(state, pose);
      return;
    }

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
    const resolveCandidate = (position: Vec3) => old.location.kind === "special-outdoor"
      ? this.world.resolveSpecialOutdoorFootprint(old.location.areaCode, position, yaw, old.position.y)
      : this.world.resolveFootprint(old.fieldNumber, position, yaw, old.position.y);
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
      // Auxiliary-height contact is no longer rejected here. A remaining miss
      // is an ordinary unresolved obstacle/support case, whose full PAL response
      // is still unrecovered. Keep the existing no-bounce stop without a magic
      // shoreline retreat or teleport.
      resolved = resolveCandidate(old.position);
      this.motion.haltTranslation();
      resolved ??= {
        position: old.position,
        y: old.position.y,
        surfaceFlags: old.surfaceFlags,
        hasGroundSupport: old.contactHasGroundSupport,
        ...(old.contactAuxiliaryY === undefined ? {} : { auxiliaryY: old.contactAuxiliaryY }),
      };
    }

    const resolvedFieldNumber = "fieldNumber" in resolved && typeof resolved.fieldNumber === "number"
      ? resolved.fieldNumber
      : old.fieldNumber;
    const nextLocation: CarOutdoorLocation = old.location.kind === "special-outdoor"
      ? old.location
      : { kind: "standard-world", fieldNumber: resolvedFieldNumber };
    const contact = this.auxiliaryContact(old.position.y, resolved.auxiliaryY, old.contactSpecialState);
    const attitude = this.groundAttitude(nextLocation, resolved.position, yaw, old.pitch, old.roll, dt);
    const resolvedSurfaceKind = nextLocation.kind === "special-outdoor"
      ? this.world.specialOutdoorDrivingSurface(nextLocation.areaCode, resolved.position, resolved.y)
      : this.world.drivingSurface(nextLocation.fieldNumber, resolved.position, resolved.y);
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
      surfaceKind: resolvedSurfaceKind,
      contactSpecialState: contact.specialState,
      contactRuntimeFlags: contact.runtimeFlags,
      contactHasGroundSupport: resolved.hasGroundSupport,
      contactAuxiliaryY: resolved.auxiliaryY,
      nativeContactSurfaceFlags: contact.specialState > 0
        ? nativeDeepAuxiliarySurface(resolved.surfaceFlags)
        : resolved.surfaceFlags,
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
  private cameraRuntimeState: NativeCameraRuntimeContractState =
    createNativeCameraRuntimeContractState(browserOrdinaryChasePresetIndex);
  private browserChaseCameraState: BrowserChaseCameraState = {
    position: [0, 0, 0], target: [0, 0, 0], ready: false,
  };

  constructor(
    private readonly world: DrivingWorld,
    private readonly view: WorldView,
    private readonly car: Q62CarModel,
    private readonly onState: (state: CarState) => void,
    private readonly input: BrowserSemanticInput,
    motionAuthority: NativeDrivingMotionAuthority,
    private readonly onNativeEngineState?: (state: CarState, active: boolean) => void,
    initialEquipment?: NativeDrivingEquipmentSource,
  ) {
    this.controller = new ArcadeCarController(
      world,
      motionAuthority,
      223,
      { x: 1152, y: 31, z: 555 },
      -0.1,
      initialEquipment,
    );
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
    this.cameraRuntimeState = createNativeCameraRuntimeContractState(browserOrdinaryChasePresetIndex);
    this.browserChaseCameraState = { position: [0, 0, 0], target: [0, 0, 0], ready: false };
    this.advanceCamera(state, true);
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

  setNativeSpecialSelector(selector: number): void { this.controller.setNativeSpecialSelector(selector); }

  setNativeOptionSelector(selector: number): void { this.controller.setNativeOptionSelector(selector); }

  setNativeSpecialAbilityFlags(flags: number): void { this.controller.setNativeSpecialAbilityFlags(flags); }

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
    this.advanceCamera(this.controller.state, true);
    this.accumulator = 0;
    this.lastTime = performance.now();
    this.applyState(this.controller.state);
  }

  enterSpecialOutdoor(areaCode: number, position: { readonly x: number; readonly z: number }): void {
    this.controls.reset();
    this.controller.enterSpecialOutdoor(areaCode, position);
    this.advanceCamera(this.controller.state, true);
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
      const previousState = this.controller.state;
      this.controller.update(nativeDrivingFixedStepSeconds, this.driveInput());
      const nextState = this.controller.state;
      if (previousState.location.kind === "standard-world"
        && nextState.location.kind === "standard-world"
        && previousState.fieldNumber !== nextState.fieldNumber) {
        const offset = relativeRenderTranslation(previousState.fieldNumber, nextState.fieldNumber);
        this.browserChaseCameraState = rebaseBrowserChaseCamera(
          this.browserChaseCameraState,
          offset.x,
          offset.y,
        );
      }
      this.advanceCamera(nextState, false);
      this.accumulator -= nativeDrivingFixedStepSeconds;
    }
    this.applyState(this.controller.state);
    this.frameHandle = requestAnimationFrame(this.frame);
  };

  private advanceCamera(state: CarState, snap: boolean): void {
    // Keep advancing the recovered native camera state for evidence-backed
    // yaw/slip/recenter behavior, but do not project its unproven 0.001 lag
    // recurrence directly into browser world-space coordinates.
    this.cameraRuntimeState = replaceNativeCameraController(
      this.cameraRuntimeState,
      advanceNativeChaseCamera(
        this.cameraRuntimeState.controller,
        {
          // DrivingWorld exposes reflected render coordinates. Undo only the
          // established host reflection here so native camera state never mixes
          // browser handedness into PAL yaw/follow arithmetic.
          position: [fieldExtent - state.position.x, state.position.y, state.position.z],
          nativeYaw: state.nativeYaw,
          nativeSlip: state.nativeSlipAngle,
        },
      ),
    );
    this.browserChaseCameraState = advanceBrowserChaseCamera(
      this.browserChaseCameraState,
      { position: [state.position.x, state.position.y, state.position.z], yaw: state.yaw, cameraLift: 4.2 },
      snap,
    );
  }

  private applyState(state: CarState): void {
    this.car.setNativeBodyMatrix(state.nativeBodyMatrix);
    this.car.setWheelState(state.steeringAngle, state.wheelSpin);
    const fallbackPose = {
      position: this.browserChaseCameraState.position,
      target: this.browserChaseCameraState.target,
    };
    const hostPose = state.location.kind === "standard-world"
      ? selectNativeCameraRenderPose(
          this.cameraRuntimeState,
          (point) => reflectNativeCameraPointX(point, fieldExtent),
          fallbackPose,
        ).pose
      : fallbackPose;
    const chase = applyBrowserChaseObstructionSafety(hostPose, (point) =>
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
