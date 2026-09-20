import {expect,test} from 'vitest';
import {advanceNativeRaceBoostEquipment,advanceNativeRaceEquipmentYaw,advanceNativeRaceFrame,type NativeRaceFrameData,type NativeRaceFrameInput} from './nativeRaceFrame';
import {createNativeRaceVehicleState} from './nativeRaceVehicle';
import {nativeRaceIdentity} from './nativeRaceMath';

// Synthetic configuration only; no original executable/asset bytes.
const data:NativeRaceFrameData={contact:{probes:[[0,0,0,0],[-1,0,1,0],[1,0,1,0],[-1,0,0,0],[1,0,0,0],[-1,0,-1,0],[1,0,-1,0]],
  positionDivisor:32768,bigTyreThreshold:1,yawScale:Math.fround(Math.PI)},
  math:{rotationCoefficients:[0,0,0,-0.1],normalYThreshold:0.5,normalYIncrement:0.1},obstacle:{minimumX:-1,maximumX:1},
  bodySideDivisor:32768,bodyForwardDivisor:32768,bigTyreLift:1,obstacleYawScale:Math.fround(Math.PI)};
function input():NativeRaceFrameInput {
  return {state:{vehicle:createNativeRaceVehicleState(0),contact:{position:[0,0,0],referenceY:0,support:[4096,4096,4096],
    supportDelta:[0,0,0],impulses:[0,0,0],unsupportedTicks:0,runtimeFlags:0,specialState:0,yaw:0},
    velocity:[256,0,0,0],previousVelocity:[0,0,0,0],matrix:nativeRaceIdentity(),inverse:nativeRaceIdentity(),bodyMatrix:nativeRaceIdentity(),
    coordinates:[0,0,0,1],surfaces:Array(7).fill(0),carFlags:2,positionIndex:0,distance:0,countdownByte:0,countdownHalf:0,equipmentBoostState:0,verticalControl:0,shiftScheduleFlag:0},
    equipment:{surfaceGrips:Array(6).fill(1000),mass:20,engineScalar:100,fuelConsumption:1,steeringScalar:128,
      brakeCurve:new Uint8Array(32),gearWords:[-128,128,96,64,32,16,8,0]},equipmentFlags:0,globalEquipmentFlags:0,
    sceneFlags:4,sceneKind:0,sceneByte0B:0,sceneTime:0,raceModeByte:0,commands:1,highShiftSchedule:true,obstaclePoints:[]};
}
const query:Parameters<typeof advanceNativeRaceFrame>[2]=p=>({point:[p[0],0,p[2],0],flags:3,ceilingY:10000});
test('zero-curvature steering clears contact sideways feedback without mutating retained input',()=>{
  const original=input(),copy=structuredClone(original);
  const withoutSideDelta={...original,state:{...original.state,previousVelocity:[256,0,0,0] as const}};
  expect(advanceNativeRaceFrame(original,data,query)).toEqual(advanceNativeRaceFrame(withoutSideDelta,data,query));
  expect(original).toEqual(copy);
});
test('inactive cars skip contact and unrecovered frame paths fail explicitly',()=>{
  const original=input(),inactive={...original,state:{...original.state,carFlags:0}};
  expect(advanceNativeRaceFrame(inactive,data,()=>{throw new Error('Should not query');})).toMatchObject({state:inactive.state,skipped:true});
  expect(()=>advanceNativeRaceFrame({...original,equipmentFlags:0x3000},data,query)).not.toThrow();
  for(const change of [{sceneKind:28},{sceneFlags:0x400},{sceneByte0B:1}])
    expect(()=>advanceNativeRaceFrame({...original,...change},data,query)).toThrow('Unrecovered');
  for(const equipmentFlags of [4,8,0x0c])
    expect(()=>advanceNativeRaceFrame({...original,equipmentFlags},data,query)).toThrow(/0x0021E208/);
});

