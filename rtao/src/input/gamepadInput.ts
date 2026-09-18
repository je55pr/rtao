import type {
  SemanticAction,
  SemanticActionPhase,
  SemanticAxis,
  SemanticInputState,
} from "./semanticInput";

export const standardGamepadDeadzone = 0.18;
export const standardGamepadNavigationThreshold = 0.5;

export const standardGamepadMapping = {
  primaryButton: 0,
  cancelButton: 1,
  boostButton: 5,
  brakeButton: 6,
  throttleButton: 7,
  pauseButton: 9,
  dpadUpButton: 12,
  dpadDownButton: 13,
  dpadLeftButton: 14,
  dpadRightButton: 15,
  steeringAxis: 0,
  navigationAxis: 1,
} as const;

type ActionDispatch = (action: SemanticAction, phase: SemanticActionPhase) => void;

interface ActionSource {
  readonly action: SemanticAction;
  readonly source: string;
  readonly value: (gamepad: Gamepad) => number;
}

interface AxisSource {
  readonly axis: SemanticAxis;
  readonly source: string;
  readonly value: (gamepad: Gamepad) => number;
}

const buttonAction = (
  action: SemanticAction,
  source: string,
  button: number,
): ActionSource => ({
  action,
  source,
  value: (gamepad) => digitalButton(gamepad, button),
});

const stickAction = (
  action: SemanticAction,
  source: string,
  axis: number,
  direction: -1 | 1,
): ActionSource => ({
  action,
  source,
  value: (gamepad) => {
    const value = normalizeGamepadAxis(gamepad.axes[axis] ?? 0);
    return value * direction >= standardGamepadNavigationThreshold ? 1 : 0;
  },
});

const actionSources: readonly ActionSource[] = [
  buttonAction("interact", "gamepad:primary", standardGamepadMapping.primaryButton),
  buttonAction("cancel", "gamepad:cancel", standardGamepadMapping.cancelButton),
  buttonAction("cancel", "gamepad:pause", standardGamepadMapping.pauseButton),
  buttonAction("boost", "gamepad:boost", standardGamepadMapping.boostButton),
  buttonAction("up", "gamepad:dpad-up", standardGamepadMapping.dpadUpButton),
  buttonAction("down", "gamepad:dpad-down", standardGamepadMapping.dpadDownButton),
  buttonAction("left", "gamepad:dpad-left", standardGamepadMapping.dpadLeftButton),
  buttonAction("right", "gamepad:dpad-right", standardGamepadMapping.dpadRightButton),
  stickAction("up", "gamepad:stick-up", standardGamepadMapping.navigationAxis, -1),
  stickAction("down", "gamepad:stick-down", standardGamepadMapping.navigationAxis, 1),
  stickAction("left", "gamepad:stick-left", standardGamepadMapping.steeringAxis, -1),
  stickAction("right", "gamepad:stick-right", standardGamepadMapping.steeringAxis, 1),
];

const mappedActions = [
  "up",
  "down",
  "left",
  "right",
  "interact",
  "cancel",
  "boost",
] as const satisfies readonly SemanticAction[];

const axisSources: readonly AxisSource[] = [
  {
    axis: "driveSteering",
    source: "gamepad:steering",
    value: (gamepad) => normalizeGamepadAxis(
      gamepad.axes[standardGamepadMapping.steeringAxis] ?? 0,
    ),
  },
  {
    axis: "driveSteering",
    source: "gamepad:dpad-left",
    value: (gamepad) => -buttonValue(gamepad, standardGamepadMapping.dpadLeftButton),
  },
  {
    axis: "driveSteering",
    source: "gamepad:dpad-right",
    value: (gamepad) => buttonValue(gamepad, standardGamepadMapping.dpadRightButton),
  },
  {
    axis: "driveThrottle",
    source: "gamepad:throttle",
    value: (gamepad) => buttonValue(gamepad, standardGamepadMapping.throttleButton),
  },
  {
    axis: "driveThrottle",
    source: "gamepad:brake",
    value: (gamepad) => -buttonValue(gamepad, standardGamepadMapping.brakeButton),
  },
  {
    axis: "driveThrottle",
    source: "gamepad:dpad-up",
    value: (gamepad) => buttonValue(gamepad, standardGamepadMapping.dpadUpButton),
  },
  {
    axis: "driveThrottle",
    source: "gamepad:dpad-down",
    value: (gamepad) => -buttonValue(gamepad, standardGamepadMapping.dpadDownButton),
  },
];

