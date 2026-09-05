import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { advanceNativeRaceGroundSupport, type NativeRaceGroundSupportInput, type NativeRaceGroundSupportOutput } from '../src/game/nativeRaceGroundSupport';
import { PalScalarMachine } from '../test-support/palScalarMachine';

const executablePath = process.env.RTA_PAL_EXECUTABLE;
describe.skipIf(!executablePath)('PAL seven-probe ground support', () => {
  function oracle(): (input: NativeRaceGroundSupportInput) => NativeRaceGroundSupportOutput {
    const m = new PalScalarMachine(new Uint8Array(readFileSync(executablePath!))), v = m.view;
    const car = 0x1000000, scene = 0x1001000, heights = 0x1002000, query = 0x1003000, local = 0x1004000, equipment = 0x1005000;
    return input => {
      input.pointY.forEach((n, i) => v.setFloat32(car + 0x114 + i * 16, n, true));
      input.heightWords.forEach((n, i) => v.setInt32(heights + i * 4, n, true));
      input.queryY.forEach((n, i) => v.setFloat32(query + i * 4, n, true));
      input.support.forEach((n, i) => v.setInt32(car + 0x1dc + i * 4, n, true));
      input.supportDelta.forEach((n, i) => v.setInt32(car + 0x1e8 + i * 4, n, true));
      input.impulses.forEach((n, i) => v.setInt32(car + 0x1c0 + i * 4, n, true));
      v.setInt32(local, input.localX, true); v.setInt32(local + 8, input.localZ, true);
      v.setUint32(car + 0x184, equipment, true); v.setUint16(equipment + 8, input.equipmentFlags, true);
      v.setUint16(car + 0x198, input.carFlags, true); v.setUint32(scene + 0x28, input.sceneFlags, true);
      const impactRequests: {channel: number; kind: 1; strength: number}[] = [];
      const flags = m.run(0x21bdd8, [scene, car, heights, query, local, car + 0x110, input.verticalImpulse], {
        0x20b898: a => { impactRequests.push({ channel:a[1]!, kind:a[2]! as 1, strength:a[3]! }); return 0; },
      });
      return { pointY: Array.from({length:7}, (_, i) => v.getFloat32(car + 0x114 + i * 16, true)),
        heightWords: Array.from({length:7}, (_, i) => v.getInt32(heights + i * 4, true)),
        support: Array.from({length:3}, (_, i) => v.getInt32(car + 0x1dc + i * 4, true)),
        supportDelta: Array.from({length:3}, (_, i) => v.getInt32(car + 0x1e8 + i * 4, true)),
        impulses: Array.from({length:3}, (_, i) => v.getInt32(car + 0x1c0 + i * 4, true)), flags, impactRequests };
    };
  }

  test('all scalar writes and impact requests match 8192 seeded PAL executions', () => {
    const runPal = oracle();
    let seed = 0x67726e64;
    const rand = (): number => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed; };
    let impactCount = 0, airborneCount = 0, clampCount = 0;
    for (let i = 0; i < 8192; i++) {
      const equipmentFlags = i % 2 === 0 ? 0 : 0x400, allowance = equipmentFlags ? 0xa3d7 : 0x51eb;
      const heightWords = Array.from({length:7}, () => (rand() % 0x200000) - 0x100000);
      const offsets = [-0x10000, -8193, -1, 0, 1, allowance - 1, allowance, allowance + 1];
      const input = { heightWords, equipmentFlags,
        pointY: heightWords.map(n => Math.fround((n + offsets[rand() >>> 29]!) / 32768)),
        queryY: heightWords.map(n => Math.fround((n + allowance + 32768 + (rand() % 3 - 1)) / 32768)),
        support: Array.from({length:3}, () => [0, 1, 4095, 4096, 4097, 8191, 8192, rand() % 8193][rand() >>> 29]!),
        supportDelta: Array.from({length:3}, () => rand() % 2001 - 1000),
        impulses: Array.from({length:3}, () => [0, 178, 179, rand() % 4001 - 2000][rand() >>> 30]!),
        localX: rand() % 10001 - 5000, localZ: rand() % 10001 - 5000, verticalImpulse: rand() % 1001 - 500,
        carFlags: [2, 3, 0x80, 0x10][rand() >>> 30]!, sceneFlags: i % 3 === 0 ? 0x44 : 4 };
      const expected = runPal(input);
      expect(advanceNativeRaceGroundSupport(input), JSON.stringify({ i, input })).toEqual(expected);
      impactCount += expected.impactRequests.length;
      airborneCount += expected.impulses.some(n => n !== 0) ? 1 : 0;
      clampCount += expected.flags & 0x7f ? 1 : 0;
    }
    expect(impactCount).toBeGreaterThan(100);
    expect(airborneCount).toBeGreaterThan(100);
    expect(clampCount).toBeGreaterThan(100);
  });

  test('retains PAL suspension history through 600 landing, braking and release updates', () => {
    const runPal = oracle();
    let input: NativeRaceGroundSupportInput = { pointY:Array(7).fill(0), heightWords:Array(7).fill(0), queryY:Array(7).fill(0),
      support:[4096,4096,4096], supportDelta:[0,0,0], impulses:[0,0,0], localX:0, localZ:0, verticalImpulse:-89,
      equipmentFlags:0, carFlags:2, sceneFlags:4 };
    for (let tick = 0; tick < 600; tick++) {
      const height = tick < 80 ? 32768 : tick < 240 ? 0 : tick < 320 ? 16384 : -32768;
      input = { ...input, pointY:Array(7).fill(height / 32768), queryY:Array(7).fill(height / 32768),
        heightWords:Array(7).fill(tick < 80 ? 65536 : height), localZ:tick < 150 ? 300 : tick < 300 ? -300 : 0 };
      const expected = runPal(input), actual = advanceNativeRaceGroundSupport(input);
      expect(actual, `update ${tick}`).toEqual(expected);
      input = { ...input, support:actual.support, supportDelta:actual.supportDelta, impulses:actual.impulses };
    }
  });
});
