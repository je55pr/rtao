import {expect,test} from 'vitest';
import {queryNativeRaceObstaclePoints} from './nativeRaceObstacle';
import {nativeRaceIdentity,type NativeRaceVector} from './nativeRaceMath';

test('obstacle quadrants include outer boundaries and put the centre on the positive side',()=>{
  const query=(point:NativeRaceVector)=>queryNativeRaceObstaclePoints([point],[0,0,0,1],nativeRaceIdentity(),1,{minimumX:-1,maximumX:1});
  expect(query([-1,0,1.5,1])).toBe(1);expect(query([1,0,1.5,1])).toBe(2);
  expect(query([-1,0,-1.5,1])).toBe(4);expect(query([1,0,-1.5,1])).toBe(8);
  expect(query([0,0,0,1])).toBe(2);expect(query([0,-0.1,0,1])).toBe(0);
  expect(query([0,0,0,1.01])).toBe(0);expect(query([0,0,1.51,1])).toBe(0);
});
