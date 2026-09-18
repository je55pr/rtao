import { StandardGamepadInput } from "./gamepadInput";
import { InputSettings, type InputBindingDevice } from "./inputSettings";

export const semanticActions = [
  "up",
  "down",
  "left",
  "right",
  "confirm",
  "interact",
  "cancel",
  "boost",
  "debug",
] as const;

export type SemanticAction = (typeof semanticActions)[number];
export const semanticAxes = ["driveThrottle", "driveSteering"] as const;
export type SemanticAxis = (typeof semanticAxes)[number];
export type SemanticActionPhase = "pressed" | "released";

export interface SemanticActionState {
  readonly held: boolean;
  readonly pressed: boolean;
  readonly released: boolean;
  readonly value: number;
}

export interface SemanticActionEvent {
  readonly action: SemanticAction;
  readonly phase: SemanticActionPhase;
  readonly repeat: boolean;
  consume(): void;
}
export interface KeyboardSemanticBinding {
  readonly action: SemanticAction;
  readonly axis?: SemanticAxis;
  readonly axisValue?: number;
}

const defaultInputSettings = new InputSettings();

export function keyboardSemanticBinding(
  code: string,
  settings: InputSettings = defaultInputSettings,
): KeyboardSemanticBinding | undefined {
  return settings.keyboardBinding(code);
}
type SourceValues = Map<string, number>;

interface EdgeState {
  pressed: boolean;
  released: boolean;
}

export class SemanticInputState {
  private readonly actionSources = new Map<SemanticAction, SourceValues>();
  private readonly axisSources = new Map<SemanticAxis, SourceValues>();
  private readonly edges = new Map<SemanticAction, EdgeState>();

  setActionSource(action: SemanticAction, source: string, value: number): void {
    const before = this.actionValue(action);
    this.setSourceValue(this.actionSources, action, source, clamp(value, 0, 1));
    const after = this.actionValue(action);
    const edge = this.edges.get(action) ?? { pressed: false, released: false };
    if (before === 0 && after > 0) edge.pressed = true;
    if (before > 0 && after === 0) edge.released = true;
    this.edges.set(action, edge);
  }

  setAxisSource(axis: SemanticAxis, source: string, value: number): void {
    this.setSourceValue(this.axisSources, axis, source, clamp(value, -1, 1));
  }

  action(action: SemanticAction): SemanticActionState {
    const value = this.actionValue(action);
    const edge = this.edges.get(action);
    return {
      held: value > 0,
      pressed: edge?.pressed ?? false,
      released: edge?.released ?? false,
      value,
    };
  }
  axis(axis: SemanticAxis): number {
    const sources = this.axisSources.get(axis);
    if (!sources) return 0;
    let value = 0;
    for (const sourceValue of sources.values()) value += sourceValue;
    return clamp(value, -1, 1);
  }

  clearTransitions(): void {
    this.edges.clear();
  }

  reset(): void {
    this.actionSources.clear();
    this.axisSources.clear();
    this.edges.clear();
  }

  private actionValue(action: SemanticAction): number {
    const sources = this.actionSources.get(action);
    if (!sources) return 0;
    let value = 0;
    for (const sourceValue of sources.values()) value = Math.max(value, sourceValue);
    return value;
  }

  private setSourceValue<Key extends string>(
    collection: Map<Key, SourceValues>,
    key: Key,
    source: string,
    value: number,
  ): void {
    let sources = collection.get(key);
    if (!sources && value !== 0) {
      sources = new Map();
      collection.set(key, sources);
    }
    if (!sources) return;
    if (value === 0) sources.delete(source);
    else sources.set(source, value);
    if (sources.size === 0) collection.delete(key);
  }
}

export class SemanticInputScope {
  private readonly blockedActions = new Set<SemanticAction>();
  private readonly blockedAxes = new Set<SemanticAxis>();

  constructor(private readonly state: SemanticInputState) {}

  reset(): void {
    this.blockedActions.clear();
    this.blockedAxes.clear();
    for (const action of semanticActions) {
      if (this.state.action(action).held) this.blockedActions.add(action);
    }
    for (const axis of semanticAxes) {
      if (this.state.axis(axis) !== 0) this.blockedAxes.add(axis);
    }
  }

  action(action: SemanticAction): SemanticActionState {
    const current = this.state.action(action);
    if (!this.blockedActions.has(action)) return current;
    if (!current.held) {
      this.blockedActions.delete(action);
      return current;
    }
    return { held: false, pressed: false, released: false, value: 0 };
  }

  axis(axis: SemanticAxis): number {
    const current = this.state.axis(axis);
    if (!this.blockedAxes.has(axis)) return current;
    if (current === 0) this.blockedAxes.delete(axis);
    return 0;
  }
}

type SemanticActionListener = (event: SemanticActionEvent) => void;

interface InputBindingCapture {
  readonly device: InputBindingDevice;
  readonly callback: (value: string | number) => void;
  readonly ignoredGamepadButtons: Set<number>;
}

export class BrowserSemanticInput {
  readonly state = new SemanticInputState();
  private readonly listeners = new Set<SemanticActionListener>();
  private readonly gamepadInput: StandardGamepadInput;
  private gamepadFrameHandle: number | undefined;
  private capture: InputBindingCapture | undefined;
  private readonly blockedGamepadButtons = new Set<number>();
  private started = false;

  constructor(
    private readonly target: Window = window,
    readonly settings = new InputSettings(),
  ) {
    this.gamepadInput = new StandardGamepadInput(
      this.state,
      (action, phase) => this.dispatch(action, phase, false),
      settings,
    );
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    this.target.addEventListener("keydown", this.keyDown);
    this.target.addEventListener("keyup", this.keyUp);
    this.target.addEventListener("gamepadconnected", this.gamepadChanged);
    this.target.addEventListener("gamepaddisconnected", this.gamepadChanged);
    this.syncGamepads();
    this.gamepadFrameHandle = this.target.requestAnimationFrame(this.pollGamepads);
  }

