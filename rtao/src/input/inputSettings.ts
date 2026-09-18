import type { SemanticAction, SemanticAxis } from "./semanticInput";

export type InputBindingDevice = "keyboard" | "gamepad";
export type InputConflictResolution = "reject" | "replace";

export interface InputBindingProfile {
  readonly version: 1;
  readonly keyboard: Readonly<Record<SemanticAction, readonly string[]>>;
  readonly gamepad: Readonly<Record<SemanticAction, readonly number[]>>;
}

export interface ResolvedInputBinding {
  readonly action: SemanticAction;
  readonly axis?: SemanticAxis;
  readonly axisValue?: number;
}

export interface InputBindingConflict {
  readonly action: SemanticAction;
  readonly device: InputBindingDevice;
}

export type RebindResult =
  | { readonly status: "applied"; readonly conflicts: readonly InputBindingConflict[] }
  | { readonly status: "conflict"; readonly conflicts: readonly InputBindingConflict[] }
  | { readonly status: "unsafe"; readonly reason: string };

export interface InputSettingsStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const inputSettingsStorageKey = "rtao.input-settings.v1";

const actions = [
  "up", "down", "left", "right", "confirm",
  "interact", "cancel", "boost", "debug",
] as const satisfies readonly SemanticAction[];

const defaultProfile: InputBindingProfile = {
  version: 1,
  keyboard: {
    up: ["KeyW", "ArrowUp"],
    down: ["KeyS", "ArrowDown"],
    left: ["KeyA", "ArrowLeft"],
    right: ["KeyD", "ArrowRight"],
    confirm: ["Enter", "Space"],
    interact: ["KeyE"],
    cancel: ["Escape"],
    boost: ["ShiftLeft", "ShiftRight"],
    debug: ["F3"],
  },
  gamepad: {
    up: [12],
    down: [13],
    left: [14],
    right: [15],
    confirm: [],
    interact: [0],
    cancel: [1, 9],
    boost: [5],
    debug: [],
  },
};

const directionalAxes: Partial<Record<SemanticAction, readonly [SemanticAxis, number]>> = {
  up: ["driveThrottle", 1],
  down: ["driveThrottle", -1],
  left: ["driveSteering", -1],
  right: ["driveSteering", 1],
};

type MutableProfile = {
  version: 1;
  keyboard: Record<SemanticAction, string[]>;
  gamepad: Record<SemanticAction, number[]>;
};

function cloneProfile(profile: InputBindingProfile): MutableProfile {
  return {
    version: 1,
    keyboard: Object.fromEntries(actions.map((action) => [action, [...profile.keyboard[action]]])) as MutableProfile["keyboard"],
    gamepad: Object.fromEntries(actions.map((action) => [action, [...profile.gamepad[action]]])) as MutableProfile["gamepad"],
  };
}

function hasSafeRoutes(profile: InputBindingProfile, device: InputBindingDevice): boolean {
  const bindings = profile[device];
  const confirmLike = bindings.confirm.length + bindings.interact.length;
  return confirmLike > 0 && bindings.cancel.length > 0;
}

function findConflicts(
  profile: InputBindingProfile,
  device: InputBindingDevice,
  action: SemanticAction,
  value: string | number,
): InputBindingConflict[] {
  const conflicts: InputBindingConflict[] = [];
  for (const candidate of actions) {
    if (candidate === action) continue;
    const values = profile[device][candidate] as readonly (string | number)[];
    if (values.includes(value)) conflicts.push({ action: candidate, device });
  }
  return conflicts;
}

function validatedProfile(raw: unknown): MutableProfile | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const candidate = raw as Partial<InputBindingProfile>;
  if (candidate.version !== 1 || !candidate.keyboard || !candidate.gamepad) return undefined;
  const profile = cloneProfile(defaultProfile);
  for (const action of actions) {
    const keyboard = candidate.keyboard[action];
    const gamepad = candidate.gamepad[action];
    if (!Array.isArray(keyboard) || !keyboard.every((value) => typeof value === "string" && value.length > 0)) return undefined;
    if (!Array.isArray(gamepad) || !gamepad.every((value) => Number.isInteger(value) && value >= 0 && value <= 31)) return undefined;
    profile.keyboard[action] = [...new Set(keyboard)];
    profile.gamepad[action] = [...new Set(gamepad)];
  }
  for (const device of ["keyboard", "gamepad"] as const) {
    const seen = new Set<string | number>();
    for (const action of actions) {
      for (const value of profile[device][action]) {
        if (seen.has(value)) return undefined;
        seen.add(value);
      }
    }
    if (!hasSafeRoutes(profile, device)) return undefined;
  }
  return profile;
}

export class InputSettings {
  private profileState: MutableProfile;
  private readonly listeners = new Set<() => void>();