export class StandardGamepadInput {
  private activeIndex: number | undefined;
  private activeId: string | undefined;

  constructor(
    private readonly state: SemanticInputState,
    private readonly dispatch: ActionDispatch,
  ) {}

  get activeGamepadIndex(): number | undefined {
    return this.activeIndex;
  }

  poll(gamepads: ArrayLike<Gamepad | null>): void {
    const gamepad = this.selectGamepad(gamepads);
    this.activeIndex = gamepad?.index;
    this.activeId = gamepad?.id;
    this.applyActionSources(gamepad, true);
    this.applyAxisSources(gamepad);
  }

  reset(): void {
    this.applyActionSources(undefined, false);
    this.applyAxisSources(undefined);
    this.activeIndex = undefined;
    this.activeId = undefined;
  }

  private selectGamepad(gamepads: ArrayLike<Gamepad | null>): Gamepad | undefined {
    const candidates: Gamepad[] = [];
    for (let index = 0; index < gamepads.length; index += 1) {
      const gamepad = gamepads[index];
      if (gamepad?.connected && gamepad.mapping === "standard") candidates.push(gamepad);
    }
    if (candidates.length === 0) return undefined;

    const current = candidates.find((gamepad) =>
      gamepad.index === this.activeIndex && gamepad.id === this.activeId
    );
    if (current) return current;

    if (this.activeId !== undefined) {
      const reindexed = candidates.find((gamepad) => gamepad.id === this.activeId);
      if (reindexed) return reindexed;
    }

    return candidates[0];
  }

  private applyActionSources(gamepad: Gamepad | undefined, emit: boolean): void {
    for (const action of mappedActions) {
      const relevant = actionSources.filter((source) => source.action === action);
      const desired = relevant.map((source) => ({
        source,
        value: gamepad ? source.value(gamepad) : 0,
      }));
      const wasHeld = this.state.action(action).held;

      // Add live aliases before removing stale ones so moving from stick to
      // D-pad (or across controller indices) never creates a false release/press.
      for (const entry of desired) {
        if (entry.value > 0) {
          this.state.setActionSource(action, entry.source.source, entry.value);
        }
      }
      for (const entry of desired) {
        if (entry.value === 0) {
          this.state.setActionSource(action, entry.source.source, 0);
        }
      }

      if (!emit) continue;
      const isHeld = this.state.action(action).held;
      if (!wasHeld && isHeld) this.dispatch(action, "pressed");
      else if (wasHeld && !isHeld) this.dispatch(action, "released");
    }
  }

  private applyAxisSources(gamepad: Gamepad | undefined): void {
    for (const source of axisSources) {
      this.state.setAxisSource(
        source.axis,
        source.source,
        gamepad ? source.value(gamepad) : 0,
      );
    }
  }
}

export function normalizeGamepadAxis(
  value: number,
  deadzone = standardGamepadDeadzone,
): number {
  const clamped = clamp(Number.isFinite(value) ? value : 0, -1, 1);
  const threshold = clamp(deadzone, 0, 0.99);
  const magnitude = Math.abs(clamped);
  if (magnitude <= threshold) return 0;
  return Math.sign(clamped) * ((magnitude - threshold) / (1 - threshold));
}

function digitalButton(gamepad: Gamepad, index: number): number {
  return buttonValue(gamepad, index) >= 0.5 ? 1 : 0;
}

function buttonValue(gamepad: Gamepad, index: number): number {
  const button = gamepad.buttons[index];
  if (!button) return 0;
  const value = Number.isFinite(button.value)
    ? button.value
    : button.pressed
      ? 1
      : 0;
  return clamp(value, 0, 1);
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}
