import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { advanceNativeRaceDriveForce } from '../src/game/nativeRaceDriveForce';
import { PalScalarMachine } from '../test-support/palScalarMachine';
const executablePath = process.env.RTA_PAL_EXECUTABLE;
describe.skipIf(!executablePath)('PAL native drive-force consumer', () => {
  test('matches engine, fuel and both force axes over 4096 deterministic contact cases', () => {
    const machine = new PalScalarMachine(new Uint8Array(readFileSync(executablePath!))), v = machine.view;
    const car = 0x1000000, out = 0x1001000;
    v.setUint32(0x3dd7f0 - 16028, 0, true);
    let seed = 0x64726976;
    const rand = (): number => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed; };
    for (let i = 0; i < 4096; i++) {
      const input = {
        localForwardSpeed: (rand() % 106195) - 53097, localSideSpeed: (rand() % 20001) - 10000,
        engineSpeed: rand() % 10001, engineScalar: [1500, 1800, 2200, 3300][rand() >>> 30]!,
        gearWord: [-95, 116, 162, 227, 318, 446, 557, 750][rand() >>> 29]!, mass: [15, 18, 20, 25][rand() >>> 30]!,
        grip: [-1, 0, 20, 89][rand() >>> 30]!, brakeForce: rand() % 10001,
        commands: [0, 1, 2, 9][rand() >>> 30]!, driveEnabled: rand() >>> 31 !== 0,
        fuel: rand() % 100, fuelConsumption: rand() % 30, runtimeFlags: 0x40,
      };
      v.setInt16(car + 0x1d0, input.engineSpeed, true); v.setUint8(car + 0x1ff, 1);
      v.setInt16(car + 0x22e, input.gearWord, true); v.setInt32(car + 0x218, input.mass, true);
      v.setInt32(car + 0x214, input.engineScalar, true); v.setInt32(car + 0x23c, input.fuel, true);
      v.setInt16(car + 0x240, input.fuelConsumption, true); v.setUint32(car + 0x1f8, input.runtimeFlags, true);
      const slipMagnitude = machine.run(0x219d90, [out, car, input.localForwardSpeed, input.localSideSpeed,
        input.grip, input.brakeForce, input.commands, input.driveEnabled ? 4 : 0]);
      expect(advanceNativeRaceDriveForce(input), JSON.stringify(input)).toEqual({
        localForwardSpeed: v.getInt32(out + 8, true), localSideSpeed: v.getInt32(out, true),
        engineSpeed: v.getInt16(car + 0x1d0, true), wheelSpeed: v.getInt32(car + 0x1bc, true),
        fuel: v.getInt32(car + 0x23c, true), runtimeFlags: v.getUint32(car + 0x1f8, true), slipMagnitude,
      });
    }
  });
});
