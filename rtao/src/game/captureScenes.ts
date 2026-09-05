import type { OutdoorVisibilityMode } from "./fieldLighting";

export interface CaptureSize {
  readonly width: number;
  readonly height: number;
}

interface OutdoorCaptureState {
  /** HG2 outdoor clock units; 9,000 units = one in-game hour. Defaults to noon. */
  readonly timeOfDayUnits?: number;
  /** Browser-port visibility policy. Defaults to extended. */
  readonly visibilityMode?: OutdoorVisibilityMode;
}

export interface WorldOverviewCaptureScene extends OutdoorCaptureState {
  readonly id: string;
  readonly label: string;
  readonly kind: "world-overview";
  readonly size: CaptureSize;
}

export interface CaptureCameraPose {
  /** Field-local render coordinates after that field becomes the capture origin. */
  readonly position: readonly [number, number, number];
  readonly target: readonly [number, number, number];
}

export interface FieldOverviewCaptureScene extends OutdoorCaptureState {
  readonly id: string;
  readonly label: string;
  readonly kind: "field-overview";
  readonly fieldNumber: number;
  readonly size: CaptureSize;
  readonly camera?: CaptureCameraPose;
}

export interface CarVisualCaptureScene extends OutdoorCaptureState {
  readonly id: string;
  readonly label: string;
  readonly kind: "car-visual";
  readonly fieldNumber: number;
  readonly size: CaptureSize;
  readonly camera: CaptureCameraPose;
  readonly vehicle: {
    /** Field-local render coordinates for the deterministic vehicle pose. */
    readonly position: readonly [number, number, number];
    readonly yaw: number;
    readonly pitch?: number;
    readonly roll?: number;
  };
}

export interface QFactoryCaptureScene {
  readonly id: string;
  readonly label: string;
  readonly kind: "qfactory";
  /** Fixed animation phase used for deterministic platform rotation. */
  readonly animationTimeMs: number;
  readonly size: CaptureSize;
}

export type CaptureScene = WorldOverviewCaptureScene | FieldOverviewCaptureScene | CarVisualCaptureScene | QFactoryCaptureScene;

const comparisonSize = { width: 1280, height: 960 } as const;

/**
 * Small canonical catalogue used by URL-driven visual regression captures.
 * Keep entries boring and stable: comparison value comes from reproducing the
 * same state/camera, not from finding a prettier angle on every run.
 */
