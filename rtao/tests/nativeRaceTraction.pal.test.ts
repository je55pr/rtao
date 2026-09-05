import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { advanceNativeRaceDrift, nativeRaceYawStep, nativeTractionSpeed } from '../src/game/nativeRaceTraction';
import { PalScalarMachine } from '../test-support/palScalarMachine';
const executablePath = process.env.RTA_PAL_EXECUTABLE;
describe.skipIf(!executablePath)('PAL traction, yaw and drift', () => {
  test('matches traction speed and yaw writes across braking, zero grip and contact states', () => {
    const m = new PalScalarMachine(new Uint8Array(readFileSync(executablePath!))), v = m.view;
    const car = 0x1000000, local = 0x1001000, equipment = 0x1002000;
    let seed = 0x79617730;
    const rand = (): number => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed; };
    for (let i = 0; i < 4096; i++) {
      const localForwardSpeed = rand() % 100001 - 50000, previousSpeed = rand() % 100001 - 50000;
      const mass = 25, gripWord = [-256, 0, 196, 512][rand() >>> 30]!, contactY = 89;
      const brakeForce = [0, 1000, 4999, 10000][rand() >>> 30]!;
      const input = { nativeSpeed: nativeTractionSpeed(localForwardSpeed, previousSpeed, Math.trunc(gripWord * contactY / 256), mass, brakeForce),
        curvature: rand() % 9315 - 4657, yaw: rand() & 65535, slipAngle: rand() % 8001 - 4000,
        driftRate: rand() % 1025 - 512, contactAllowsYaw: (rand() >>> 31) !== 0 };
      v.setInt32(car + 0x19c, 0, true); v.setInt32(car + 0x218, mass, true); v.setInt32(car + 0x1b8, previousSpeed, true);
      v.setInt16(car + 0x21c, gripWord, true); v.setInt32(local + 8, localForwardSpeed, true);
      v.setInt16(car + 0x1cc, input.curvature, true); v.setUint16(car + 0x1d4, input.yaw, true);
      v.setInt16(car + 0x1d6, input.slipAngle, true); v.setInt16(car + 0x1d2, input.driftRate, true);
      v.setInt32(car + 0x1dc, input.contactAllowsYaw ? 4096 : 0, true); v.setInt32(car + 0x1e0, 0, true); v.setInt8(car + 0x213, 0);
      v.setUint32(car + 0x184, equipment, true); v.setUint16(equipment + 8, 0, true);
      m.run(0x21b460, [], {}, { registers: {16:car,18:local,19:brakeForce,20:car+12,23:contactY}, stopAt:0x21b654 });
      expect(v.getInt32(car + 0x1b8, true)).toBe(input.nativeSpeed);
      expect({ yaw: v.getUint16(car + 0x1d4, true), yawStep: m.register(18), lateralDemand: m.register(17) }, JSON.stringify(input)).toEqual(nativeRaceYawStep(input));
    }
  });
  test('matches complete native drift-rate, angle and flag writes over 4096 cases', () => {
    const m = new PalScalarMachine(new Uint8Array(readFileSync(executablePath!))), v = m.view, car = 0x1000000;
    let seed = 0x64726966;
    const rand = (): number => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed; };
    for (let i = 0; i < 4096; i++) {
      const input = { yaw: rand() & 65535, yawStep: rand() % 1001 - 500, slipAngle: rand() % 20001 - 10000,
        driftRate: rand() % 1025 - 512, nativeSpeed: i % 7 === 0 ? 0 : rand() % 106195 - 53097,
        wheelSpeed: i % 5 === 0 ? 0 : 10000, curvature: rand() % 9315 - 4657,
        grip: [-1, 0, 68, 178][rand() >>> 30]!, brakeForce: rand() % 10001, lateralDemand: rand() % 4001 - 2000, runtimeFlags: 2 };
      v.setUint16(car + 0x1d4, input.yaw, true); v.setInt16(car + 0x1d6, input.slipAngle, true);
      v.setInt16(car + 0x1d2, input.driftRate, true); v.setInt32(car + 0x1b8, input.nativeSpeed, true);
      v.setInt32(car + 0x1bc, input.wheelSpeed, true); v.setInt16(car + 0x1cc, input.curvature, true); v.setUint32(car + 0x1f8, input.runtimeFlags, true);
      m.run(0x21af38, [car, input.yawStep, input.grip, input.brakeForce, input.lateralDemand]);
      expect(advanceNativeRaceDrift(input), JSON.stringify(input)).toEqual({ yaw: v.getUint16(car + 0x1d4, true),
        slipAngle: v.getInt16(car + 0x1d6, true), driftRate: v.getInt16(car + 0x1d2, true), runtimeFlags: v.getUint32(car + 0x1f8, true) });
    }
  });
});