  constructor(
    private readonly storage?: InputSettingsStorage,
    private readonly storageKey = inputSettingsStorageKey,
  ) {
    this.profileState = this.load();
  }

  get profile(): InputBindingProfile {
    return this.profileState;
  }

  keyboardBinding(code: string): ResolvedInputBinding | undefined {
    for (const action of actions) {
      if (!this.profileState.keyboard[action].includes(code)) continue;
      const axis = directionalAxes[action];
      return axis
        ? { action, axis: axis[0], axisValue: axis[1] }
        : { action };
    }
    return undefined;
  }

  gamepadButtons(action: SemanticAction): readonly number[] {
    return this.profileState.gamepad[action];
  }

  bindings(device: InputBindingDevice, action: SemanticAction): readonly (string | number)[] {
    return this.profileState[device][action];
  }

  rebind(
    device: "keyboard",
    action: SemanticAction,
    value: string,
    resolution?: InputConflictResolution,
  ): RebindResult;
  rebind(
    device: "gamepad",
    action: SemanticAction,
    value: number,
    resolution?: InputConflictResolution,
  ): RebindResult;
  rebind(
    device: InputBindingDevice,
    action: SemanticAction,
    value: string | number,
    resolution: InputConflictResolution = "reject",
  ): RebindResult {
    if (device === "keyboard" && (typeof value !== "string" || value.length === 0)) {
      return { status: "unsafe", reason: "Choose a keyboard key." };
    }
    if (device === "gamepad" && (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > 31)) {
      return { status: "unsafe", reason: "Choose a standard gamepad button." };
    }

    const conflicts = findConflicts(this.profileState, device, action, value);
    if (conflicts.length > 0 && resolution === "reject") return { status: "conflict", conflicts };

    const next = cloneProfile(this.profileState);
    for (const conflict of conflicts) {
      const values = next[device][conflict.action] as (string | number)[];
      next[device][conflict.action] = values.filter((candidate) => candidate !== value) as never;
    }
    next[device][action] = [value] as never;
    if (!hasSafeRoutes(next, device)) {
      return {
        status: "unsafe",
        reason: device === "keyboard"
          ? "Keyboard settings must keep both a confirm/talk key and a back key."
          : "Gamepad settings must keep both a confirm/talk button and a back button.",
      };
    }

    this.profileState = next;
    this.persist();
    this.notify();
    return { status: "applied", conflicts };
  }

  restoreDefaults(): void {
    this.profileState = cloneProfile(defaultProfile);
    this.persist();
    this.notify();
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private load(): MutableProfile {
    if (!this.storage) return cloneProfile(defaultProfile);
    try {
      const text = this.storage.getItem(this.storageKey);
      if (!text) return cloneProfile(defaultProfile);
      return validatedProfile(JSON.parse(text)) ?? cloneProfile(defaultProfile);
    } catch {
      return cloneProfile(defaultProfile);
    }
  }

  private persist(): void {
    if (!this.storage) return;
    try {
      this.storage.setItem(this.storageKey, JSON.stringify(this.profileState));
    } catch {
      // Host settings are best-effort; gameplay state must not depend on storage availability.
    }
  }

  private notify(): void {
    for (const listener of this.listeners) listener();
  }
}

export function defaultInputBindingProfile(): InputBindingProfile {
  return cloneProfile(defaultProfile);
}

export function keyboardBindingLabel(code: string): string {
  const named: Record<string, string> = {
    ArrowUp: "↑",
    ArrowDown: "↓",
    ArrowLeft: "←",
    ArrowRight: "→",
    Enter: "Enter",
    Space: "Space",
    Escape: "Esc",
    ShiftLeft: "Left Shift",
    ShiftRight: "Right Shift",
  };
  if (named[code]) return named[code];
  if (code.startsWith("Key") && code.length === 4) return code.slice(3);
  if (code.startsWith("Digit") && code.length === 6) return code.slice(5);
  return code;
}

export function gamepadButtonLabel(index: number): string {
  const named: Record<number, string> = {
    0: "Primary",
    1: "Cancel",
    5: "Right bumper",
    6: "Left trigger",
    7: "Right trigger",
    9: "Menu",
    12: "D-pad ↑",
    13: "D-pad ↓",
    14: "D-pad ←",
    15: "D-pad →",
  };
  return named[index] ?? `Button ${index}`;
}

export function actionBindingLabel(settings: InputSettings, action: SemanticAction): string {
  const gamepad = settings.gamepadButtons(action).map(gamepadButtonLabel);
  const keyboard = settings.profile.keyboard[action].map(keyboardBindingLabel);
  return [...gamepad, ...keyboard].join(" · ") || "Unbound";
}
