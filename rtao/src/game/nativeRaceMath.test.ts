import {expect,test} from 'vitest';
import {addNativeRaceVectors,crossNativeRaceVectors,inverseNativeRaceMatrix,multiplyNativeRaceMatrices,
  nativeRaceIdentity,nativeRaceNormalBasis,normalizeNativeRaceVector,transformNativeRaceVector,
  transformNativeRaceIntegerVector} from './nativeRaceMath';

test('native matrices use columns and include point W in translation',()=>{
  const matrix=[1,0,0,0,0,1,0,0,0,0,1,0,10,20,30,1];
  expect(transformNativeRaceVector(matrix,[2,3,4,1])).toEqual([12,23,34,1]);
  expect(transformNativeRaceVector(matrix,[2,3,4,0])).toEqual([2,3,4,0]);
  expect(addNativeRaceVectors([2,3,4,1],[10,20,30,1])).toEqual([12,23,34,2]);
});

test('cross orientation and zero normalization preserve the native finite path',()=>{
  expect(crossNativeRaceVectors([1,0,0,7],[0,1,0,9])).toEqual([0,0,1,0]);
  expect(normalizeNativeRaceVector([0,0,0,1])).toEqual([0,0,0,0]);
  expect(normalizeNativeRaceVector([0,3,4,9])).toEqual([0,Math.fround(3*Math.fround(0.2)),Math.fround(4*Math.fround(0.2)),0]);
  expect(nativeRaceNormalBasis([0,1,0,0])).toEqual([1,-0,0,0,0,1,0,0,-0,0,1,0,0,0,0,1]);
});

test('rigid inverse transposes rotation and transforms negative translation',()=>{
  const matrix=[0,0,-1,0,0,1,0,0,1,0,0,0,10,20,30,1];
  const inverse=inverseNativeRaceMatrix(matrix);
  expect(inverse).toEqual([0,0,1,0,0,1,0,0,-1,0,0,0,30,-20,-10,1]);
  expect(multiplyNativeRaceMatrices(matrix,inverse)).toEqual(nativeRaceIdentity());
});

test('VU accumulation rounds products before adding, rather than fusing them',()=>{
  const matrix=[1+2**-23,0,0,0,-(1+2**-22),0,0,0,0,0,0,0,0,0,0,0];
  expect(transformNativeRaceVector(matrix,[1+2**-23,1,0,0])).toEqual([0,0,0,0]);
});

test('integer movement transform ignores translation and W, truncates and saturates',()=>{
  const matrix=[0.5,0,0,0,0,2,0,0,0,0,-2,0,100,200,300,1];
  expect(transformNativeRaceIntegerVector(matrix,[-3,2147483647,2147483647,1]))
    .toEqual([-1,2147483647,-2147483648,0]);
  expect(transformNativeRaceIntegerVector(nativeRaceIdentity(),[16777217,-16777217,0,1]))
    .toEqual([16777216,-16777216,0,0]);
});
