import {closeSync,fstatSync,openSync,readFileSync,readSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {describe,expect,test} from 'vitest';
import {advanceNativeRaceContact,multiplyNativeRaceMatrices,nativeRaceNormalBasis,nativeRaceYawMatrix,
  normalizeNativeRaceVector,readNativeRaceMathData} from '../src/game/nativeRaceMath';
import {readNativeRaceContactData,type NativeRaceContactInput} from '../src/game/nativeRaceContact';
import {NativeRaceCollisionSampler,type NativeRaceCollisionPoint as Point} from '../src/game/nativeRaceCollision';
import {palRaceContactOracle} from '../test-support/palRaceContactOracle';
import {Iso9660Disc} from '../src/disc/iso9660';
import {RawMode2SectorSource} from '../src/disc/randomAccess';
import {readCollisionChunkDirectory,readFieldHeader} from '../src/formats/field';
import {nativeRaceStartSeed,readRaceStartAnchors} from '../src/formats/raceCatalogue';

const executablePath=process.env.RTA_PAL_EXECUTABLE;
function baseline(): NativeRaceContactInput {
  return {state:{position:[0,0,0],referenceY:0,support:[4096,4096,4096],supportDelta:[0,0,0],impulses:[0,0,0],
    unsupportedTicks:0,runtimeFlags:0,specialState:0,yaw:0},equipmentFlags:0,globalEquipmentFlags:0,
    carFlags:2,sceneFlags:4,sceneByte0B:0,sceneCommands:[0,0],localX:0,localZ:0,responseZ:0,responseW:0,verticalImpulse:-89,commands:0};
}
function compare(actual:ReturnType<typeof advanceNativeRaceContact>,expected:ReturnType<ReturnType<typeof palRaceContactOracle>['run']>,context:string) {
  const {normal,matrix,inverse,missFlags:_miss,supportFlags:_support,...scalar}=actual;
  expect(scalar,context).toEqual(expected.result);
  expect({normal,matrix,inverse},context).toEqual(expected.geometry);
}
describe.skipIf(!executablePath)('PAL contact with native VU and orientation',()=>{
  test('2048 complete callers match without transform or orientation hooks',()=>{
    const elf=new Uint8Array(readFileSync(executablePath!)),contactData=readNativeRaceContactData(elf),mathData=readNativeRaceMathData(elf);
    const oracle=palRaceContactOracle(elf);
    let seed=0x67656f6d;
    const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed;};
    for(let i=0;i<2048;i++){
      const base=baseline(),yaw=rand()&65535;
      const input={...base,state:{...base.state,position:[rand()%0x2000000,rand()%65537-32768,rand()%0x2000000] as const,
        referenceY:Math.fround((rand()%65-32)/16),yaw,impulses:[rand()%401,rand()%401,rand()%401],unsupportedTicks:i%70},
        equipmentFlags:[0,8,0x100,0x400,0x508][i%5]!,globalEquipmentFlags:i%2?0x400:0,
        localX:rand()%2001-1000,localZ:rand()%2001-1000,responseZ:i%3?8192:8193,commands:[0,0x8000,0x2000][i%3]!};
      const previous=multiplyNativeRaceMatrices(nativeRaceNormalBasis(normalizeNativeRaceVector([0.1,1,0.2,0])),
        nativeRaceYawMatrix(Math.fround(Math.fround((yaw<<16>>16)*contactData.yawScale)/32768),mathData));
      const query=(p:Point,_sector:number,index:number)=>({point:[p[0],Math.fround((index%3-1)/2),p[2],i%3-1] as Point,
        flags:(i+index)%11===0?-1:3,ceilingY:i%7===0?0:10000});
      compare(advanceNativeRaceContact(input,contactData,mathData,previous,query),oracle.run(input,[],query,previous),`case ${i}`);
    }
  },60000);

  test.skipIf(!process.env.RTA_PAL_BIN)('360 native-yaw grids and 600 retained updates execute contact, collision and orientation instructions together',async()=>{
    const handle=openSync(process.env.RTA_PAL_BIN!,'r');
    try{
      const disc=await Iso9660Disc.open(new RawMode2SectorSource({size:fstatSync(handle).size,label:'local PAL BIN',async read(offset,length){
        const bytes=new Uint8Array(length);if(readSync(handle,bytes,0,length,offset)!==length)throw new Error('Short BIN read');return bytes;
      }}));
      const elf=new Uint8Array(readFileSync(executablePath!)),contactData=readNativeRaceContactData(elf),mathData=readNativeRaceMathData(elf);
      const oracle=palRaceContactOracle(elf),m=oracle.machine,v=m.view,anchors=readRaceStartAnchors(elf),directory=0x1000000;
      const digest=createHash('sha256');let grids=0,historyUpdates=0;
      for(let course=0;course<15;course++){
        const bytes=await disc.readFile(`COURSE/C${String(course).padStart(2,'0')}.BIN`),header=readFieldHeader(bytes);
        const chunks=readCollisionChunkDirectory(bytes,header).chunks,sampler=new NativeRaceCollisionSampler(bytes);
        m.memory.set(bytes.subarray(header.collision.offset,header.collision.offset+header.collision.length),directory);
        v.setUint32(oracle.scene+0x78,directory,true);
        for(const chunk of chunks)v.setUint32(directory+chunk.index*4,directory+chunk.relativeOffset,true);
        for(let slot=0;slot<24;slot++){
          const start=nativeRaceStartSeed(anchors[course]!,slot),base=baseline();
          let input:NativeRaceContactInput={...base,state:{...base.state,referenceY:start.nativeY,yaw:start.nativeYaw,
            position:[start.nativeX,start.nativeY,start.nativeZ].map(n=>Math.trunc(Math.fround(n*contactData.positionDivisor))) as [number,number,number]}};
          let palInput=input,previous=nativeRaceYawMatrix(Math.fround(Math.fround((start.nativeYaw<<16>>16)*contactData.yawScale)/32768),mathData),palPrevious=previous;
          const updates=course===0&&slot===0?601:1;
          for(let tick=0;tick<updates;tick++){
            const expected=oracle.run(palInput,[],undefined,palPrevious);
            const actual=advanceNativeRaceContact(input,contactData,mathData,previous,p=>sampler.query(p));
            compare(actual,expected,`course ${course} slot ${slot} tick ${tick}`);
            digest.update(JSON.stringify({course,slot,tick,result:expected.result,geometry:expected.geometry})+'\n');
            input={...input,state:actual.state};previous=actual.matrix;
            palInput={...palInput,state:{...expected.result.state,position:expected.result.state.position as [number,number,number]}};
            palPrevious=expected.geometry!.matrix;
            if(tick===0)grids++;else historyUpdates++;
          }
        }
      }
      expect(grids).toBe(360);expect(historyUpdates).toBe(600);
      const outputSha256=digest.digest('hex');
      expect(outputSha256).toBe('9802b940eaf1a341f4c29336e8ccdc72ea0b19d3c859f1e8230fff892c492151');
      if(process.env.RTA_RACE_GEOMETRY_REPORT)writeFileSync(process.env.RTA_RACE_GEOMETRY_REPORT,JSON.stringify({
        courses:15,grids,historyUpdates,queries:(grids+historyUpdates)*7,outputSha256,
        boundary:'No transform, orientation, collision or support hooks. Effects are observed. Contact-history updates are not moving vehicle trajectories.',
      },null,2)+'\n');
    }finally{closeSync(handle);}
  },60000);
});
