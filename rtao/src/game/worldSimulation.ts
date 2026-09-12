import type { OutdoorResidentDefinition } from "../formats/overworld";
import type { Q62CarModel } from "./carView";
import type { DrivingWorld, Vec3 } from "./worldCollision";
import { orientedBoundsOverlapXZ, type HorizontalBounds } from "./interactionContact";
import type { WorldView } from "./worldView";

export interface ResidentState {
  readonly id: string;
  readonly definition: OutdoorResidentDefinition;
  readonly fieldNumber: number;
  readonly position: Vec3;
  readonly yaw: number;
  readonly speed: number;
  readonly steeringAngle: number;
  readonly wheelSpin: number;
  readonly nextRoutePoint: number;
}

export class ResidentMover {
  private readonly route: Vec3[];
  private mutable: ResidentState;

  constructor(definition: OutdoorResidentDefinition, world: DrivingWorld) {
    const sourceSpawn = definition.spawn;
    const spawn = { x: 1600 - sourceSpawn.x, y: sourceSpawn.y, z: sourceSpawn.z };
    const sampledSpawn = world.sampleGround(definition.fieldNumber, spawn, spawn.y);
    const position = sampledSpawn?.localPosition ?? spawn;
    this.route = definition.route.map((point) => {
      const local = { x: 1600 - point.x, y: position.y, z: point.z };
      return { ...local, y: world.sampleHighest(definition.fieldNumber, local)?.y ?? position.y };
    });
    let nextRoutePoint = 0, yaw = 0;
    if (this.route.length >= 2) {
      nextRoutePoint = (nearestSegment(this.route, position) + 1) % this.route.length;
      yaw = headingToNext(this.route, position, nextRoutePoint).yaw;
      nextRoutePoint = headingToNext(this.route, position, nextRoutePoint).index;
    }
    this.mutable = {
      id: `A${definition.areaIndex.toString().padStart(2, "0")}-${definition.localIndex.toString().padStart(2, "0")}`,
      definition,
      fieldNumber: definition.fieldNumber,
      position,
      yaw,
      speed: this.route.length >= 2 ? 6.5 + (definition.localIndex % 3) * 0.6 : 0,
      steeringAngle: 0,
      wheelSpin: 0,
      nextRoutePoint,
    };
  }

  get state(): ResidentState { return this.mutable; }

  update(dt: number): void {
    const old = this.mutable;
    if (this.route.length < 2 || dt <= 0) {
      this.mutable = { ...old, steeringAngle: 0 };
      return;
    }
    let position = { ...old.position }, yaw = old.yaw, steeringAngle = old.steeringAngle;
    let next = old.nextRoutePoint, remaining = old.speed * dt, safety = this.route.length + 4;
    while (remaining > 0.0001 && safety-- > 0) {
      const target = this.route[next];
      if (!target) break;
      const dx = target.x - position.x, dz = target.z - position.z;
      const distance = Math.hypot(dx, dz);
      if (distance < 0.05) {
        position = { ...target };
        next = (next + 1) % this.route.length;
        continue;
      }
      const desiredYaw = Math.atan2(dx / distance, dz / distance);
      const yawDelta = wrapAngle(desiredYaw - yaw);
      yaw += clamp(yawDelta, -2.8 * dt, 2.8 * dt);
      steeringAngle = clamp(-yawDelta * 0.8, -0.42, 0.42);
      const step = Math.min(distance, remaining), fraction = step / distance;
      position = {
        x: position.x + dx / distance * step,
        y: position.y + (target.y - position.y) * fraction,
        z: position.z + dz / distance * step,
      };
      remaining -= step;
      if (step >= distance - 0.001) {
        position = { ...target };
        next = (next + 1) % this.route.length;
      }
    }
    let wheelSpin = old.wheelSpin - old.speed * dt / 0.355;
    if (Math.abs(wheelSpin) > Math.PI * 2) wheelSpin %= Math.PI * 2;
    this.mutable = { ...old, position, yaw, steeringAngle, wheelSpin, nextRoutePoint: next };
  }
}

export class BrowserWorldSimulation {
  readonly residents: ResidentMover[] = [];
  private readonly models = new Map<string, Q62CarModel>();
  private frameHandle = 0;
  private lastTime = 0;
  private accumulator = 0;
  private running = false;
  private paused = false;

  constructor(definitions: OutdoorResidentDefinition[], private readonly world: DrivingWorld, private readonly view: WorldView) {
    this.addDefinitions(definitions);
  }

