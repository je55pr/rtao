import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { advanceNativeBoost, advanceNativeGear, advanceNativeSteering } from '../src/game/nativeRaceControls';
import { PalScalarMachine } from '../test-support/palScalarMachine';
const executablePath = process.env.RTA_PAL_EXECUTABLE;
describe.skipIf(!executablePath)('PAL native command consumers', () => {
  test('matches both gearbox callbacks over every original gear table and boundary quotients', () => {
    const machine = new PalScalarMachine(new Uint8Array(readFileSync(executablePath!))), v = machine.view;
    for (let selector = 0; selector < 6; selector++) {
      const address = 0x301ee8 + selector * 28 + 12;
      const gearWords = Array.from({ length: 8 }, (_, i) => v.getInt16(address + i * 2, true));
      for (const highShiftSchedule of [false, true]) for (let gear = 0; gear < 7 && gearWords[gear] !== 0; gear++) {
        const speeds = new Set([0, -1000, 53097, 0x1ffffff]);
        for (const word of gearWords.filter(w => w > 0)) for (const q of [2999, 3000, 4000, 4999, 5000, 5001, 7999, 8000, 8200, 8201]) {
          const speed = Math.trunc(q * word / 128);
          speeds.add(speed); speeds.add(speed + 1);
        }
        for (const localForwardSpeed of speeds) for (const commands of [0, 1, 2, 3, 4, 5, 9]) {
          const input = { gear, localForwardSpeed, commands, gearWords, highShiftSchedule };
          expect(advanceNativeGear(input), JSON.stringify(input)).toBe(machine.run(highShiftSchedule ? 0x21dcf8 : 0x21de30, [gear, localForwardSpeed, commands, address, 9000]));
        }
      }
    }
  });
  test('matches the steering consumer including stop, reversal, saturation and speed-memory writes', () => {
    const machine = new PalScalarMachine(new Uint8Array(readFileSync(executablePath!))), v = machine.view;
    const car = 0x1000000, local = 0x1001000, auxiliary = 0x1002000;
    for (const steeringScalar of [64, 96, 128, 160]) for (let accumulator = -32; accumulator <= 32; accumulator++) {
      for (const localForwardSpeed of [0, 1, -1, 1000, -1000, 53097]) for (const commands of [0, 0x2000, 0x8000, 0xa000]) {
        const speedMemory = 25000;
        v.setInt16(car + 0x1ce, accumulator, true); v.setInt32(car + 0x1d8, speedMemory, true);
        v.setInt16(car + 0x242, steeringScalar, true); v.setInt32(local + 8, localForwardSpeed, true);
        machine.run(0x21b238, [], {}, { registers: { 16: car, 17: commands, 18: local, 19: auxiliary }, stopAt: 0x21b3b0 });
        expect(advanceNativeSteering({ accumulator, speedMemory, localForwardSpeed, steeringScalar, commands })).toEqual({
          accumulator: v.getInt16(car + 0x1ce, true), speedMemory: v.getInt32(car + 0x1d8, true), curvature: v.getInt16(car + 0x1cc, true),
        });
      }
    }
  });
  test('matches boost fuel thresholds, counter writes and ordered audio requests', () => {
    const machine = new PalScalarMachine(new Uint8Array(readFileSync(executablePath!))), v = machine.view;
    const scene = 0x1000000, phaseAddress = 0x1001000, fuelAddress = 0x1002000;
    for (const sceneFlags of [0, 4, 8, 12, 0x44]) for (const commands of [0, 1, 8, 9]) {
      for (const phase of [-2, -1, 0, 1, 3, 7, 32767]) for (const fuel of [0, 99, 100, 12099, 12100, 30099, 30100, 60000]) {
        for (const carFlags of [0x80, 2, 3]) {
          v.setUint32(scene + 0x28, sceneFlags, true); v.setInt16(phaseAddress, phase, true); v.setInt32(fuelAddress, fuel, true);
          const soundCues: number[] = [];
          const speedIncrement = machine.run(0x218dc0, [scene, phaseAddress, commands, fuelAddress, carFlags], {
            [0x25b2c8]: args => { soundCues.push(args[0]!); return 0; },
          });
          expect(advanceNativeBoost({ sceneFlags, commands, phase, fuel, carFlags }), JSON.stringify({sceneFlags, commands, phase, fuel, carFlags})).toEqual({
            phase: v.getInt16(phaseAddress, true), fuel: v.getInt32(fuelAddress, true), speedIncrement, soundCues,
          });
        }
      }
    }
  });
});
