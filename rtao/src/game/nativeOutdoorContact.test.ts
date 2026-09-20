import { describe, expect, test } from "vitest";
import {
  NativeDrivingMotion,
  type NativeDrivingMotionStep,
} from "./nativeDrivingMotion";
import { syntheticNativeDrivingMotionAuthority } from "./nativeDrivingMotion.testSupport";
import { NativeOutdoorContact, type NativeOutdoorContactQuery } from "./nativeOutdoorContact";
import { createNativeRaceVehicleState } from "./nativeRaceVehicle";
import { fieldNumberFromAddress } from "./worldTopology";

const authority = syntheticNativeDrivingMotionAuthority();
const startField = fieldNumberFromAddress(3, 4);

function groundQuery(
  height: (x: number, z: number) => number,
  surface = 0x550,
): NativeOutdoorContactQuery {
  return (_field, point) => ({
    point: [point[0], Math.fround(height(point[0], point[2])), point[2], 0],
    flags: surface,
    ceilingY: 10000,
  });
}
function retainedStep(vx = 0, vz = 0): NativeDrivingMotionStep {
  return {
    commands: 0,
    deltaX: -vx * 16 / 25 / authority.positionDivisor,
    deltaZ: vz * 16 / 25 / authority.positionDivisor,
    speed: 0,
    yaw: 0,
    steeringFraction: 0,
    nativeVelocity: [vx, 0, vz, 0],
    nativeVehicle: createNativeRaceVehicleState(0),
    surfaceResolved: true,
    nativeContactKinematics: {
      previousVelocity: [0, -89, 0, 0],
      localDelta: [0, 0, 0, 0],
      gravity: [0, 89, 0, 0],
      dragForward: vz,
      mass: 1000,
    },
  };
}

function runtime(
  position = { x: 800, y: 0, z: 800 },
  fieldNumber = startField,
): NativeOutdoorContact {
  return new NativeOutdoorContact(authority, fieldNumber, position, 0);
}
describe("native outdoor contact recurrence", () => {
  test("retains flat support and raw PAL surface without browser footprint sampling", () => {
    const contact = runtime();
    contact.prime(groundQuery(() => 0, 0x313));
    const pose = contact.pose(0);
    expect(pose.fieldNumber).toBe(startField);
    expect(pose.position.y).toBeCloseTo(0, 5);
    expect(pose.pitch).toBeCloseTo(0, 5);
    expect(pose.roll).toBeCloseTo(0, 5);
    expect(pose.surfaceFlags).toBe(0x313);
    expect(contact.retainedContact.surfaceFlags).toBe(0x313);
    expect(contact.retainedContact.support.some((value) => value !== 0)).toBe(true);
  });

  test("builds native slope orientation from seven queried probes", () => {
    const contact = runtime({ x: 800, y: 0, z: 800 });
    contact.prime(groundQuery((_x, z) => (z - 800) * 0.08));
    const pose = contact.pose(0);
    expect(Math.abs(pose.pitch)).toBeGreaterThan(0.02);
    expect(Math.abs(pose.roll)).toBeLessThan(0.01);
  });
  test("rebases fixed native position across an authored field seam", () => {
    const contact = runtime({ x: 0.2, y: 0, z: 800 });
    const query = groundQuery(() => 0);
    contact.prime(query);
    const nextField = fieldNumberFromAddress(4, 4);
    expect(contact.advance(retainedStep(32768, 0), query)).toBe(true);
    const pose = contact.pose(0);
    expect(pose.fieldNumber).toBe(nextField);
    expect(pose.position.x).toBeGreaterThan(1598);
    expect(pose.position.x).toBeLessThanOrEqual(1600);
  });

  test("retains changing support history instead of rebuilding a wheel footprint", () => {
    const contact = runtime();
    const flat = groundQuery(() => 0);
    contact.prime(flat);
    const before = [...contact.retainedContact.support];
    const dropped = groundQuery(() => -4);
    for (let tick = 0; tick < 20; tick += 1) contact.advance(retainedStep(), dropped);
    const during = [...contact.retainedContact.support];
    expect(during).not.toEqual(before);
    expect(during.some((value, index) => value !== before[index])).toBe(true);
  });
  test("loses and reacquires support through the retained native recurrence", () => {
    const contact = runtime();
    const flat = groundQuery(() => 0);
    const absent = groundQuery(() => -50);
    contact.prime(flat);
    for (let tick = 0; tick < 120; tick += 1) contact.advance(retainedStep(), absent);
    const lost = [...contact.retainedContact.support];
    expect(Math.max(...lost)).toBeLessThan(4096);

    for (let tick = 0; tick < 120; tick += 1) contact.advance(retainedStep(), flat);
    const recovered = [...contact.retainedContact.support];
    expect(Math.max(...recovered)).toBeGreaterThan(Math.max(...lost));
  });

  test("feeds retained raw contact into NativeDrivingMotion while preserving symmetric policy", () => {
    const contact = runtime();
    const query = groundQuery(() => 0, 0x455);
    contact.prime(query);
    const motion = new NativeDrivingMotion(authority, 0);
    const step = motion.step({
      throttle: 1,
      steering: 1,
      surfaceIndex: undefined,
      contact: {
        driveContact: false,
        accelerationY: 0,
        allowsYaw: false,
        specialState: contact.specialState,
        propellerEnabled: false,
        native: contact.retainedContact,
      },
    });
    expect(step.surfaceResolved).toBe(true);
    expect(step.nativeContactKinematics).toBeDefined();
    expect(step.commands & 0x2000).toBe(0x2000);
    expect(contact.advance(step, query)).toBe(true);
  });
});
