import { describe, expect, it } from "vitest";
import { InputSettings } from "./inputSettings";
import {
  BrowserSemanticInput,
  keyboardSemanticBinding,
  SemanticInputScope,
  SemanticInputState,
} from "./semanticInput";

describe("keyboardSemanticBinding", () => {
  it("preserves the existing keyboard aliases while exposing semantic actions", () => {
    expect(keyboardSemanticBinding("KeyW")).toEqual({
      action: "up",
      axis: "driveThrottle",
      axisValue: 1,
    });
    expect(keyboardSemanticBinding("ArrowDown")).toEqual({
      action: "down",
      axis: "driveThrottle",
      axisValue: -1,
    });
    expect(keyboardSemanticBinding("KeyA")).toEqual({
      action: "left",
      axis: "driveSteering",
      axisValue: -1,
    });
    expect(keyboardSemanticBinding("ArrowRight")).toEqual({
      action: "right",
      axis: "driveSteering",
      axisValue: 1,
    });
  });
  it("keeps free-roam interaction distinct from generic confirm", () => {
    expect(keyboardSemanticBinding("KeyE")?.action).toBe("interact");
    expect(keyboardSemanticBinding("Enter")?.action).toBe("confirm");
    expect(keyboardSemanticBinding("Space")?.action).toBe("confirm");
    expect(keyboardSemanticBinding("Escape")?.action).toBe("cancel");
    expect(keyboardSemanticBinding("ShiftLeft")?.action).toBe("boost");
    expect(keyboardSemanticBinding("ShiftRight")?.action).toBe("boost");
    expect(keyboardSemanticBinding("F3")?.action).toBe("debug");
    expect(keyboardSemanticBinding("KeyQ")).toBeUndefined();
  });
});

describe("SemanticInputState", () => {
  it("tracks aggregate held, pressed and released state across aliases", () => {
    const input = new SemanticInputState();
    input.setActionSource("up", "KeyW", 1);
    expect(input.action("up")).toEqual({
      held: true,
      pressed: true,
      released: false,
      value: 1,
    });

    input.clearTransitions();
    input.setActionSource("up", "ArrowUp", 1);
    input.setActionSource("up", "KeyW", 0);
    expect(input.action("up")).toEqual({
      held: true,
      pressed: false,
      released: false,
      value: 1,
    });

    input.setActionSource("up", "ArrowUp", 0);
    expect(input.action("up")).toEqual({
      held: false,
      pressed: false,
      released: true,
      value: 0,
    });
  });

  it("combines digital aliases without doubling and cancels opposing drive directions", () => {
    const input = new SemanticInputState();
    input.setAxisSource("driveThrottle", "KeyW", 1);
    input.setAxisSource("driveThrottle", "ArrowUp", 1);
    expect(input.axis("driveThrottle")).toBe(1);

    input.setAxisSource("driveThrottle", "KeyS", -1);
    input.setAxisSource("driveThrottle", "ArrowUp", 0);
    expect(input.axis("driveThrottle")).toBe(0);
  });

  it("preserves analogue drive values and clamps mixed sources", () => {
    const input = new SemanticInputState();
    input.setAxisSource("driveSteering", "pad-left-stick", 0.375);
    expect(input.axis("driveSteering")).toBe(0.375);

    input.setAxisSource("driveSteering", "KeyD", 1);
    expect(input.axis("driveSteering")).toBe(1);
    input.setAxisSource("driveSteering", "KeyD", 0);
    input.setAxisSource("driveSteering", "pad-left-stick", -1.5);
    expect(input.axis("driveSteering")).toBe(-1);
  });

  it("scopes suppress controls that were already held until they return to neutral", () => {
    const input = new SemanticInputState();
    input.setActionSource("boost", "ShiftLeft", 1);
    input.setAxisSource("driveThrottle", "KeyW", 1);
    const scope = new SemanticInputScope(input);
    scope.reset();

    expect(scope.action("boost").held).toBe(false);
    expect(scope.axis("driveThrottle")).toBe(0);
    input.setActionSource("boost", "ShiftLeft", 0);
    input.setAxisSource("driveThrottle", "KeyW", 0);
    expect(scope.action("boost").held).toBe(false);
    expect(scope.axis("driveThrottle")).toBe(0);

    input.setActionSource("boost", "ShiftLeft", 1);
    input.setAxisSource("driveThrottle", "KeyW", 1);
    expect(scope.action("boost").held).toBe(true);
    expect(scope.axis("driveThrottle")).toBe(1);
  });

  it("reset drops held inputs without manufacturing release edges", () => {
    const input = new SemanticInputState();
    input.setActionSource("boost", "ShiftLeft", 1);
    input.setAxisSource("driveThrottle", "KeyW", 1);
    input.reset();

    expect(input.action("boost")).toEqual({
      held: false,
      pressed: false,
      released: false,
      value: 0,
    });
    expect(input.axis("driveThrottle")).toBe(0);
  });
});

