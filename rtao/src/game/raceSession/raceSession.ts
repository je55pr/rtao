import type {
  OrdinaryRaceEntrant,
  RaceActivityDescriptor,
  RaceCatalogue,
  RaceFinishGateSet,
} from "../../formats/raceCatalogue";
import type { RecoveredCommerceState } from "../commerceProgress";
import {
  advanceNativeRaceFrame,
  type NativeRaceFrameData,
  type NativeRaceFrameState,
} from "../nativeRaceFrame";
import type { NativeRaceVector } from "../nativeRaceMath";
import type { NativeRaceEquipment } from "../nativeRaceVehicle";
import { nativeRacePositions } from "../racePositions";
import {
  advanceNativeRaceFinishGate,
  nativeUnfinishedRaceIndex,
  type RaceCompletionResult,
  type RecoveredRaceState,
} from "../raceProgress";
import {
  advanceNativeRaceCountdown,
  type NativeRaceCountdownOutput,
} from "../raceScheduling";

export type OrdinaryRaceSessionPhase = "countdown" | "racing" | "field-finished";export interface OrdinaryRaceCountdownSeed {
  readonly elapsedUpdates: number;
  readonly fadeUpdates: number;
  readonly sceneFlags: number;
  readonly updatesPerSecond: 50 | 60;
}

export interface OrdinaryRaceSessionEntrantInput {
  readonly entrant: OrdinaryRaceEntrant;
  /**
   * Must come from an evidence-backed initializer. The full PAL reset/scene
   * initializer is intentionally not reconstructed by this session layer.
   */
  readonly state: NativeRaceFrameState;
  readonly equipment: NativeRaceEquipment;
  readonly equipmentFlags: number;
  readonly obstaclePoints: readonly NativeRaceVector[];
  /** Optional recovered navigation metrics used only for live ordering. */
  readonly navigationOutput?: number;
  readonly navigationDistance?: number;
}

export interface OrdinaryRaceSessionConfig {
  readonly activity: RaceActivityDescriptor;
  readonly finishGates: RaceFinishGateSet;
  readonly countdown: OrdinaryRaceCountdownSeed;
  readonly frameData: NativeRaceFrameData;
  readonly query: Parameters<typeof advanceNativeRaceFrame>[2];  readonly sceneKind: number;
  readonly sceneByte0B: number;
  readonly raceModeByte: number;
  readonly globalEquipmentFlags: number;
  readonly entrants: readonly OrdinaryRaceSessionEntrantInput[];
}

export interface OrdinaryRaceSessionCommand {
  readonly commands: number;
  readonly navigationOutput?: number;
  readonly navigationDistance?: number;
}

export interface OrdinaryRaceSessionCarView {
  readonly entrant: OrdinaryRaceEntrant;
  readonly state: NativeRaceFrameState;
  readonly completedLaps: number;
  readonly finishGatePhase: number;
  readonly finishIndex: number | null;
  readonly speedLimit: number;
  readonly navigationOutput: number | null;
  readonly navigationDistance: number | null;
}

export type OrdinaryRaceSessionCommandSource = (
  car: OrdinaryRaceSessionCarView,
) => OrdinaryRaceSessionCommand;

export interface OrdinaryRaceSessionStepInput {
  readonly sceneTime: number;
  readonly shortFinalPhase: boolean;
  readonly commandSource: OrdinaryRaceSessionCommandSource;
}export interface OrdinaryRaceSessionFrameEvent {
  readonly carIndex: number;
  readonly completedLap: boolean;
  readonly finishIndex: number | null;
  readonly frame: ReturnType<typeof advanceNativeRaceFrame>;
}

export interface OrdinaryRaceSessionStepResult {
  readonly phase: OrdinaryRaceSessionPhase;
  readonly countdown: NativeRaceCountdownOutput | null;
  readonly frames: readonly OrdinaryRaceSessionFrameEvent[];
}

export type OrdinaryRaceLivePositions =
  | { readonly status: "available"; readonly positions: readonly { carIndex: number; positionIndex: number }[] }
  | { readonly status: "navigation-metrics-required"; readonly carIndices: readonly number[] }
  | { readonly status: "inactive-unfinished"; readonly carIndices: readonly number[] };

export interface OrdinaryRaceResultHandoff {
  readonly status: "ready" | "waiting-for-team-finish";
  readonly activityId: number;
  readonly nativeFinishIndices: readonly number[];
  readonly waitingCarIndices: readonly number[];
}

