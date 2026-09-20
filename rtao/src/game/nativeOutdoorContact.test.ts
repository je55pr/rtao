import { describe, expect, test } from "vitest";
import {
  NativeDrivingMotion,
  type NativeDrivingMotionStep,
} from "./nativeDrivingMotion";
import { syntheticNativeDrivingMotionAuthority } from "./nativeDrivingMotion.testSupport";
import { NativeOutdoorContact, type NativeOutdoorContactQuery } from "./nativeOutdoorContact";
import { nativeRaceBodyMatrix } from "./nativeRaceBody";
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

  test("builds native slope orientation and chassis attitude from queried support", () => {
    const contact = runtime({ x: 800, y: 0, z: 800 });
    const slope = groundQuery((_x, z) => (z - 800) * 0.08);
    contact.prime(slope);
    for (let tick = 0; tick < 12; tick += 1) contact.advance(retainedStep(), slope);
    const pose = contact.pose(0);
    expect(Math.abs(pose.pitch)).toBeGreaterThan(0.02);
    expect(Math.abs(pose.roll)).toBeLessThan(0.01);
    expect(pose.bodyMatrix).toEqual(
      nativeRaceBodyMatrix(contact.retainedContact.support, 0, authority.body),
    );
  });

  test("carries support history deterministically across a terrain crest", () => {
    const crest = groundQuery((_x, z) => -Math.abs(z - 800) * 0.12);
    const a = runtime({ x: 800, y: -0.36, z: 797 });
    const b = runtime({ x: 800, y: -0.36, z: 797 });
    a.prime(crest);
    b.prime(crest);
    const aTilt: number[] = [];
    const bTilt: number[] = [];
    for (let tick = 0; tick < 64; tick += 1) {
      a.advance(retainedStep(0, 4096), crest);
      b.advance(retainedStep(0, 4096), crest);
      aTilt.push(a.pose(0).bodyMatrix[6]!);
      bTilt.push(b.pose(0).bodyMatrix[6]!);
    }
    expect(aTilt).toEqual(bTilt);
    expect(aTilt.some((value) => value > 0.0001)).toBe(true);
    expect(aTilt.some((value) => value < -0.0001)).toBe(true);
  });
  test("carries Big Tyre ride height in the recovered body matrix without moving the contact root", () => {
    const query = groundQuery(() => 0);
    const ordinary = runtime();
    const big = runtime();
    ordinary.prime(query);
    big.prime(query, 0x400, 0x400);
    const ordinaryPose = ordinary.pose(0);
    const bigPose = big.pose(0);
    expect(bigPose.position).toEqual(ordinaryPose.position);
    expect(bigPose.bodyMatrix[13]! - ordinaryPose.bodyMatrix[13]!)
      .toBeCloseTo(authority.body.bigTyreLift, 7);
    expect(bigPose.bodyMatrix.slice(0, 12)).toEqual(ordinaryPose.bodyMatrix.slice(0, 12));
  });

  test("rebases fixed native position across an authored field seam", () => {
    const contact = runtime({ x: 0.2, y: 0, z: 800 });
    const query = groundQuery(() => 0);
    contact.prime(query);
    const nextField = fieldNumberFromAddress(4, 4);
    expect(contact.advance(retainedStep(32768, 0), query)).toBeDefined();
    const pose = contact.pose(0);
    expect(pose.fieldNumber).toBe(nextField);
    expect(pose.position.x).toBeGreaterThan(1598);
    expect(pose.position.x).toBeLessThanOrEqual(1600);
  });

  test("retains compression and rebound history instead of rebuilding level support", () => {
    const contact = runtime();
    const flat = groundQuery(() => 0);
    const releasedGround = groundQuery(() => -4);
    contact.prime(flat);
    const rest = [...contact.retainedContact.support];
    for (let tick = 0; tick < 20; tick += 1) contact.advance(retainedStep(), releasedGround);
    const compressed = [...contact.retainedContact.support];
    const compressedBodyY = contact.pose(0).bodyMatrix[13]!;
    expect(compressed).not.toEqual(rest);
    expect(compressed.some((value, index) => value !== rest[index])).toBe(true);
    expect(Math.abs(compressedBodyY)).toBeGreaterThan(0.0001);

    for (let tick = 0; tick < 80; tick += 1) contact.advance(retainedStep(), flat);
    const rebound = [...contact.retainedContact.support];
    const distance = (values: readonly number[]) =>
      values.reduce((sum, value, index) => sum + Math.abs(value - rest[index]!), 0);
    expect(distance(rebound)).toBeLessThan(distance(compressed));
  });
  test("falls toward lower contact and lands through retained support history without a browser road snap", () => {
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
        specialState: contact.specialState,
        propellerEnabled: false,
        native: contact.retainedContact,
      },
    });
    expect(step.surfaceResolved).toBe(true);
    expect(step.nativeContactKinematics).toBeDefined();
    expect(step.commands & 0x2000).toBe(0x2000);
    expect(contact.advance(step, query)).toBeDefined();
  });

  test("routes a terrain-edge miss through native rollback instead of a browser halt", () => {
    const contact = runtime();
    const flat = groundQuery(() => 0);
    const edge: NativeOutdoorContactQuery = (_field, point, _sector, index) => index === 3
      ? { point, flags: -1, ceilingY: 10000 }
      : { point: [point[0], 0, point[2], 0], flags: 0x550, ceilingY: 10000 };
    contact.prime(flat);
    const step = retainedStep(1000, 4000);
    const result = contact.advance(step, edge);
    expect(result).toBeDefined();
    expect(result!.contactFlags & 1).toBe(1);
    expect(result!.collisionFlags & 1).toBe(1);
    expect(result!.velocity).toEqual([753, 0, 3751, 0]);
    expect(result!.yaw).toBe(512);
  });

  test("retains native response state across repeated wall contacts and reverse recovery", () => {
    const contact = runtime();
    const query = groundQuery(() => 0);
    const motion = new NativeDrivingMotion(authority, 0);
    contact.prime(query);
    const collisionYaws: number[] = [];
    for (let tick = 0; tick < 3; tick += 1) {
      const step = motion.step({
        throttle: 1, steering: 0, surfaceIndex: undefined,
        contact: { specialState: contact.specialState, propellerEnabled: false, native: contact.retainedContact },
      });
      const result = contact.advance(step, query, 0, 0, () => 1)!;
      expect(result.collisionFlags & 15).toBe(1);
      motion.applyNativeContactResponse(result.velocity, result.yaw, result.runtimeFlags);
      collisionYaws.push(motion.nativeVehicle.yaw);
    }
    expect(collisionYaws).toEqual([512, 1024, 1536]);

    let reversed = false;
    for (let tick = 0; tick < 160; tick += 1) {
      const step = motion.step({
        throttle: -1, steering: 0, surfaceIndex: undefined,
        contact: { specialState: contact.specialState, propellerEnabled: false, native: contact.retainedContact },
      });
      const result = contact.advance(step, query)!;
      motion.applyNativeContactResponse(result.velocity, result.yaw, result.runtimeFlags);
      if ((step.commands & 4) !== 0) reversed = true;
    }
    expect(reversed).toBe(true);
  });

});
