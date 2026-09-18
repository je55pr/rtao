import { describe, expect, it } from "vitest";
import {
  normalizeGamepadAxis,
  StandardGamepadInput,
  standardGamepadDeadzone,
} from "./gamepadInput";
import { InputSettings } from "./inputSettings";
import {
  type SemanticAction,
  type SemanticActionPhase,
  SemanticInputState,
} from "./semanticInput";

type RecordedEvent = readonly [SemanticAction, SemanticActionPhase];

function syntheticGamepad(options: {
  readonly id?: string;
  readonly index?: number;
  readonly mapping?: GamepadMappingType;
  readonly axes?: readonly number[];
  readonly buttons?: Readonly<Record<number, number>>;
} = {}): Gamepad {
  const buttons = Array.from({ length: 17 }, (_, index): GamepadButton => {
    const value = options.buttons?.[index] ?? 0;
    return { pressed: value >= 0.5, touched: value > 0, value };
  });
  return {
    axes: [...(options.axes ?? [0, 0, 0, 0])],
    buttons,
    connected: true,
    id: options.id ?? "Synthetic standard controller",
    index: options.index ?? 0,
    mapping: options.mapping ?? "standard",
    timestamp: 0,
  } as unknown as Gamepad;
}

function harness(): {
  readonly state: SemanticInputState;
  readonly events: RecordedEvent[];
  readonly input: StandardGamepadInput;
} {
  const state = new SemanticInputState();
  const events: RecordedEvent[] = [];
  return {
    state,
    events,
    input: new StandardGamepadInput(
      state,
      (action, phase) => events.push([action, phase]),
    ),
  };
}

describe("normalizeGamepadAxis", () => {
  it("removes the stick deadzone and rescales the remaining range", () => {
    expect(normalizeGamepadAxis(standardGamepadDeadzone)).toBe(0);
    expect(normalizeGamepadAxis(-standardGamepadDeadzone)).toBe(0);
    expect(normalizeGamepadAxis(0.59)).toBeCloseTo(0.5);
    expect(normalizeGamepadAxis(-1)).toBe(-1);
    expect(normalizeGamepadAxis(Number.NaN)).toBe(0);
  });
});

describe("StandardGamepadInput", () => {
  it("maps the standard controller to semantic navigation and analogue driving", () => {
    const { state, events, input } = harness();
    input.poll([
      syntheticGamepad({
        axes: [0.6, 0],
        buttons: { 0: 1, 5: 1, 6: 0.25, 7: 0.75 },
      }),
    ]);

    expect(state.action("interact").held).toBe(true);
    expect(state.action("boost").held).toBe(true);
    expect(state.action("right").held).toBe(true);
    expect(state.axis("driveSteering")).toBeCloseTo(
      normalizeGamepadAxis(0.6),
    );
    expect(state.axis("driveThrottle")).toBeCloseTo(0.5);
    expect(events).toEqual([
      ["right", "pressed"],
      ["interact", "pressed"],
      ["boost", "pressed"],
    ]);
  });

  it("does not duplicate a direction when control moves between stick and D-pad", () => {
    const { state, events, input } = harness();

    input.poll([syntheticGamepad({ axes: [0, -0.8] })]);
    expect(events).toEqual([["up", "pressed"]]);

    events.length = 0;
    input.poll([syntheticGamepad({ axes: [0, 0], buttons: { 12: 1 } })]);
    expect(state.action("up").held).toBe(true);
    expect(events).toEqual([]);

    input.poll([syntheticGamepad()]);
    expect(state.action("up").held).toBe(false);
    expect(events).toEqual([["up", "released"]]);
  });

  it("follows the same standard controller across browser index changes", () => {
    const { state, events, input } = harness();
    const first = syntheticGamepad({
      id: "Same controller",
      index: 0,
      buttons: { 0: 1, 7: 0.7 },
    });
    input.poll([first]);
    expect(input.activeGamepadIndex).toBe(0);
    expect(events).toEqual([["interact", "pressed"]]);

    events.length = 0;
    const moved = syntheticGamepad({
      id: "Same controller",
      index: 3,
      buttons: { 0: 1, 7: 0.7 },
    });
    input.poll([null, null, null, moved]);
    expect(input.activeGamepadIndex).toBe(3);
    expect(state.axis("driveThrottle")).toBeCloseTo(0.7);
    expect(events).toEqual([]);

    input.poll([]);
    expect(input.activeGamepadIndex).toBeUndefined();
    expect(state.action("interact").held).toBe(false);
    expect(state.axis("driveThrottle")).toBe(0);
    expect(events).toEqual([["interact", "released"]]);
  });

  it("leaves keyboard sources intact when a controller disconnects", () => {
    const { state, events, input } = harness();
    state.setActionSource("up", "KeyW", 1);
    state.setAxisSource("driveThrottle", "KeyW", 1);

    input.poll([
      syntheticGamepad({ buttons: { 12: 1, 7: 1 } }),
    ]);
    expect(state.action("up").held).toBe(true);
    expect(state.axis("driveThrottle")).toBe(1);
    expect(events).toEqual([]);

    input.poll([]);
    expect(state.action("up").held).toBe(true);
    expect(state.axis("driveThrottle")).toBe(1);
    expect(events).toEqual([]);
  });

  it("ignores pads without the browser standard mapping", () => {
    const { state, input } = harness();
    input.poll([
      syntheticGamepad({
        mapping: "",
        axes: [1, -1],
        buttons: { 0: 1, 7: 1 },
      }),
    ]);

    expect(input.activeGamepadIndex).toBeUndefined();
    expect(state.action("interact").held).toBe(false);
    expect(state.axis("driveThrottle")).toBe(0);
    expect(state.axis("driveSteering")).toBe(0);
  });

  it("uses edited gamepad button bindings without changing analogue sources", () => {
    const state = new SemanticInputState();
    const events: RecordedEvent[] = [];
    const settings = new InputSettings();
    expect(settings.rebind("gamepad", "interact", 4).status).toBe("applied");
    const input = new StandardGamepadInput(
      state,
      (action, phase) => events.push([action, phase]),
      settings,
    );

    input.poll([syntheticGamepad({ buttons: { 4: 1, 7: 0.75 } })]);

    expect(state.action("interact").held).toBe(true);
    expect(state.axis("driveThrottle")).toBeCloseTo(0.75);
    expect(events).toEqual([["interact", "pressed"]]);
  });
});