interface RuntimeEntrant extends OrdinaryRaceSessionEntrantInput {
  state: NativeRaceFrameState;
  completedLaps: number;
  finishGatePhase: number;
  finishIndex: number | null;
  speedLimit: number;
  navigationOutput: number | undefined;
  navigationDistance: number | undefined;
}export class OrdinaryRaceSession {
  private readonly activity: RaceActivityDescriptor;
  private readonly finishGates: RaceFinishGateSet;
  private readonly frameData: NativeRaceFrameData;
  private readonly query: Parameters<typeof advanceNativeRaceFrame>[2];
  private readonly sceneKind: number;
  private readonly sceneByte0B: number;
  private readonly raceModeByte: number;
  private readonly globalEquipmentFlags: number;
  private readonly cars: RuntimeEntrant[];
  private elapsedUpdates: number;
  private fadeUpdates: number;
  private sceneFlags: number;
  private readonly updatesPerSecond: 50 | 60;
  private countdownCompleted = false;
  private finishCount = 0;
  private resultApplied = false;
  private readonly frameAdvance: typeof advanceNativeRaceFrame;

  constructor(
    config: OrdinaryRaceSessionConfig,
    dependencies: { readonly advanceFrame?: typeof advanceNativeRaceFrame } = {},
  ) {
    validateConfig(config);
    this.activity = config.activity;
    this.finishGates = config.finishGates;
    this.frameData = config.frameData;
    this.query = config.query;
    this.sceneKind = config.sceneKind;
    this.sceneByte0B = config.sceneByte0B;    this.raceModeByte = config.raceModeByte;
    this.globalEquipmentFlags = config.globalEquipmentFlags;
    this.elapsedUpdates = config.countdown.elapsedUpdates;
    this.fadeUpdates = config.countdown.fadeUpdates;
    this.sceneFlags = config.countdown.sceneFlags >>> 0;
    this.updatesPerSecond = config.countdown.updatesPerSecond;
    this.frameAdvance = dependencies.advanceFrame ?? advanceNativeRaceFrame;
    this.cars = [...config.entrants]
      .sort((a, b) => a.entrant.carIndex - b.entrant.carIndex)
      .map((car) => ({
        ...car,
        state: car.state,
        completedLaps: 0,
        finishGatePhase: 1,
        finishIndex: null,
        speedLimit: 0,
        navigationOutput: car.navigationOutput,
        navigationDistance: car.navigationDistance,
      }));
  }

  get phase(): OrdinaryRaceSessionPhase {
    if (this.finishCount === this.cars.length) return "field-finished";
    return (this.sceneFlags & 4) !== 0 ? "racing" : "countdown";
  }

  get activityId(): number {
    return this.activity.activityId;
  }

  get currentSceneFlags(): number {
    return this.sceneFlags;
  }  get isCountdownComplete(): boolean {
    return this.countdownCompleted;
  }

  entrant(carIndex: number): OrdinaryRaceSessionCarView {
    return viewOf(this.requireCar(carIndex));
  }

  step(input: OrdinaryRaceSessionStepInput): OrdinaryRaceSessionStepResult {
    if (!Number.isInteger(input.sceneTime)) throw new RangeError("Race scene time must be an integer.");
    let countdown: NativeRaceCountdownOutput | null = null;
    if (!this.countdownCompleted) {
      countdown = advanceNativeRaceCountdown({
        elapsedUpdates: this.elapsedUpdates,
        fadeUpdates: this.fadeUpdates,
        sceneFlags: this.sceneFlags,
        updatesPerSecond: this.updatesPerSecond,
        shortFinalPhase: input.shortFinalPhase,
      });
      this.fadeUpdates = countdown.fadeUpdates;
      this.sceneFlags = countdown.sceneFlags;
      this.countdownCompleted = countdown.completed;
      this.elapsedUpdates = countdown.completed ? countdown.elapsedUpdates : countdown.elapsedUpdates + 1;
    }

    const frames: OrdinaryRaceSessionFrameEvent[] = [];
    for (const car of this.cars) {
      if (car.finishIndex !== null) continue;
      const command = input.commandSource(viewOf(car));
      validateCommand(command);
      if (command.navigationOutput !== undefined) car.navigationOutput = command.navigationOutput;
      if (command.navigationDistance !== undefined) car.navigationDistance = command.navigationDistance;      const frame = this.frameAdvance({
        state: car.state,
        equipment: car.equipment,
        equipmentFlags: car.equipmentFlags,
        globalEquipmentFlags: this.globalEquipmentFlags,
        sceneFlags: this.sceneFlags,
        sceneKind: this.sceneKind,
        sceneByte0B: this.sceneByte0B,
        sceneTime: input.sceneTime,
        raceModeByte: this.raceModeByte,
        commands: command.commands,
        highShiftSchedule: true,
        obstaclePoints: car.obstaclePoints,
      }, this.frameData, this.query);
      this.sceneFlags = frame.sceneFlags;
      car.state = frame.state;

      const gate = advanceNativeRaceFinishGate(
        this.finishGates,
        car.finishGatePhase,
        car.state.coordinates[0],
        car.state.coordinates[2],
      );
      car.finishGatePhase = gate.phase;
      let completedLap = false;
      if (gate.completedLap) {
        completedLap = true;
        car.completedLaps += 1;
        if (car.completedLaps === this.activity.rawParameter2) {
          car.finishIndex = this.finishCount;
          this.finishCount += 1;
          car.speedLimit = 40;
          car.state = {
            ...car.state,
            carFlags: (car.state.carFlags | 0x280) >>> 0,
            positionIndex: car.finishIndex,
          };
        }
      }      if (car.completedLaps > this.activity.rawParameter2) {
        throw new Error("Race lap state advanced beyond the recovered descriptor lap count.");
      }
      frames.push({ carIndex: car.entrant.carIndex, completedLap, finishIndex: car.finishIndex, frame });
    }
    return { phase: this.phase, countdown, frames };
  }

  livePositions(): OrdinaryRaceLivePositions {
    const unfinished = this.cars.filter((car) => car.finishIndex === null);
    const inactive = unfinished.filter((car) => (car.state.carFlags & 0xffff) === 0);
    if (inactive.length > 0) {
      return { status: "inactive-unfinished", carIndices: inactive.map((car) => car.entrant.carIndex) };
    }
    const missing = unfinished.filter((car) => car.navigationOutput === undefined || car.navigationDistance === undefined);
    if (missing.length > 0) {
      return { status: "navigation-metrics-required", carIndices: missing.map((car) => car.entrant.carIndex) };
    }
    const active = nativeRacePositions(this.cars.map((car) => ({
      carIndex: car.entrant.carIndex,
      flags: car.state.carFlags,
      completedLaps: car.completedLaps,
      finishGatePhase: car.finishGatePhase,
      navigationOutput: car.navigationOutput ?? 0,
      navigationDistance: car.navigationDistance ?? 0,
    })), this.finishCount);
    const positions = this.cars.map((car) => ({
      carIndex: car.entrant.carIndex,
      positionIndex: car.finishIndex ?? active.find((value) => value.carIndex === car.entrant.carIndex)?.positionIndex ?? 0xff,
    })).sort((a, b) => a.positionIndex - b.positionIndex || a.carIndex - b.carIndex);
    return { status: "available", positions };
  }  finalPositions(): readonly { carIndex: number; positionIndex: number }[] | null {
    if (this.finishCount !== this.cars.length) return null;
    return this.cars
      .map((car) => ({ carIndex: car.entrant.carIndex, positionIndex: car.finishIndex! }))
      .sort((a, b) => a.positionIndex - b.positionIndex);
  }

  resultHandoff(): OrdinaryRaceResultHandoff {
    const team = this.rewardCars();
    const waitingCarIndices = team.filter((car) => car.finishIndex === null).map((car) => car.entrant.carIndex);
    return {
      status: waitingCarIndices.length === 0 ? "ready" : "waiting-for-team-finish",
      activityId: this.activity.activityId,
      nativeFinishIndices: team.map((car) => car.finishIndex ?? nativeUnfinishedRaceIndex),
      waitingCarIndices,
    };
  }

  applyResult(
    catalogue: RaceCatalogue,
    races: RecoveredRaceState,
    commerce: RecoveredCommerceState,
  ): RaceCompletionResult {
    if (this.resultApplied) throw new Error("Ordinary race result has already been handed off.");
    const handoff = this.resultHandoff();
    if (handoff.status !== "ready") {
      throw new Error("Race result handoff is gated until every reward-bearing team car has a finish index.");
    }
    const result = races.completeOrdinaryRace(catalogue, this.activity.activityId, handoff.nativeFinishIndices, commerce);
    this.resultApplied = true;
    return result;
  }

  private rewardCars(): RuntimeEntrant[] {
    return this.cars.filter((car) => car.entrant.kind === "player" || car.entrant.kind === "teammate")
      .sort((a, b) => rewardOrder(a.entrant) - rewardOrder(b.entrant));
  }  private requireCar(carIndex: number): RuntimeEntrant {
    const car = this.cars.find((value) => value.entrant.carIndex === carIndex);
    if (!car) throw new RangeError(`Race session has no car ${carIndex}.`);
    return car;
  }
}