test('Flight Wing transitions before contact and uses active normal controls in that same frame',()=>{
  const original=input();
  const heldFitted=advanceNativeRaceFrame({...original,equipmentFlags:4,flightWingVelocityScalar:300,commands:0x8000},data,query);
  const activated=advanceNativeRaceFrame({...original,equipmentFlags:4,flightWingVelocityScalar:300.0001,commands:0x8000},data,query);
  const heldActive=advanceNativeRaceFrame({...original,equipmentFlags:8,flightWingVelocityScalar:300,commands:0x8000},data,query);
  const retracted=advanceNativeRaceFrame({...original,equipmentFlags:8,flightWingVelocityScalar:299.9999,commands:0x8000},data,query);
  expect(heldFitted.equipmentFlags).toBe(4);
  expect(activated.equipmentFlags).toBe(8);
  expect(heldActive.equipmentFlags).toBe(8);
  expect(retracted.equipmentFlags).toBe(4);
  expect(activated.state.matrix).not.toEqual(heldFitted.state.matrix);
  expect(heldActive.state.matrix).toEqual(activated.state.matrix);
  expect(retracted.state.matrix).toEqual(heldFitted.state.matrix);
});
test('Flight Wing active state suppresses responseW support and retraction restores it immediately',()=>{
  const original=input();
  const lowQuery:Parameters<typeof advanceNativeRaceFrame>[2]=p=>({point:[p[0],-1,p[2],0],flags:3,ceilingY:10000});
  const fitted=advanceNativeRaceFrame({...original,equipmentFlags:4,flightWingVelocityScalar:300,commands:0},data,lowQuery);
  const active=advanceNativeRaceFrame({...original,equipmentFlags:4,flightWingVelocityScalar:301,commands:0},data,lowQuery);
  const retracted=advanceNativeRaceFrame({...original,equipmentFlags:8,flightWingVelocityScalar:299,commands:0},data,lowQuery);
  expect(active.equipmentFlags).toBe(8);
  expect(fitted.state.contact.impulses).toEqual([89,89,89]);
  expect(active.state.contact.impulses).toEqual([0,0,0]);
  expect(retracted.equipmentFlags).toBe(4);
  expect(retracted.state.contact.impulses).toEqual(fitted.state.contact.impulses);
});

test('0x2000 boost consumes the native fuel field and preserves its signed cooldown state',()=>{
  expect(advanceNativeRaceBoostEquipment(4,8,2,0,40000)).toEqual({state:1,fuel:39900,forwardBonus:178,soundRequests:[16]});
  expect(advanceNativeRaceBoostEquipment(4,8,2,1,12050)).toEqual({state:2,fuel:11950,forwardBonus:44,soundRequests:[]});
  expect(advanceNativeRaceBoostEquipment(4,0,2,2,11950)).toEqual({state:-2,fuel:11950,forwardBonus:0,soundRequests:[0x8010]});
  expect(advanceNativeRaceBoostEquipment(4,0,2,-2,11950).state).toBe(-1);
  expect(advanceNativeRaceBoostEquipment(4,0,2,-1,11950).state).toBe(0);
  expect(advanceNativeRaceBoostEquipment(0,0,2,7,11950)).toMatchObject({state:0,soundRequests:[0x8010]});
});

test('0x1000 equipment control stays in -1..1 and applies PAL signed yaw steps',()=>{
  expect(advanceNativeRaceEquipmentYaw(0x20,0,1000,1024)).toEqual({verticalControl:-1,yaw:1000});
  expect(advanceNativeRaceEquipmentYaw(0x40,0,1000,1024)).toEqual({verticalControl:1,yaw:1000});
  expect(advanceNativeRaceEquipmentYaw(0x60,0,1000,1024)).toEqual({verticalControl:0,yaw:1000});
  expect(advanceNativeRaceEquipmentYaw(0x8000,0,1000,1024).yaw).toBe(998);
  expect(advanceNativeRaceEquipmentYaw(0x2000,0,1000,1024).yaw).toBe(1002);
  expect(advanceNativeRaceEquipmentYaw(0xa000,0,1000,1024).yaw).toBe(1002);
});
