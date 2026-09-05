import {expect,test} from 'vitest';
import {respondNativeRaceCollision,type NativeRaceCollisionResponseInput} from './nativeRaceCollisionResponse';
import {nativeRaceIdentity} from './nativeRaceMath';

function baseline(): NativeRaceCollisionResponseInput {
  return {position:[100000,100000,100000],velocity:[1000,2000,4000,7],matrix:nativeRaceIdentity(),inverse:nativeRaceIdentity(),
    yaw:100,previousYaw:50,collisionFlags:0,carFlags:2,positionIndex:0,sceneFlags:4,sceneKind:0};
}
test('high collision bits still roll position and yaw back when the response mask is zero',()=>{
  const actual=respondNativeRaceCollision({...baseline(),collisionFlags:16});
  expect(actual.position).toEqual([98720,97440,94880]);expect(actual.yaw).toBe(50);
  expect(actual.velocity).toEqual([1000,2000,4000,7]);expect(actual.impactRequests).toEqual([]);
});
test('mask five only pushes position while mask one also damps and turns',()=>{
  const five=respondNativeRaceCollision({...baseline(),collisionFlags:5});
  expect(five.position).toEqual([100030,97440,94880]);expect(five.velocity).toEqual([1000,2000,4000,7]);
  const one=respondNativeRaceCollision({...baseline(),collisionFlags:1});
  expect(one.position).toEqual([100030,97440,93570]);expect(one.velocity).toEqual([750,2000,3750,7]);expect(one.yaw).toBe(562);
});
test('all-side collision marks a controlled-car scene or removes an opponent',()=>{
  expect(respondNativeRaceCollision({...baseline(),collisionFlags:15})).toMatchObject({carFlags:2,sceneFlags:0x204,diagnosticRequested:true});
  expect(respondNativeRaceCollision({...baseline(),collisionFlags:15,carFlags:0x80,positionIndex:9}))
    .toMatchObject({carFlags:0,positionIndex:255,sceneFlags:4,diagnosticRequested:false});
  expect(()=>respondNativeRaceCollision({...baseline(),sceneKind:28})).toThrow('Scene-28');
});