function viewOf(car: RuntimeEntrant): OrdinaryRaceSessionCarView {
  return {
    entrant: car.entrant,
    state: car.state,
    completedLaps: car.completedLaps,
    finishGatePhase: car.finishGatePhase,
    finishIndex: car.finishIndex,
    speedLimit: car.speedLimit,
    navigationOutput: car.navigationOutput ?? null,
    navigationDistance: car.navigationDistance ?? null,
  };
}

function rewardOrder(entrant: OrdinaryRaceEntrant): number {
  if (entrant.kind === "player") return 0;
  if (entrant.kind === "teammate") return entrant.teamSlot;
  return 3;
}

function validateCommand(command: OrdinaryRaceSessionCommand): void {
  if (!Number.isInteger(command.commands) || (command.commands | 0) !== command.commands) {
    throw new RangeError("Race commands must retain a signed 32-bit mask.");
  }
  if (command.navigationOutput !== undefined &&
      (!Number.isInteger(command.navigationOutput) || command.navigationOutput < 0 || command.navigationOutput > 0xff)) {
    throw new RangeError("Race navigation output must be a byte.");
  }
  if (command.navigationDistance !== undefined && !Number.isFinite(command.navigationDistance)) {
    throw new RangeError("Race navigation distance must be finite.");
  }
}function validateConfig(config: OrdinaryRaceSessionConfig): void {
  if (!config.activity.ordinaryRace) throw new Error("Race session requires an ordinary PAL race activity.");
  if (config.finishGates.courseId !== config.activity.sceneId) {
    throw new Error("Race session finish gates do not match the activity course.");
  }
  if (!Number.isInteger(config.activity.rawParameter2) || config.activity.rawParameter2 < 1 || config.activity.rawParameter2 > 0x7f) {
    throw new RangeError("Ordinary race lap count must retain the recovered positive byte value.");
  }
  if (config.entrants.length !== config.activity.rawParameter1 || config.entrants.length < 1 || config.entrants.length > 24) {
    throw new RangeError("Race session entrant count must match the ordinary descriptor and fit native car slots.");
  }
  if (config.sceneKind < 0 || config.sceneKind === 28 || config.sceneByte0B !== 0) {
    throw new RangeError("Race session cannot enter unrecovered reset/debug/scene-28 frame paths.");
  }
  if (!Number.isInteger(config.countdown.elapsedUpdates) || config.countdown.elapsedUpdates < 0 ||
      !Number.isInteger(config.countdown.fadeUpdates) || config.countdown.fadeUpdates < 0) {
    throw new RangeError("Race session countdown seed must contain non-negative native counters.");
  }
  const indices = new Set<number>();
  let playerCount = 0;
  for (const car of config.entrants) {
    const index = car.entrant.carIndex;
    if (!Number.isInteger(index) || index < 0 || index > 23 || indices.has(index)) {
      throw new RangeError("Race session entrants require unique native car slots 0..23.");
    }
    indices.add(index);
    if (car.entrant.kind === "player") {
      playerCount += 1;
      if (index !== 0) throw new Error("Recovered ordinary-race player ownership requires car slot 0.");
    }
    if ((car.equipmentFlags & 0x300c) !== 0 || (car.state.carFlags & 0x200) !== 0) {
      throw new RangeError("Race session input enters an unrecovered equipment/reset or pre-finished path.");
    }
    validateNavigationPair(car.navigationOutput, car.navigationDistance);
  }
  if (playerCount !== 1) throw new Error("Recovered ordinary-race sessions require exactly one player entrant.");
}function validateNavigationPair(output: number | undefined, distance: number | undefined): void {
  if ((output === undefined) !== (distance === undefined)) {
    throw new RangeError("Race navigation output and distance must be supplied together.");
  }
  if (output !== undefined && (!Number.isInteger(output) || output < 0 || output > 0xff)) {
    throw new RangeError("Race navigation output must be a byte.");
  }
  if (distance !== undefined && !Number.isFinite(distance)) {
    throw new RangeError("Race navigation distance must be finite.");
  }
}