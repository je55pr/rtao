import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { readRaceCatalogue } from '../src/formats/raceCatalogue';
import { advanceNativeRaceVehicle, advanceNativeRaceVehicleVelocity, createNativeRaceVehicleState, integrateNativeRacePosition,
  nativeRaceDrag, nativeRacePositionCoordinates, ordinaryRaceOpponentEquipment, readNativeRaceEquipment } from '../src/game/nativeRaceVehicle';
import { PalScalarMachine } from '../test-support/palScalarMachine';
import {multiplyNativeRaceMatrices,nativeRaceNormalBasis,nativeRaceYawMatrix,normalizeNativeRaceVector,readNativeRaceMathData} from '../src/game/nativeRaceMath';
const executablePath = process.env.RTA_PAL_EXECUTABLE;

describe.skipIf(!executablePath)('PAL composed vehicle stages', () => {
  const bytes = (): Uint8Array => new Uint8Array(readFileSync(executablePath!));
  test('copies native equipment for all ordinary races and all scalar selector ranges, including teammates', () => {
    const executable = bytes(), machine = new PalScalarMachine(executable), v = machine.view;
    const car = 0x1000000, config = 0x1001000;
    const configurations = readRaceCatalogue(executable).ordinaryRaces.map(race => ordinaryRaceOpponentEquipment(race).selectors);
    for (let category = 1; category <= 6; category++) for (let selector = 0; selector < [0, 13, 12, 5, 6, 4, 4][category]!; selector++) {
      const config = new Uint8Array(14); config[category] = selector; configurations.push(config);
    }
    for (const selectors of configurations) for (const flags of [2, 0x10, 0x80]) {
      machine.memory.set(selectors, config); v.setUint32(car + 0x180, config, true); v.setUint16(car + 0x198, flags, true);
      machine.run(0x218f70, [car]);
      const expected = { surfaceGrips: Array.from({ length: 6 }, (_, i) => v.getInt16(car + 0x21c + i * 2, true)),
        mass: v.getInt32(car + 0x218, true), engineScalar: v.getInt32(car + 0x214, true), fuelConsumption: v.getInt16(car + 0x240, true),
        steeringScalar: v.getInt16(car + 0x242, true), brakeCurve: machine.memory.slice(v.getUint32(car + 0x200, true), v.getUint32(car + 0x200, true) + 32),
        gearWords: Array.from({ length: 8 }, (_, i) => v.getInt16(car + 0x22c + i * 2, true)) };
      expect(readNativeRaceEquipment(executable, selectors, flags)).toEqual(expected);
    }
  });

  test.each([false,true])('composed command/force/traction/drift state matches the original full call sequence (native VU: %s)', (nativeVu) => {
    const executable = bytes(), m = new PalScalarMachine(executable), v = m.view;
    const mathData=readNativeRaceMathData(executable);
    const car = 0x1000000, local = 0x1001000, scene = 0x1002000, support = 0x1003000, curve = 0x1004000, runtimeEquipment = 0x1005000;
    v.setUint32(0x3dd7f0 - 16024, 0x21dcf8, true); v.setUint32(0x3dd7f0 - 16028, 0, true);
    let seed = 0x6374726c;
    const rand = (): number => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed; };
    for (let i = 0; i < 2048; i++) {
      const selectors = [0, rand() % 13, rand() % 12, rand() % 5, rand() % 6, rand() % 4, rand() % 4];
      const equipment = readNativeRaceEquipment(executable, selectors);
      const state = { ...createNativeRaceVehicleState(rand() & 65535), gear: rand() % 5,
        steeringAccumulator: rand() % 65 - 32, steeringSpeedMemory: rand() % 50001, engineSpeed: rand() % 10001,
        nativeSpeed: rand() % 60001 - 30000, brakeHold: rand() % 33, fuel: rand() % 0x40001,
        slipAngle: rand() % 12001 - 6000, driftRate: rand() % 1025 - 512 };
      const contact = { localForwardSpeed: rand() % 60001 - 30000, localSideSpeed: rand() % 10001 - 5000,
        surfaceIndex: rand() % 6, driveContact: (rand() >>> 31) !== 0, contactAccelerationY: rand() % 179 - 89,
        contactAllowsYaw: true };
      const commands = [0, 1, 2, 3, 5, 9, 0x2001, 0x8002][rand() >>> 29]!, sceneFlags = i % 7 === 0 ? 0 : 4;
      m.memory.set(equipment.brakeCurve, curve); v.setUint32(car + 0x200, curve, true); v.setUint32(car + 0x184, runtimeEquipment, true);
      v.setUint16(runtimeEquipment + 8, 0, true); v.setInt8(car + 0x213, 0);
      for (const [offset, value] of [[0x214, equipment.engineScalar], [0x218, equipment.mass], [0x23c, state.fuel], [0x1d8, state.steeringSpeedMemory],
        [0x1b8, state.nativeSpeed], [0x19c, contact.surfaceIndex], [0x1f8, state.runtimeFlags], [0x1dc, 4096], [0x1e0, contact.driveContact ? 4096 : 0], [0x1e4, 0]]) v.setInt32(car + offset!, value!, true);
      for (const [offset, value] of [[0x240, equipment.fuelConsumption], [0x242, equipment.steeringScalar], [0x1ce, state.steeringAccumulator],
        [0x1d0, state.engineSpeed], [0x1d4, state.yaw], [0x1d6, state.slipAngle], [0x1d2, state.driftRate]]) v.setInt16(car + offset!, value!, true);
      equipment.surfaceGrips.forEach((n, j) => v.setInt16(car + 0x21c + j * 2, n, true));
      equipment.gearWords.forEach((n, j) => v.setInt16(car + 0x22c + j * 2, n, true));
      v.setUint8(car + 0x1ff, state.gear); v.setUint8(car + 0x1fe, state.brakeHold);
      v.setInt32(local, contact.localSideSpeed, true); v.setInt32(local + 8, contact.localForwardSpeed, true);
      v.setInt32(support + 4, contact.contactAccelerationY, true); v.setUint32(scene + 0x28, sceneFlags, true);
      const matrix=multiplyNativeRaceMatrices(nativeRaceNormalBasis(normalizeNativeRaceVector([0.1,1,0.2,0])),
        nativeRaceYawMatrix(Math.fround(Math.fround((state.yaw<<16>>16)*Math.fround(Math.PI))/32768),mathData));
      if(nativeVu)matrix.forEach((n,j)=>v.setFloat32(car+j*4,n,true));
      let slipMagnitude = 0;
      m.run(0x21b1c0, [scene, car, local, commands, support], {
        0x281a58: a => { m.memory.fill(a[1]!, a[0]!, a[0]! + a[2]!); return a[0]!; },
        0x218b18: a => { slipMagnitude = a[2]!; return 0; },
        ...(!nativeVu ? {0x21e188: (a:readonly number[]) => { m.memory.copyWithin(a[0]!, a[2]!, a[2]! + 16); return 0; }} : {}),
      });
      const expected = { state: { gear: v.getInt8(car + 0x1ff), brakeHold: v.getUint8(car + 0x1fe),
        steeringAccumulator: v.getInt16(car + 0x1ce, true), steeringSpeedMemory: v.getInt32(car + 0x1d8, true), curvature: v.getInt16(car + 0x1cc, true),
        engineSpeed: v.getInt16(car + 0x1d0, true), nativeSpeed: v.getInt32(car + 0x1b8, true), wheelSpeed: v.getInt32(car + 0x1bc, true),
        fuel: v.getInt32(car + 0x23c, true), yaw: v.getUint16(car + 0x1d4, true), slipAngle: v.getInt16(car + 0x1d6, true),
        driftRate: v.getInt16(car + 0x1d2, true), runtimeFlags: v.getUint32(car + 0x1f8, true) },
        localForwardSpeed: v.getInt32(car + 0xf8, true), localSideSpeed: v.getInt32(car + 0xf0, true), slipMagnitude };
      const context=JSON.stringify({i,selectors,state,contact,commands});
      if(nativeVu){
        const actual=advanceNativeRaceVehicleVelocity(state,equipment,contact,commands,sceneFlags,matrix);
        expect(actual.state,context).toEqual(expected.state);
        expect(actual.slipMagnitude,context).toBe(slipMagnitude);
        expect(actual.worldVelocity,context).toEqual(Array.from({length:4},(_,j)=>v.getInt32(car+0xf0+j*4,true)));
      }else expect(advanceNativeRaceVehicle(state, equipment, contact, commands, sceneFlags),context).toEqual(expected);
    }
  });

  test('native quadratic drag and fixed-point position writes match 4096 seeded cases', () => {
    const m = new PalScalarMachine(bytes()), v = m.view, car = 0x1000000, scene = 0x1001000, velocityAddress = car + 0xf0, stack = 0x1f00000;
    v.setUint32(0x3dd7f0 - 16028, 0, true);
    let seed = 0x706f7330;
    const rand = (): number => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed; };
    for (let i = 0; i < 4096; i++) {
      const forward = rand() % 106195 - 53097, side = rand() % 20001 - 10000, mass = 15 + rand() % 16, specialState = rand() % 3 - 1, raceMode = rand() & 7, place = rand() % 24;
      v.setInt32(stack, side, true); v.setInt32(stack + 8, forward, true); v.setInt8(car + 0x213, specialState);
      v.setInt32(car + 0x218, mass, true); v.setUint8(car + 0x247, place); v.setUint8(scene + 0xa, raceMode);
      m.run(0x21cd88, [], {}, { registers: {3:specialState & 255,17:car,21:scene}, stopAt:0x21cea8 });
      expect(nativeRaceDrag(forward, side, mass, specialState, raceMode, place)).toEqual({ forward: v.getInt32(stack + 8, true), side: v.getInt32(stack, true) });
      const position: [number, number, number] = [rand() & 0x0fffffff, rand() | 0, rand() & 0x0fffffff];
      const velocity: [number, number, number] = [rand() % 120001 - 60000, rand() % 120001 - 60000, rand() % 120001 - 60000];
      position.forEach((n, j) => v.setInt32(car + 0xa0 + j * 4, n, true)); velocity.forEach((n, j) => v.setInt32(velocityAddress + j * 4, n, true));
      m.run(0x21d1b8, [], {}, { registers: {17:car,19:velocityAddress}, stopAt:0x21d24c });
      const next = integrateNativeRacePosition(position, velocity);
      expect(next).toEqual([0, 1, 2].map(j => v.getInt32(car + 0xa0 + j * 4, true)));
      m.run(0x21d2f0, [], {0x21ad88: () => 0}, { registers: {17:car,18:car+0xa0,6:car+0x90}, stopAt:0x21d380 });
      expect(nativeRacePositionCoordinates(next)).toEqual([0, 1, 2].map(j => v.getFloat32(car + 0x90 + j * 4, true)));
    }
  });
});