  stop(): void {
    if (!this.started) return;
    this.started = false;
    this.target.removeEventListener("keydown", this.keyDown);
    this.target.removeEventListener("keyup", this.keyUp);
    this.target.removeEventListener("gamepadconnected", this.gamepadChanged);
    this.target.removeEventListener("gamepaddisconnected", this.gamepadChanged);
    if (this.gamepadFrameHandle !== undefined) {
      this.target.cancelAnimationFrame(this.gamepadFrameHandle);
      this.gamepadFrameHandle = undefined;
    }
    this.gamepadInput.reset();
    this.state.reset();
  }

  reset(): void {
    this.gamepadInput.reset();
    this.state.reset();
  }

  beginBindingCapture(
    device: InputBindingDevice,
    callback: (value: string | number) => void,
  ): void {
    this.cancelBindingCapture();
    const ignoredGamepadButtons = new Set<number>();
    if (device === "gamepad") {
      for (const gamepad of this.currentStandardGamepads()) {
        gamepad.buttons.forEach((button, index) => {
          if (button.value >= 0.5 || button.pressed) ignoredGamepadButtons.add(index);
        });
      }
      this.gamepadInput.reset();
    }
    this.capture = { device, callback, ignoredGamepadButtons };
  }

  cancelBindingCapture(): void {
    this.capture = undefined;
  }

  subscribe(listener: SemanticActionListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  createScope(): SemanticInputScope {
    return new SemanticInputScope(this.state);
  }

  setAnalogAxis(source: string, axis: SemanticAxis, value: number): void {
    this.state.setAxisSource(axis, source, value);
  }

  private readonly pollGamepads = (): void => {
    if (!this.started) return;
    this.syncGamepads();
    this.gamepadFrameHandle = this.target.requestAnimationFrame(this.pollGamepads);
  };

  private readonly gamepadChanged = (): void => {
    if (this.started) this.syncGamepads();
  };

  private syncGamepads(): void {
    const gamepads = this.currentStandardGamepads();
    if (this.capture?.device === "gamepad") {
      const ignored = this.capture.ignoredGamepadButtons;
      for (const index of [...ignored]) {
        const stillHeld = gamepads.some((gamepad) => {
          const button = gamepad.buttons[index];
          return !!button && (button.value >= 0.5 || button.pressed);
        });
        if (!stillHeld) ignored.delete(index);
      }
      for (const gamepad of gamepads) {
        for (let index = 0; index < gamepad.buttons.length; index += 1) {
          const button = gamepad.buttons[index];
          if (!button || ignored.has(index)) continue;
          if (button.value >= 0.5 || button.pressed) {
            this.completeBindingCapture(index);
            return;
          }
        }
      }
      this.gamepadInput.reset();
      return;
    }

    if (this.blockedGamepadButtons.size > 0) {
      const blockedStillHeld = [...this.blockedGamepadButtons].some((index) =>
        gamepads.some((gamepad) => {
          const button = gamepad.buttons[index];
          return !!button && (button.value >= 0.5 || button.pressed);
        })
      );
      if (blockedStillHeld) {
        this.gamepadInput.reset();
        return;
      }
      this.blockedGamepadButtons.clear();
    }
    this.gamepadInput.poll(gamepads);
  }

  private currentStandardGamepads(): Gamepad[] {
    const getGamepads = this.target.navigator.getGamepads;
    if (typeof getGamepads !== "function") return [];
    return Array.from(getGamepads.call(this.target.navigator) ?? [])
      .filter((gamepad): gamepad is Gamepad =>
        !!gamepad && gamepad.connected && gamepad.mapping === "standard"
      );
  }

  private completeBindingCapture(value: string | number): void {
    const capture = this.capture;
    if (!capture) return;
    this.capture = undefined;
    if (typeof value === "number") this.blockedGamepadButtons.add(value);
    this.gamepadInput.reset();
    capture.callback(value);
  }

  private readonly keyDown = (event: KeyboardEvent): void => {
    if (this.capture?.device === "keyboard") {
      event.preventDefault();
      if (!event.repeat) this.completeBindingCapture(event.code);
      return;
    }
    const binding = keyboardSemanticBinding(event.code, this.settings);
    if (!binding) return;
    const wasHeld = this.state.action(binding.action).held;
    this.state.setActionSource(binding.action, event.code, 1);
    if (binding.axis && binding.axisValue !== undefined) {
      this.state.setAxisSource(binding.axis, event.code, binding.axisValue);
    }
    if (event.repeat || wasHeld) return;
    this.dispatch(binding.action, "pressed", false, event);
  };

  private readonly keyUp = (event: KeyboardEvent): void => {
    const binding = keyboardSemanticBinding(event.code, this.settings);
    if (!binding) return;
    const wasHeld = this.state.action(binding.action).held;
    this.state.setActionSource(binding.action, event.code, 0);
    if (binding.axis) this.state.setAxisSource(binding.axis, event.code, 0);
    if (wasHeld && !this.state.action(binding.action).held) {
      this.dispatch(binding.action, "released", false, event);
    }
  };

  private dispatch(action: SemanticAction, phase: SemanticActionPhase, repeat: boolean, sourceEvent?: Event): void {
    let consumed = false;
    const inputEvent: SemanticActionEvent = {
      action,
      phase,
      repeat,
      consume: () => {
        consumed = true;
        sourceEvent?.preventDefault();
      },
    };
    for (const listener of this.listeners) {
      listener(inputEvent);
      if (consumed) break;
    }
  }
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}
