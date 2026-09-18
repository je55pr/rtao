export type DrivingValidationVector = readonly [number, number, number];

export interface DrivingValidationObservation {
  readonly label: string;
  readonly tick: number;
  readonly commands: number;
  readonly equipmentFlags: number;
  readonly pose: {
    readonly position: DrivingValidationVector;
    readonly yaw: number;
  };
  readonly velocity: DrivingValidationVector;
  readonly vehicle: {
    readonly nativeSpeed: number;
    readonly gear: number;
    readonly equipmentBoostState: number;
  };
  readonly contact: {
    readonly support: DrivingValidationVector;
    readonly impulses: DrivingValidationVector;
    readonly surfaces: readonly number[];
    readonly contactFlags: number;
    readonly obstacleFlags: number;
  };
}

export interface DrivingValidationTolerances {
  readonly position: number;
  readonly yaw: number;
  readonly velocity: number;
  readonly contact: number;
}

export interface DrivingCameraObservation {
  readonly label: string;
  readonly tick: number;
  readonly position: DrivingValidationVector;
  readonly target: DrivingValidationVector;
}

export const exactDrivingValidationTolerances: DrivingValidationTolerances = {
  position: 0,
  yaw: 0,
  velocity: 0,
  contact: 0,
};

export class DrivingValidationError extends Error {
  constructor(readonly mismatches: readonly string[]) {
    super(`PAL driving divergence:\n${mismatches.join("\n")}`);
    this.name = "DrivingValidationError";
  }
}

export function assertBrowserDrivingTraceMatchesPal(
  browser: readonly DrivingValidationObservation[],
  pal: readonly DrivingValidationObservation[],
  tolerances: DrivingValidationTolerances = exactDrivingValidationTolerances,
): void {
  const mismatches: string[] = [];
  if (browser.length !== pal.length) {
    mismatches.push(`trace.length browser=${browser.length} PAL=${pal.length}`);
  }
  const count = Math.min(browser.length, pal.length);
  for (let index = 0; index < count; index += 1) {
    compareObservation(browser[index]!, pal[index]!, tolerances, mismatches);
  }
  if (mismatches.length > 0) throw new DrivingValidationError(mismatches);
}

export function assertBrowserCameraTraceMatchesPal(
  browser: readonly DrivingCameraObservation[],
  pal: readonly DrivingCameraObservation[],
  tolerance = 0,
): void {
  const mismatches: string[] = [];
  if (browser.length !== pal.length) {
    mismatches.push(`camera trace.length browser=${browser.length} PAL=${pal.length}`);
  }
  const count = Math.min(browser.length, pal.length);
  for (let index = 0; index < count; index += 1) {
    const actual = browser[index]!, expected = pal[index]!;
    const prefix = `${expected.label} tick ${expected.tick}`;
    exact(prefix, "tick", actual.tick, expected.tick, mismatches);
    nearVector(prefix, "camera.position", actual.position, expected.position, tolerance, mismatches);
    nearVector(prefix, "camera.target", actual.target, expected.target, tolerance, mismatches);
  }
  if (mismatches.length > 0) throw new DrivingValidationError(mismatches);
}

function compareObservation(
  browser: DrivingValidationObservation,
  pal: DrivingValidationObservation,
  tolerances: DrivingValidationTolerances,
  mismatches: string[],
): void {
  const prefix = `${pal.label} tick ${pal.tick}`;
  exact(prefix, "tick", browser.tick, pal.tick, mismatches);
  exact(prefix, "commands", browser.commands, pal.commands, mismatches);
  exact(prefix, "equipmentFlags", browser.equipmentFlags, pal.equipmentFlags, mismatches);
  exact(prefix, "vehicle.gear", browser.vehicle.gear, pal.vehicle.gear, mismatches);
  exact(prefix, "vehicle.equipmentBoostState", browser.vehicle.equipmentBoostState, pal.vehicle.equipmentBoostState, mismatches);
  exact(prefix, "contact.contactFlags", browser.contact.contactFlags, pal.contact.contactFlags, mismatches);
  exact(prefix, "contact.obstacleFlags", browser.contact.obstacleFlags, pal.contact.obstacleFlags, mismatches);

  nearVector(prefix, "pose.position", browser.pose.position, pal.pose.position, tolerances.position, mismatches);
  near(prefix, "pose.yaw", browser.pose.yaw, pal.pose.yaw, tolerances.yaw, mismatches);
  nearVector(prefix, "velocity", browser.velocity, pal.velocity, tolerances.velocity, mismatches);
  near(prefix, "vehicle.nativeSpeed", browser.vehicle.nativeSpeed, pal.vehicle.nativeSpeed, tolerances.velocity, mismatches);
  nearVector(prefix, "contact.support", browser.contact.support, pal.contact.support, tolerances.contact, mismatches);
  nearVector(prefix, "contact.impulses", browser.contact.impulses, pal.contact.impulses, tolerances.contact, mismatches);
  exactArray(prefix, "contact.surfaces", browser.contact.surfaces, pal.contact.surfaces, mismatches);
}

function exact(prefix: string, path: string, browser: number, pal: number, mismatches: string[]): void {
  if (browser !== pal) mismatches.push(`${prefix} ${path}: browser=${browser} PAL=${pal}`);
}

function near(
  prefix: string,
  path: string,
  browser: number,
  pal: number,
  tolerance: number,
  mismatches: string[],
): void {
  const delta = Math.abs(browser - pal);
  if (!Number.isFinite(browser) || !Number.isFinite(pal) || delta > tolerance) {
    mismatches.push(`${prefix} ${path}: browser=${browser} PAL=${pal} delta=${delta} tolerance=${tolerance}`);
  }
}

function nearVector(
  prefix: string,
  path: string,
  browser: DrivingValidationVector,
  pal: DrivingValidationVector,
  tolerance: number,
  mismatches: string[],
): void {
  for (let axis = 0; axis < 3; axis += 1) {
    near(prefix, `${path}[${axis}]`, browser[axis]!, pal[axis]!, tolerance, mismatches);
  }
}

function exactArray(
  prefix: string,
  path: string,
  browser: readonly number[],
  pal: readonly number[],
  mismatches: string[],
): void {
  if (browser.length !== pal.length) {
    mismatches.push(`${prefix} ${path}.length: browser=${browser.length} PAL=${pal.length}`);
    return;
  }
  for (let index = 0; index < browser.length; index += 1) {
    exact(prefix, `${path}[${index}]`, browser[index]!, pal[index]!, mismatches);
  }
}
