import {expect,test} from 'vitest';
import {advanceNativeRaceFrame,type NativeRaceFrameData,type NativeRaceFrameInput} from './nativeRaceFrame';
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
    coordinates:[0,0,0,1],surfaces:Array(7).fill(0),carFlags:2,positionIndex:0,distance:0,countdownByte:0,countdownHalf:0,verticalControl:0,shiftScheduleFlag:0},
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
  for(const change of [{equipmentFlags:0x2000},{equipmentFlags:8},{sceneKind:28},{sceneFlags:0x400},{sceneByte0B:1}])
    expect(()=>advanceNativeRaceFrame({...original,...change},data,query)).toThrow('Unrecovered');
});
