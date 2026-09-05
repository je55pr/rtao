import { describe, expect, test } from 'vitest';
import { produceNativeRaceContacts, type NativeRaceContactData, type NativeRaceContactInput } from './nativeRaceContact';
import type { NativeRaceCollisionPoint as Point } from './nativeRaceCollision';

// Synthetic probes/configuration: no proprietary executable or course input.
const probes: Point[] = [[0,0,0,0],[-1,0,1,0],[1,0,1,0],[-1,0,0,0],[1,0,0,0],[-1,0,-1,0],[1,0,-1,0]];
const data: NativeRaceContactData = {probes,positionDivisor:32768,bigTyreThreshold:1,yawScale:Math.fround(Math.PI)};
function input(): NativeRaceContactInput {
  return {state:{position:[0,0,0],referenceY:0,support:[4096,4096,4096],supportDelta:[0,0,0],impulses:[0,0,0],
    unsupportedTicks:0,runtimeFlags:0,specialState:0,yaw:0},
  equipmentFlags:0,globalEquipmentFlags:0,carFlags:2,sceneFlags:4,sceneByte0B:0,sceneCommands:[0,0],
  localX:0,localZ:0,responseZ:0,responseW:0,verticalImpulse:0,commands:0};
}
function run(value: NativeRaceContactInput, groundY = 0, ceilingY = 10000) {
  return produceNativeRaceContacts(value,data,{
    transformProbe:(p,t) => p.map((n,j) => Math.fround(n + t[j]!)) as unknown as Point,
    query:p => ({point:[p[0],groundY,p[2],0],flags:7,ceilingY}),
  });
}

describe('native contact producer with explicit synthetic transform boundary', () => {
  test('preserves flat support and exports ordered orientation edges without building a matrix', () => {
    const value = input(), before = structuredClone(value), result = run(value);
    expect(result.state).toEqual(value.state);
    expect(result.surfaces).toEqual(Array(7).fill(7));
    expect(result.flags).toBe(0);
    expect(result.orientation).toEqual({edgeA:[1,0,1],edgeB:[-2,0,0],yawRadians:0,adjustmentMode:0});
    expect(value).toEqual(before);
  });

  test('uses the separate global equipment threshold and preserves threshold equality', () => {
    const base = input(), value = {...base,state:{...base.state,referenceY:-0.75}};
    expect(run({...value,equipmentFlags:0x400}).state.specialState).toBe(1);
    const globalBig = run({...value,globalEquipmentFlags:0x400});
    expect(globalBig.state.specialState).toBe(-1);
    expect(globalBig.soundRequests).toEqual([40]);
    expect(run({...value,state:{...value.state,referenceY:-0.5}}).state.specialState).toBe(-1);
    expect(run({...value,state:{...value.state,referenceY:0}}).state.specialState).toBe(0);
  });

  test('selects the correct scene command channel, gives 0x1000 precedence, and gates on support bit 0x100', () => {
    const value = {...input(),sceneByte0B:1,sceneCommands:[0x5000,0x4000] as const};
    expect(run(value).state.position[1]).toBe(-4096);
    expect(run({...value,carFlags:3}).state.position[1]).toBe(20971);
    expect(run({...value,carFlags:0}).state.position[1]).toBe(0);
    expect(run(value,0,0).state.position[1]).toBe(0);
  });

  test('equalizes impulses only after 65 unsupported updates and resets the counter on support', () => {
    const value = input();
    const airborne = {...value,state:{...value.state,support:[0,0,0],impulses:[9,-10,0],unsupportedTicks:64}};
    expect(run(airborne,-4).state).toMatchObject({unsupportedTicks:65,impulses:[9,-10,0],runtimeFlags:0});
    expect(run({...airborne,state:{...airborne.state,unsupportedTicks:65}},-4).state)
      .toMatchObject({unsupportedTicks:66,impulses:[0,0,0],runtimeFlags:1});
    expect(run({...value,state:{...value.state,unsupportedTicks:100}}).state.unsupportedTicks).toBe(0);
  });

  test('exports adjustment command precedence only for equipment bit 8 and keeps signed yaw', () => {
    const value = {...input(),commands:0xa000};
    expect(run(value).orientation.adjustmentMode).toBe(0);
    expect(run({...value,equipmentFlags:8}).orientation.adjustmentMode).toBe(128);
    expect(run({...value,equipmentFlags:8,commands:0x8000}).orientation.adjustmentMode).toBe(64);
    expect(run({...value,state:{...value.state,yaw:0x8000}}).orientation.yawRadians).toBe(-Math.fround(Math.PI));
  });
});
