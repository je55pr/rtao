import { describe, expect, test } from 'vitest';
import { advanceNativeBoost, advanceNativeGear, advanceNativeSteering } from './nativeRaceControls';
import { nativeTransmissionProfile } from './nativeTransmissionPerformance';

describe('native race control sequences', () => {
  test('steering reverses the stored input then recentres only while moving', () => {
    const state = { commands: 0x2000, accumulator: -20, speedMemory: 1000, localForwardSpeed: 2000, steeringScalar: 64 };
    const reversed = advanceNativeSteering(state);
    expect(reversed.accumulator).toBe(20);
    expect(reversed.speedMemory).toBe(2000);
    expect(advanceNativeSteering({ ...state, ...reversed, commands: 0, localForwardSpeed: 0 }).accumulator).toBe(20);
    expect(advanceNativeSteering({ ...state, ...reversed, commands: 0 }).accumulator).toBe(16);
  });
  test('gear changes respect the native quotient threshold, brake override and zero sentinel', () => {
    const input = { gear: 1, localForwardSpeed: 7432, commands: 1, gearWords: nativeTransmissionProfile(0).ratios, highShiftSchedule: true };
    expect(advanceNativeGear(input)).toBe(1);
    expect(advanceNativeGear({ ...input, localForwardSpeed: 7433 })).toBe(2);
    expect(advanceNativeGear({ ...input, localForwardSpeed: 7433, commands: 3 })).toBe(1);
    expect(advanceNativeGear({ ...input, gear: 5, localForwardSpeed: 53097 })).toBe(5);
    expect(advanceNativeGear({ ...input, commands: 5 })).toBe(0);
  });
  test('boost uses fuel after its debit and releases through the signed cooldown', () => {
    const input = { sceneFlags: 4, commands: 9, phase: 0, fuel: 30100, carFlags: 2 };
    expect(advanceNativeBoost(input)).toMatchObject({ fuel: 30000, speedIncrement: 178, soundCues: [16] });
    const low = advanceNativeBoost({ ...input, fuel: 12099, phase: 3 });
    expect(low).toEqual({ phase: 0, fuel: 11999, speedIncrement: 44, soundCues: [0x8010] });
    const released = advanceNativeBoost({ ...input, commands: 0, phase: 1 });
    expect(released.phase).toBe(-2);
    expect(advanceNativeBoost({ ...input, commands: 0, phase: -2 }).phase).toBe(-1);
    expect(advanceNativeBoost({ ...input, commands: 0, phase: -1 }).phase).toBe(0);
  });
});