export const captureScenes: readonly CaptureScene[] = [
  { id: "world", label: "Whole world", kind: "world-overview", size: comparisonSize },
  {
    id: "peach",
    label: "Peach Town",
    kind: "field-overview",
    fieldNumber: 223,
    size: comparisonSize,
    // FLD/223 contains a large rural apron. The generic field-centre overview
    // pushes the actual town against the right edge, so pin this comparison
    // view around the normal Q62/Peach activity area instead.
    camera: { position: [1500, 320, 960], target: [1150, 55, 610] },
  },
  { id: "fuji", label: "Fuji City", kind: "field-overview", fieldNumber: 113, size: comparisonSize },
  { id: "white-mountain", label: "White Mountain", kind: "field-overview", fieldNumber: 203, size: comparisonSize },
  { id: "papaya", label: "Papaya Island", kind: "field-overview", fieldNumber: 233, size: comparisonSize },
  {
    id: "peach-day-ground",
    label: "Peach Town — 12:00 authentic",
    kind: "field-overview",
    fieldNumber: 223,
    size: comparisonSize,
    timeOfDayUnits: 12 * 9000,
    visibilityMode: "authentic",
    camera: { position: [1335, 92, 820], target: [1125, 56, 620] },
  },
  {
    id: "peach-night-ground",
    label: "Peach Town — 22:00 authentic",
    kind: "field-overview",
    fieldNumber: 223,
    size: comparisonSize,
    timeOfDayUnits: 22 * 9000,
    visibilityMode: "authentic",
    camera: { position: [1335, 92, 820], target: [1125, 56, 620] },
  },
  {
    id: "peach-night-ground-extended",
    label: "Peach Town — 22:00 extended",
    kind: "field-overview",
    fieldNumber: 223,
    size: comparisonSize,
    timeOfDayUnits: 22 * 9000,
    visibilityMode: "extended",
    camera: { position: [1335, 92, 820], target: [1125, 56, 620] },
  },
  {
    id: "peach-sunset-ground",
    label: "Peach Town — 17:30 authentic",
    kind: "field-overview",
    fieldNumber: 223,
    size: comparisonSize,
    timeOfDayUnits: 17.5 * 9000,
    visibilityMode: "authentic",
    camera: { position: [1335, 92, 820], target: [1125, 56, 620] },
  },
  {
    id: "fuji-day-ground",
    label: "Fuji Castle — 12:00 authentic",
    kind: "field-overview",
    fieldNumber: 113,
    size: comparisonSize,
    timeOfDayUnits: 12 * 9000,
    visibilityMode: "authentic",
    camera: { position: [1040, 130, 1010], target: [825, 86, 790] },
  },
  {
    id: "fuji-night-ground",
    label: "Fuji Castle — 22:00 authentic",
    kind: "field-overview",
    fieldNumber: 113,
    size: comparisonSize,
    timeOfDayUnits: 22 * 9000,
    visibilityMode: "authentic",
    camera: { position: [1040, 130, 1010], target: [825, 86, 790] },
  },
  {
    id: "fuji-night-ground-extended",
    label: "Fuji Castle — 22:00 extended",
    kind: "field-overview",
    fieldNumber: 113,
    size: comparisonSize,
    timeOfDayUnits: 22 * 9000,
    visibilityMode: "extended",
    camera: { position: [1040, 130, 1010], target: [825, 86, 790] },
  },
  {
    id: "bridge-day",
    label: "Peach–Fuji bridge — 12:00 authentic",
    kind: "field-overview",
    fieldNumber: 220,
    size: comparisonSize,
    timeOfDayUnits: 12 * 9000,
    visibilityMode: "authentic",
    // The recovered deep-night memory-20 profile fades ordinary geometry by
    // 300 m, so the old high field-overview camera ceased to be a meaningful
    // night regression. Pin the comparison camera on the bridge itself and
    // look toward the authored tower/corona cluster around z=765.
    camera: { position: [1390, 58, 500], target: [1390, 88, 765] },
  },
  {
    id: "bridge-night",
    label: "Peach–Fuji bridge — 22:00 authentic",
    kind: "field-overview",
    fieldNumber: 220,
    size: comparisonSize,
    timeOfDayUnits: 22 * 9000,
    visibilityMode: "authentic",
    camera: { position: [1390, 58, 500], target: [1390, 88, 765] },
  },

  {
    id: "car-peach-day",
    label: "Q62 visual check — Peach 12:00",
    kind: "car-visual",
    fieldNumber: 223,
    size: comparisonSize,
    timeOfDayUnits: 12 * 9000,
    visibilityMode: "authentic",
    vehicle: { position: [1152, 31, 555], yaw: -0.1 },
    camera: { position: [1148.35, 33.25, 559.85], target: [1152, 31.8, 555] },
  },
  {
    id: "car-peach-sunset",
    label: "Q62 visual check — Peach 17:30",
    kind: "car-visual",
    fieldNumber: 223,
    size: comparisonSize,
    timeOfDayUnits: 17.5 * 9000,
    visibilityMode: "authentic",
    vehicle: { position: [1152, 31, 555], yaw: -0.1 },
    camera: { position: [1148.35, 33.25, 559.85], target: [1152, 31.8, 555] },
  },
  {
    id: "car-peach-night",
    label: "Q62 visual check — Peach 22:00",
    kind: "car-visual",
    fieldNumber: 223,
    size: comparisonSize,
    timeOfDayUnits: 22 * 9000,
    visibilityMode: "authentic",
    vehicle: { position: [1152, 31, 555], yaw: -0.1 },
    camera: { position: [1148.35, 33.25, 559.85], target: [1152, 31.8, 555] },
  },

  {
    id: "car-peach-day-rear",
    label: "Q62 visual check — Peach 12:00 rear",
    kind: "car-visual",
    fieldNumber: 223,
    size: comparisonSize,
    timeOfDayUnits: 12 * 9000,
    visibilityMode: "authentic",
    vehicle: { position: [1152, 31, 555], yaw: -0.1 },
    camera: { position: [1155.9, 33.25, 550.2], target: [1152, 31.8, 555] },
  },
  {
    id: "car-peach-sunset-rear",
    label: "Q62 visual check — Peach 17:30 rear",
    kind: "car-visual",
    fieldNumber: 223,
    size: comparisonSize,
    timeOfDayUnits: 17.5 * 9000,
    visibilityMode: "authentic",
    vehicle: { position: [1152, 31, 555], yaw: -0.1 },
    camera: { position: [1155.9, 33.25, 550.2], target: [1152, 31.8, 555] },
  },
  {
    id: "car-peach-night-rear",
    label: "Q62 visual check — Peach 22:00 rear",
    kind: "car-visual",
    fieldNumber: 223,
    size: comparisonSize,
    timeOfDayUnits: 22 * 9000,
    visibilityMode: "authentic",
    vehicle: { position: [1152, 31, 555], yaw: -0.1 },
    camera: { position: [1155.9, 33.25, 550.2], target: [1152, 31.8, 555] },
  },
  { id: "qfactory", label: "Q's Factory", kind: "qfactory", animationTimeMs: 0, size: comparisonSize },
] as const;

const scenesById = new Map(captureScenes.map((scene) => [scene.id, scene]));

export function captureSceneById(id: string | null | undefined): CaptureScene | undefined {
  if (!id) return undefined;
  return scenesById.get(id.trim().toLowerCase());
}

export function captureSceneFromSearch(search: string): CaptureScene | undefined {
  return captureSceneById(new URLSearchParams(search).get("capture"));
}

export function captureFilename(scene: CaptureScene): string {
  return `rta-${scene.id}-${scene.size.width}x${scene.size.height}.png`;
}