function fakeBrowserTarget(initialGamepads: readonly Gamepad[]) {
  let gamepads = [...initialGamepads];
  const listeners = new Map<string, Set<EventListenerOrEventListenerObject>>();
  const target = {
    navigator: { getGamepads: () => gamepads },
    addEventListener: (type: string, listener: EventListenerOrEventListenerObject) => {
      const bucket = listeners.get(type) ?? new Set();
      bucket.add(listener);
      listeners.set(type, bucket);
    },
    removeEventListener: (type: string, listener: EventListenerOrEventListenerObject) => {
      listeners.get(type)?.delete(listener);
    },
    requestAnimationFrame: () => 1,
    cancelAnimationFrame: () => undefined,
  } as unknown as Window;

  return {
    target,
    setGamepads: (next: readonly Gamepad[]) => { gamepads = [...next]; },
    emit: (type: string, event: Event) => {
      for (const listener of listeners.get(type) ?? []) {
        if (typeof listener === "function") listener(event);
        else listener.handleEvent(event);
      }
    },
  };
}

function pressedButtonGamepad(buttonIndex: number): Gamepad {
  return {
    axes: [0, 0, 0, 0],
    buttons: Array.from({ length: 17 }, (_, index): GamepadButton => ({
      pressed: index === buttonIndex,
      touched: index === buttonIndex,
      value: index === buttonIndex ? 1 : 0,
    })),
    connected: true,
    id: "Synthetic controller",
    index: 0,
    mapping: "standard",
    timestamp: 0,
  } as unknown as Gamepad;
}

function heldUpGamepad(): Gamepad {
  return pressedButtonGamepad(12);
}

describe("BrowserSemanticInput source aggregation", () => {
  it("stops later semantic listeners when a gamepad action is consumed", () => {
    const browser = fakeBrowserTarget([heldUpGamepad()]);
    const input = new BrowserSemanticInput(browser.target);
    const events: string[] = [];
    input.subscribe((event) => {
      events.push(`owner:${event.action}:${event.phase}`);
      event.consume();
    });
    input.subscribe((event) => events.push(`leaked:${event.action}:${event.phase}`));

    input.start();

    expect(events).toEqual(["owner:up:pressed"]);
    input.stop();
  });

  it("does not duplicate edges when keyboard and gamepad overlap", () => {
    const browser = fakeBrowserTarget([heldUpGamepad()]);
    const input = new BrowserSemanticInput(browser.target);
    const events: string[] = [];
    input.subscribe((event) => events.push(`${event.action}:${event.phase}`));
    input.start();

    expect(events).toEqual(["up:pressed"]);
    events.length = 0;
    browser.emit("keydown", {
      code: "ArrowUp",
      repeat: false,
      preventDefault: () => undefined,
    } as unknown as Event);
    expect(events).toEqual([]);

    browser.setGamepads([]);
    browser.emit("gamepaddisconnected", {} as Event);
    expect(input.state.action("up").held).toBe(true);
    expect(events).toEqual([]);

    browser.emit("keyup", {
      code: "ArrowUp",
      repeat: false,
      preventDefault: () => undefined,
    } as unknown as Event);
    expect(input.state.action("up").held).toBe(false);
    expect(events).toEqual(["up:released"]);

    input.stop();
  });

  it("uses edited keyboard bindings for browser events", () => {
    const browser = fakeBrowserTarget([]);
    const settings = new InputSettings();
    expect(settings.rebind("keyboard", "interact", "KeyQ").status).toBe("applied");
    const input = new BrowserSemanticInput(browser.target, settings);
    const events: string[] = [];
    input.subscribe((event) => events.push(`${event.action}:${event.phase}`));
    input.start();

    browser.emit("keydown", {
      code: "KeyQ",
      repeat: false,
      preventDefault: () => undefined,
    } as unknown as Event);

    expect(input.state.action("interact").held).toBe(true);
    expect(events).toEqual(["interact:pressed"]);
    input.stop();
  });

  it("captures a newly hot-plugged gamepad button without leaking the press", () => {
    const browser = fakeBrowserTarget([]);
    const input = new BrowserSemanticInput(browser.target);
    const captured: Array<string | number> = [];
    input.start();
    input.beginBindingCapture("gamepad", (value) => captured.push(value));

    browser.setGamepads([pressedButtonGamepad(4)]);
    browser.emit("gamepadconnected", {} as Event);

    expect(captured).toEqual([4]);
    expect(input.state.action("interact").held).toBe(false);
    input.stop();
  });
});
