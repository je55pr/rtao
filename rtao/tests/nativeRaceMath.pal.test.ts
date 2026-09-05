import {readFileSync} from 'node:fs';
import {describe,expect,test} from 'vitest';
import {PalScalarMachine} from '../test-support/palScalarMachine';
import {addNativeRaceVectors,adjustNativeRaceNormal,crossNativeRaceVectors,inverseNativeRaceMatrix,multiplyNativeRaceMatrices,
  nativeRaceIdentity,nativeRaceNormalBasis,nativeRaceYawMatrix,normalizeNativeRaceVector,readNativeRaceMathData,
  transformNativeRaceVector,transformNativeRaceIntegerVector,type NativeRaceVector} from '../src/game/nativeRaceMath';

const executablePath=process.env.RTA_PAL_EXECUTABLE;
describe.skipIf(!executablePath)('PAL VU and orientation instructions',()=>{
  test('4096 signed integer movement transforms match PAL conversion and accumulation with aliased outputs',()=>{
    const m=new PalScalarMachine(new Uint8Array(readFileSync(executablePath!))),v=m.view;
    const out=0x1000000,a=0x1001000,b=0x1002000;
    let seed=0x21e188;
    const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed;};
    for(let i=0;i<4096;i++){
      const matrix=Array.from({length:16},()=>Math.fround((random()%20001-10000)/1024));
      const vector=Array.from({length:4},()=>random()|0) as unknown as NativeRaceVector;
      if(i===0) (vector as number[]).fill(0);
      if(i===1) (vector as number[]).splice(0,4,2147483647,-2147483648,16777217,-16777217);
      for(const dest of [out,a,b]){
        matrix.forEach((n,j)=>v.setFloat32(a+j*4,n,true));
        vector.forEach((n,j)=>v.setInt32(b+j*4,n,true));
        m.run(0x21e188,[dest,a,b]);
        expect(Array.from({length:4},(_,j)=>v.getInt32(dest+j*4,true)),`integer transform ${i}`)
          .toEqual(transformNativeRaceIntegerVector(matrix,vector));
      }
    }
  });

  test('4096 vectors and matrices match original transform, add, cross, normalize, multiply and rigid inverse instructions',()=>{
    const m=new PalScalarMachine(new Uint8Array(readFileSync(executablePath!))),v=m.view;
    const out=0x1000000,a=0x1001000,b=0x1002000;
    const put=(p:number,n:readonly number[])=>n.forEach((x,i)=>v.setFloat32(p+i*4,x,true));
    const read=(p:number,n:number)=>Array.from({length:n},(_,i)=>v.getFloat32(p+i*4,true));
    let seed=0x76753030;
    const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return Math.fround((seed%20001-10000)/1024);};
    for(let i=0;i<4096;i++){
      const vector=Array.from({length:4},random) as unknown as NativeRaceVector;
      const second=Array.from({length:4},random) as unknown as NativeRaceVector;
      const matrix=Array.from({length:16},random),other=Array.from({length:16},random);
      if(i<4) {vector.forEach((_x,j)=>(vector as number[])[j]=i===0?0:j===i-1?1:0);}
      for(const alias of [false,true]){
        const dest=alias?a:out;
        put(a,matrix);put(b,vector);m.run(0x275770,[dest,a,b]);
        expect(read(dest,4),`transform ${i}`).toEqual(transformNativeRaceVector(matrix,vector));
        put(a,vector);put(b,second);m.run(0x275990,[dest,a,b]);
        expect(read(dest,4),`add ${i}`).toEqual(addNativeRaceVectors(vector,second));
        put(a,vector);put(b,second);m.run(0x2757e8,[dest,a,b]);
        expect(read(dest,4),`cross ${i}`).toEqual(crossNativeRaceVectors(vector,second));
        put(a,vector);m.run(0x275830,[dest,a]);
        expect(read(dest,4),`normal ${i}`).toEqual(normalizeNativeRaceVector(vector));
        put(a,matrix);put(b,other);m.run(0x2757a0,[dest,a,b]);
        expect(read(dest,16),`multiply ${i}`).toEqual(multiplyNativeRaceMatrices(matrix,other));
        put(a,matrix);m.run(0x2758b8,[dest,a]);
        expect(read(dest,16),`inverse ${i}`).toEqual(inverseNativeRaceMatrix(matrix));
      }
    }
  },60000);

  test('every signed 16-bit car yaw matches the original VU polynomial and rotation constructor',()=>{
    const elf=new Uint8Array(readFileSync(executablePath!)),data=readNativeRaceMathData(elf),m=new PalScalarMachine(elf),v=m.view;
    const a=0x1000000,out=0x1001000;
    for(let yaw=-32768;yaw<32768;yaw++){
      const radians=Math.fround(Math.fround(yaw*Math.fround(Math.PI))/32768);
      nativeRaceIdentity().forEach((n,i)=>v.setFloat32(a+i*4,n,true));
      m.run(0x275c88,[out,a],{},{floats:{12:radians}});
      expect(Array.from({length:16},(_,i)=>v.getFloat32(out+i*4,true)),`yaw ${yaw}`)
        .toEqual(nativeRaceYawMatrix(radians,data));
    }
  },60000);

  test('4096 normal bases, adjustments and orientation yaw compositions execute without helper hooks',()=>{
    const elf=new Uint8Array(readFileSync(executablePath!)),data=readNativeRaceMathData(elf),m=new PalScalarMachine(elf),v=m.view;
    const a=0x1000000,out=0x1001000;
    let seed=0x6e6f726d;
    const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return Math.fround((seed%20001-10000)/10000);};
    for(let i=0;i<4096;i++){
      const normal=normalizeNativeRaceVector([random(),Math.abs(random()),random(),0]);
      const angle=Math.fround(random()*Math.PI),mode=[1,64,128,192][i%4]!;
      normal.forEach((n,j)=>v.setFloat32(a+j*4,n,true));
      m.run(0x2086c0,[out,a]);
      const basis=nativeRaceNormalBasis(normal);
      expect(Array.from({length:16},(_,j)=>v.getFloat32(out+j*4,true)),`basis ${i}`).toEqual(basis);
      m.run(0x208738,[out],{},{floats:{12:angle}});
      expect(Array.from({length:16},(_,j)=>v.getFloat32(out+j*4,true)),`orientation ${i}`)
        .toEqual(multiplyNativeRaceMatrices(basis,nativeRaceYawMatrix(angle,data)));
      m.run(0x21a368,[a,mode],{},{floats:{12:angle}});
      expect(Array.from({length:4},(_,j)=>v.getFloat32(a+j*4,true)),`adjustment ${i}`)
        .toEqual(adjustNativeRaceNormal(normal,mode,angle,data));
    }
  },60000);
});
