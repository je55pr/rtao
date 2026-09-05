import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {describe,expect,test} from 'vitest';
import {respondNativeRaceCollision,type NativeRaceCollisionResponseInput} from '../src/game/nativeRaceCollisionResponse';
import {inverseNativeRaceMatrix,multiplyNativeRaceMatrices,nativeRaceNormalBasis,nativeRaceYawMatrix,
  normalizeNativeRaceVector,readNativeRaceMathData} from '../src/game/nativeRaceMath';
import {PalScalarMachine} from '../test-support/palScalarMachine';

const executablePath=process.env.RTA_PAL_EXECUTABLE;
describe.skipIf(!executablePath)('PAL ordinary collision response',()=>{
  test('8192 cases match rollback, all mask combinations, impulses, velocity, yaw and effects without transform hooks',()=>{
    const elf=new Uint8Array(readFileSync(executablePath!)),math=readNativeRaceMathData(elf),m=new PalScalarMachine(elf),v=m.view;
    const car=0x1800000,scene=0x1801000,hash=createHash('sha256');
    let seed=0x21a510;
    const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed;};
    for(let i=0;i<8192;i++){
      const yaw=rand()&65535,radians=Math.fround(Math.fround((yaw<<16>>16)*Math.fround(Math.PI))/32768);
      const matrix=multiplyNativeRaceMatrices(nativeRaceNormalBasis(normalizeNativeRaceVector([0.2,1,-0.1,0])),nativeRaceYawMatrix(radians,math));
      const input:NativeRaceCollisionResponseInput={position:[rand()&0x0fffffff,rand()|0,rand()&0x0fffffff],
        velocity:[i%127===0?-2147483648:rand()%120001-60000,rand()%120001-60000,rand()%120001-60000,rand()|0],
        matrix,inverse:inverseNativeRaceMatrix(matrix),yaw,previousYaw:rand()&65535,
        collisionFlags:i%32,carFlags:[0,1,2,3,0x10,0x80,0x200,0x800][(i>>>5)%8]!,positionIndex:i%24,
        sceneFlags:i%3===0?0x40:4,sceneKind:[-1,0,23][i%3]!};
      m.memory.fill(0,car,scene+0x1000);
      input.matrix.forEach((n,j)=>v.setFloat32(car+j*4,n,true));
      input.inverse.forEach((n,j)=>v.setFloat32(car+0xb0+j*4,n,true));
      input.position.forEach((n,j)=>v.setInt32(car+0xa0+j*4,n,true));
      input.velocity.forEach((n,j)=>v.setInt32(car+0xf0+j*4,n,true));
      v.setUint16(car+0x1d4,input.yaw,true);v.setUint16(car+0x198,input.carFlags,true);v.setUint8(car+0x247,input.positionIndex);
      v.setUint32(scene+0x28,input.sceneFlags,true);v.setInt8(scene+0x22,input.sceneKind);
      let diagnosticRequested=false;
      const impactRequests:{channel:number;kind:number;strength:number}[]=[];
      m.run(0x21a510,[scene,car,input.collisionFlags,12345,input.previousYaw],{
        0x281c48:()=>{diagnosticRequested=true;return 0;},
        0x20b898:a=>{impactRequests.push({channel:a[1]!,kind:a[2]!,strength:a[3]!});return 0;},
      });
      const expected={position:[0,1,2].map(j=>v.getInt32(car+0xa0+j*4,true)),velocity:[0,1,2,3].map(j=>v.getInt32(car+0xf0+j*4,true)),
        yaw:v.getUint16(car+0x1d4,true),carFlags:v.getUint16(car+0x198,true),positionIndex:v.getUint8(car+0x247),
        sceneFlags:v.getUint32(scene+0x28,true),diagnosticRequested,impactRequests};
      expect(respondNativeRaceCollision(input),`case ${i} mask ${input.collisionFlags}`).toEqual(expected);
      hash.update(JSON.stringify({i,input,expected})+'\n');
    }
    const outputSha256=hash.digest('hex');
    if(process.env.RTA_RACE_RESPONSE_REPORT)writeFileSync(process.env.RTA_RACE_RESPONSE_REPORT,JSON.stringify({cases:8192,outputSha256,
      boundary:'Standard response (scene kind != 28). Matrices execute as original instructions; effects and diagnostic output are observed. No trajectory claim.'},null,2)+'\n');
  },60000);
});