  addDefinitions(definitions: readonly OutdoorResidentDefinition[]): number {
    const existing = new Set(this.residents.map((resident) => resident.state.id));
    let added = 0;
    for (const definition of definitions) {
      const resident = new ResidentMover(definition, this.world);
      if (existing.has(resident.state.id)) continue;
      existing.add(resident.state.id);
      this.residents.push(resident);
      added += 1;
    }
    return added;
  }

  hasModel(residentId: string): boolean { return this.models.has(residentId); }
  get modelCount(): number { return this.models.size; }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    this.frameHandle = requestAnimationFrame(this.frame);
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
    this.accumulator = 0;
    this.lastTime = performance.now();
  }

  attachModel(residentId: string, model: Q62CarModel): void {
    const resident = this.residents.find((candidate) => candidate.state.id === residentId);
    if (!resident) throw new Error(`Cannot attach a model to unknown resident '${residentId}'.`);
    this.models.set(residentId, model);
    const state = resident.state;
    this.view.addWorldActor(residentId, model, state.fieldNumber, state.position, state.yaw);
    model.setWheelState(state.steeringAngle, state.wheelSpin);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.frameHandle);
    this.view.clearWorldActors();
    for (const model of this.models.values()) model.dispose();
    this.models.clear();
  }

  nearest(fieldNumber: number, position: Vec3, maximumDistance: number): ResidentState | undefined {
    let best: ResidentState | undefined, bestDistance = maximumDistance;
    for (const resident of this.residents) {
      const state = resident.state;
      if (state.fieldNumber !== fieldNumber) continue;
      const distance = Math.hypot(state.position.x - position.x, state.position.z - position.z);
      if (distance < bestDistance) { best = state; bestDistance = distance; }
    }
    return best;
  }

  contacts(fieldNumber: number, position: Vec3, yaw: number, playerBounds: HorizontalBounds): ResidentState[] {
    const player = { position, yaw, bounds: playerBounds };
    return this.residents
      .map((resident) => resident.state)
      .filter((state) => {
        if (state.fieldNumber !== fieldNumber) return false;
        const model = this.models.get(state.id);
        return model ? orientedBoundsOverlapXZ(player, { position: state.position, yaw: state.yaw, bounds: model.localBounds }) : false;
      })
      .sort((a, b) => Math.hypot(a.position.x - position.x, a.position.z - position.z) - Math.hypot(b.position.x - position.x, b.position.z - position.z));
  }

  private readonly frame = (time: number): void => {
    if (!this.running) return;
    if (this.paused) {
      this.lastTime = time;
      this.frameHandle = requestAnimationFrame(this.frame);
      return;
    }
    this.accumulator += Math.min(0.1, (time - this.lastTime) / 1000);
    this.lastTime = time;
    const fixedStep = 1 / 60;
    while (this.accumulator >= fixedStep) {
      for (const resident of this.residents) resident.update(fixedStep);
      this.accumulator -= fixedStep;
    }
    for (const resident of this.residents) {
      const state = resident.state, model = this.models.get(state.id);
      if (!model) continue;
      model.setWheelState(state.steeringAngle, state.wheelSpin);
      this.view.updateWorldActor(state.id, state.fieldNumber, state.position, state.yaw);
    }
    this.frameHandle = requestAnimationFrame(this.frame);
  };
}

function nearestSegment(route: Vec3[], point: Vec3): number {
  let best = 0, bestSquared = Number.POSITIVE_INFINITY;
  for (let index = 0; index < route.length; index += 1) {
    const a = route[index], b = route[(index + 1) % route.length];
    if (!a || !b) continue;
    const dx = b.x - a.x, dz = b.z - a.z, lengthSquared = dx * dx + dz * dz;
    const t = lengthSquared < 0.0001 ? 0 : clamp(((point.x - a.x) * dx + (point.z - a.z) * dz) / lengthSquared, 0, 1);
    const ex = point.x - (a.x + dx * t), ez = point.z - (a.z + dz * t), squared = ex * ex + ez * ez;
    if (squared < bestSquared) { bestSquared = squared; best = index; }
  }
  return best;
}

function headingToNext(route: Vec3[], point: Vec3, start: number): { yaw: number; index: number } {
  let index = start;
  for (let attempt = 0; attempt < route.length; attempt += 1) {
    const target = route[index];
    if (target) {
      const dx = target.x - point.x, dz = target.z - point.z;
      if (dx * dx + dz * dz > 0.0025) return { yaw: Math.atan2(dx, dz), index };
    }
    index = (index + 1) % route.length;
  }
  return { yaw: 0, index };
}

function wrapAngle(angle: number): number { while (angle > Math.PI) angle -= Math.PI * 2; while (angle < -Math.PI) angle += Math.PI * 2; return angle; }
function clamp(value: number, minimum: number, maximum: number): number { return Math.max(minimum, Math.min(maximum, value)); }
