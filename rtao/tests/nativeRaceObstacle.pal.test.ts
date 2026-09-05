import {readFileSync,openSync,closeSync,fstatSync,readSync} from 'node:fs';
import {describe,expect,test} from 'vitest';
import {queryNativeRaceObstaclePoints,readNativeRaceObstacleData,readNativeRaceObstaclePoints} from '../src/game/nativeRaceObstacle';
import {nativeRaceYawMatrix,readNativeRaceMathData,type NativeRaceVector} from '../src/game/nativeRaceMath';
import {PalScalarMachine} from '../test-support/palScalarMachine';
import {Iso9660Disc} from '../src/disc/iso9660';
import {RawMode2SectorSource} from '../src/disc/randomAccess';
import {readFieldHeader} from '../src/formats/field';

const executablePath=process.env.RTA_PAL_EXECUTABLE;
describe.skipIf(!executablePath)('PAL obstacle point iterator',()=>{
  test.skipIf(!process.env.RTA_PAL_BIN)('all 15 course point buffers match the native header pointer/count and wrapper query',async()=>{
    const fd=openSync(process.env.RTA_PAL_BIN!,'r');
    try{
      const disc=await Iso9660Disc.open(new RawMode2SectorSource({size:fstatSync(fd).size,label:'local PAL BIN',async read(offset,length){
        const b=new Uint8Array(length);if(readSync(fd,b,0,length,offset)!==length)throw new Error('Short PAL BIN read');return b;
      }}));
      const elf=new Uint8Array(readFileSync(executablePath!)),m=new PalScalarMachine(elf),v=m.view,data=readNativeRaceObstacleData(elf),math=readNativeRaceMathData(elf);
      const directory=0x1000000,car=0x1800000,scene=0x1801000;let totalPoints=0;
      for(let course=0;course<15;course++){
        const bytes=await disc.readFile(`COURSE/C${String(course).padStart(2,'0')}.BIN`),section=readFieldHeader(bytes).collision;
        m.memory.set(bytes.subarray(section.offset,section.offset+section.length),directory);
        const points=readNativeRaceObstaclePoints(bytes),pointer=directory+v.getUint32(directory+0x600,true),count=v.getUint32(directory+0x604,true);
        expect(points.length).toBe(count);totalPoints+=count;
        // Execute the setup pointer producer, not a JavaScript reconstruction.
        m.run(0x20ca68,[],{},{registers:{3:0x608,5:directory,16:scene,20:8},stopAt:0x20ca90});
        expect(v.getUint32(scene+0xf0,true)).toBe(pointer);
        for(let j=0;j<count;j++)expect(points[j]).toEqual(Array.from({length:4},(_,k)=>v.getFloat32(pointer+j*16+k*4,true)));
        v.setUint32(scene+0x78,directory,true);v.setInt32(scene+0x68,course,true);v.setInt8(scene+0x22,course);
        for(const yaw of [0,8192,16384,32768]){
          const point=points[0]??[0,0,0,0],position:NativeRaceVector=[point[0],point[1],point[2],1];
          position.forEach((n,j)=>v.setFloat32(car+0x90+j*4,n,true));v.setUint16(car+0x1d4,yaw,true);
          const radians=Math.fround(Math.fround(-(yaw<<16>>16)*Math.fround(Math.PI))/32768);
          const expected=m.run(0x21ad88,[scene,car],{},{maxSteps:150000});
          expect(queryNativeRaceObstaclePoints(points,position,nativeRaceYawMatrix(radians,math),Math.fround(position[1]+1),data)).toBe(expected);
        }
      }
      expect(totalPoints).toBe(1547);
    }finally{closeSync(fd);}
  });
  test('4096 authored-point cases match height filters, quadrants and accumulation with the native transform',()=>{
    const elf=new Uint8Array(readFileSync(executablePath!)),data=readNativeRaceObstacleData(elf),math=readNativeRaceMathData(elf);
    const m=new PalScalarMachine(elf),v=m.view,pointsAddress=0x1800000,car=0x1801000,matrixAddress=0x1802000;
    let seed=0x21ab60;
    const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed;};
    const bits=new Set<number>();
    for(let i=0;i<4096;i++){
      const position:NativeRaceVector=[Math.fround((rand()%101-50)/16),Math.fround((rand()%101-50)/16),Math.fround((rand()%101-50)/16),1];
      const radians=Math.fround(Math.fround(((rand()&65535)<<16>>16)*Math.fround(Math.PI))/32768);
      const matrix=nativeRaceYawMatrix(radians,math),height=Math.fround(position[1]+1);
      const points=Array.from({length:i%17},()=>[Math.fround(position[0]+(rand()%65-32)/16),
        Math.fround(position[1]+(rand()%33-8)/16),Math.fround(position[2]+(rand()%65-32)/16),
        Math.fround(height+(rand()%5-3)/16)] as NativeRaceVector);
      position.forEach((n,j)=>v.setFloat32(car+0x90+j*4,n,true));
      matrix.forEach((n,j)=>v.setFloat32(matrixAddress+j*4,n,true));
      points.forEach((point,j)=>point.forEach((n,k)=>v.setFloat32(pointsAddress+j*16+k*4,n,true)));
      const expected=m.run(0x21ab60,[pointsAddress,car,matrixAddress,points.length],{},{floats:{12:height}});
      expect(queryNativeRaceObstaclePoints(points,position,matrix,height,data),`case ${i}`).toBe(expected);
      bits.add(expected);
    }
    expect(bits.size).toBe(16);
  });
});
