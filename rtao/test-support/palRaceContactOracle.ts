import type { NativeRaceCollisionPoint as Point } from '../src/game/nativeRaceCollision';
import type { NativeRaceContactInput } from '../src/game/nativeRaceContact';
import { PalScalarMachine } from './palScalarMachine';

/** Executes the contact caller and support solver. Supplying nativeMatrix runs
 * VU/orientation instructions too; otherwise transformed probes are prescribed
 * and orientation helpers are observed through hooks for the scalar-only gate. */
export function palRaceContactOracle(executable: Uint8Array) {
  const m = new PalScalarMachine(executable), v = m.view;
  const car = 0x1800000, scene = 0x1801000, equipment = 0x1802000, globalEquipment = 0x1802100;
  const local = 0x1803000, response = 0x1803100, stack = 0x1f00000 - 272;
  const floats = (address: number, count: number) => Array.from({length:count}, (_, i) => v.getFloat32(address + i * 4, true));
  const ints = (address: number, count: number) => Array.from({length:count}, (_, i) => v.getInt32(address + i * 4, true));
  const putFloats = (address: number, values: readonly number[]) => values.forEach((n, i) => v.setFloat32(address + i * 4, n, true));
  const putInts = (address: number, values: readonly number[]) => values.forEach((n, i) => v.setInt32(address + i * 4, n, true));
  return {
    machine: m, scene,
    run(input: NativeRaceContactInput, transformed: readonly Point[], query?: (point: Point, sector: number, index: number) => {
      point: Point; flags: number; ceilingY: number;
    }, nativeMatrix?: readonly number[]) {
      m.memory.fill(0, car, car + 0x1000);
      if (nativeMatrix) putFloats(car,nativeMatrix);
      m.memory.fill(0, stack - 512, stack + 272);
      const state = input.state;
      putInts(car + 0xa0, state.position); v.setFloat32(car + 0x94, state.referenceY, true);
      putInts(car + 0x1dc, state.support); putInts(car + 0x1e8, state.supportDelta); putInts(car + 0x1c0, state.impulses);
      v.setInt32(car + 0x1f4, state.unsupportedTicks, true); v.setUint32(car + 0x1f8, state.runtimeFlags, true);
      v.setInt8(car + 0x213, state.specialState); v.setInt16(car + 0x1d4, state.yaw, true);
      v.setUint32(car + 0x184, equipment, true); v.setUint16(equipment + 8, input.equipmentFlags, true);
      v.setUint32(0x1824270, globalEquipment, true); v.setUint16(globalEquipment + 8, input.globalEquipmentFlags, true);
      v.setUint16(car + 0x198, input.carFlags, true); v.setUint32(scene + 0x28, input.sceneFlags, true);
      v.setUint8(scene + 0xb, input.sceneByte0B);
      input.sceneCommands.forEach((n, i) => v.setUint16(scene + 0x2c + i * 2, n, true));
      putInts(local, [input.localX, 0, input.localZ]); putInts(response, [0, 0, input.responseZ, input.responseW]);
      v.setUint32(0x3dd7f0 - 15968, 0x208c50, true);
      const impactRequests: {channel: number; kind: number; strength: number}[] = [], soundRequests: number[] = [];
      const probeCalls: {address: number; probe: number[]; translation: number[]}[] = [];
      const queryCalls: {point: number[]; sector: number}[] = [];
      let index = 0, edgeA: number[] = [], edgeB: number[] = [], yawRadians = 0, adjustmentMode = 0;
      const orientationCalls: string[] = [];
      const hooks: Record<number, (a: readonly number[]) => number> = {
        0x275770: a => {
          if (a[1] !== car || a[0] !== car + 0x110 + index * 16) throw new Error('Unexpected probe transform arguments');
          probeCalls.push({address:a[2]!, probe:floats(a[2]!, 4), translation:[]});
          putFloats(a[0]!, transformed[index]!); return 0;
        },
        0x275990: a => {
          const translation = floats(a[2]!, 4), point = floats(a[1]!, 4);
          probeCalls[index]!.translation = translation;
          putFloats(a[0]!, point.map((n, j) => Math.fround(n + translation[j]!)));
          index++; return 0;
        },
        0x20b898: a => { impactRequests.push({channel:a[1]!, kind:a[2]!, strength:a[3]!}); return 0; },
        0x25b2c8: a => { soundRequests.push(a[0]!); return 0; },
        0x2757e8: a => {
          edgeA = floats(a[1]!, 3); edgeB = floats(a[2]!, 3);
          // Sentinel normal verifies the caller flips Y before normalization.
          putFloats(a[0]!, [3, -4, 5, 0]); orientationCalls.push('cross'); return 0;
        },
        0x275830: a => {
          if (floats(a[1]!, 3).join(',') !== '3,4,5') throw new Error('Caller did not flip negative normal Y');
          orientationCalls.push('normalize'); return 0;
        },
        0x21a368: a => { adjustmentMode = a[1]!; yawRadians = m.floatRegister(12); orientationCalls.push('adjust'); return 0; },
        0x2086c0: () => { orientationCalls.push('basis'); return 0; },
        0x208738: () => { yawRadians = m.floatRegister(12); orientationCalls.push('yaw'); return 0; },
        0x2758b8: a => {
          if (a[0] !== car + 0xb0 || a[1] !== car) throw new Error('Unexpected inverse arguments');
          orientationCalls.push('inverse'); return 0;
        },
      };
      if (query) hooks[0x208c50] = a => {
        const point = floats(a[0]!, 4) as unknown as Point;
        queryCalls.push({point:[...point], sector:a[3]!});
        const result = query(point, a[3]!, queryCalls.length - 1);
        putFloats(a[0]!, result.point); v.setFloat32(a[1]!, result.ceilingY, true); return result.flags;
      };
      if (nativeMatrix) for (const address of [0x275770,0x275990,0x2757e8,0x275830,0x21a368,0x2086c0,0x208738,0x2758b8]) delete hooks[address];
      // Seven complete collision queries plus support, each previously bounded at 20k.
      const flags = m.run(0x21c280, [scene, car, local, response, input.verticalImpulse, input.commands], hooks, {
        maxSteps:160_000,
        observe:nativeMatrix ? {0x2757e8:() => {
          if (m.register(31) !== 0x21c868) return;
          edgeA = floats(m.register(5),3); edgeB = floats(m.register(6),3);
          yawRadians = m.floatRegister(21); adjustmentMode = m.register(16);
        }} : undefined,
      });
      return {
        result: {
          state: {...state, position:ints(car + 0xa0, 3), support:ints(car + 0x1dc, 3), supportDelta:ints(car + 0x1e8, 3),
            impulses:ints(car + 0x1c0, 3), unsupportedTicks:v.getInt32(car + 0x1f4, true), runtimeFlags:v.getUint32(car + 0x1f8, true),
            specialState:v.getInt8(car + 0x213)},
          points:Array.from({length:7}, (_, i) => floats(car + 0x110 + i * 16, 4)),
          heightWords:ints(stack + 32, 7), queryY:floats(stack, 7), surfaces:ints(car + 0x19c, 7),
          flags, impactRequests, soundRequests, orientation:{edgeA, edgeB, yawRadians, adjustmentMode},
        },
        probeCalls, queryCalls, orientationCalls,
        geometry:nativeMatrix ? {normal:floats(stack+112,4),matrix:floats(car,16),inverse:floats(car+0xb0,16)} : undefined,
      };
    },
  };
}
