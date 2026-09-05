import {closeSync,fstatSync,openSync,readFileSync,readSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {describe,expect,test} from 'vitest';
import {advanceNativeRaceFrame,readNativeRaceFrameData,type NativeRaceFrameInput,type NativeRaceFrameState} from '../src/game/nativeRaceFrame';
import {createNativeRaceVehicleState,readNativeRaceEquipment} from '../src/game/nativeRaceVehicle';
import {inverseNativeRaceMatrix,nativeRaceIdentity,nativeRaceYawMatrix} from '../src/game/nativeRaceMath';
import {readNativeRaceObstaclePoints} from '../src/game/nativeRaceObstacle';
import {NativeRaceCollisionSampler} from '../src/game/nativeRaceCollision';
import {palRaceFrameOracle} from '../test-support/palRaceFrameOracle';
import {Iso9660Disc} from '../src/disc/iso9660';
import {RawMode2SectorSource} from '../src/disc/randomAccess';
import {nativeRaceStartSeed,readRaceStartAnchors} from '../src/formats/raceCatalogue';

const executablePath=process.env.RTA_PAL_EXECUTABLE;
function initial():NativeRaceFrameState {
  return {vehicle:createNativeRaceVehicleState(0),contact:{position:[0,0,0],referenceY:0,support:[4096,4096,4096],supportDelta:[0,0,0],
    impulses:[0,0,0],unsupportedTicks:0,runtimeFlags:0,specialState:0,yaw:0},velocity:[0,0,0,0],previousVelocity:[0,0,0,0],
    matrix:nativeRaceIdentity(),inverse:nativeRaceIdentity(),bodyMatrix:nativeRaceIdentity(),coordinates:[0,0,0,1],surfaces:Array(7).fill(0),
    carFlags:2,positionIndex:0,distance:0,countdownByte:0,countdownHalf:0,verticalControl:0,shiftScheduleFlag:0};
}
function inputFor(elf:Uint8Array,state:NativeRaceFrameState):NativeRaceFrameInput {
  return {state,equipment:readNativeRaceEquipment(elf,[0,0,0,0,0,0,0]),equipmentFlags:0,globalEquipmentFlags:0,
    sceneFlags:4,sceneKind:0,sceneByte0B:0,sceneTime:0,raceModeByte:0,commands:1,highShiftSchedule:true,obstaclePoints:[]};
}
describe.skipIf(!executablePath)('PAL assembled ordinary vehicle frame',()=>{
  test('1024 complete update cases match independently executed gravity, drive, support, orientation and response',()=>{
    const elf=new Uint8Array(readFileSync(executablePath!)),data=readNativeRaceFrameData(elf),oracle=palRaceFrameOracle(elf);
    let seed=0x21c920;
    const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed;};
    for(let i=0;i<1024;i++){
      const yaw=rand()&65535,base=initial(),matrix=nativeRaceYawMatrix(Math.fround(Math.fround((yaw<<16>>16)*data.contact.yawScale)/32768),data.math);
      const state={...base,vehicle:{...base.vehicle,yaw,nativeSpeed:rand()%40001-20000},
        contact:{...base.contact,yaw,impulses:[0,rand()%1001,rand()%1001],support:[4096,i%2?4096:0,4096],specialState:i%3-1},
        velocity:[rand()%40001-20000,rand()%2001-1000,rand()%40001-20000,0] as const,
        previousVelocity:[rand()%40001-20000,rand()%2001-1000,rand()%40001-20000,0] as const,
        matrix,inverse:inverseNativeRaceMatrix(matrix),countdownByte:i%5?0:32,countdownHalf:i%7?0:128,carFlags:i%2?2:0x80};
      const input={...inputFor(elf,state),equipmentFlags:[0,0x40,0x100,0x400][i%4]!,
        sceneTime:rand()%200001,highShiftSchedule:!!(i%2),commands:[0,1,2,3,5,0x2001,0x8001,0x11][i%8]!,
        obstaclePoints:[[0,2,0,-2] as const]};
      const query:Parameters<typeof advanceNativeRaceFrame>[2]=(p,_sector,index)=>({point:[p[0],Math.fround((index%3-1)/8),p[2],0],flags:i%17===0?-1:3,ceilingY:10000});
      expect(advanceNativeRaceFrame(input,data,query),`case ${i}`).toEqual(oracle.run(input,query));
    }
  },60000);

  test.skipIf(!process.env.RTA_PAL_BIN)('moving input sequences retain independent native state on original PAL courses',async()=>{
    const handle=openSync(process.env.RTA_PAL_BIN!,'r');
    try{
      const disc=await Iso9660Disc.open(new RawMode2SectorSource({size:fstatSync(handle).size,label:'local PAL BIN',async read(offset,length){
        const b=new Uint8Array(length);if(readSync(handle,b,0,length,offset)!==length)throw new Error('Short PAL BIN read');return b;
      }}));
      const elf=new Uint8Array(readFileSync(executablePath!)),data=readNativeRaceFrameData(elf),anchors=readRaceStartAnchors(elf),hash=createHash('sha256');
      const discElf=await disc.readFile('SLES_513.56');
      expect(createHash('sha256').update(discElf).digest('hex')).toBe(createHash('sha256').update(elf).digest('hex'));
      const summaries=[];let totalUpdates=0;
      for(const course of [0,3,7]){
        const bytes=await disc.readFile(`COURSE/C${String(course).padStart(2,'0')}.BIN`),sampler=new NativeRaceCollisionSampler(bytes),points=readNativeRaceObstaclePoints(bytes);
        const oracle=palRaceFrameOracle(elf);oracle.loadCourse(bytes);
        const start=nativeRaceStartSeed(anchors[course]!,0),base=initial();
        const matrix=nativeRaceYawMatrix(Math.fround(Math.fround((start.nativeYaw<<16>>16)*data.contact.yawScale)/32768),data.math);
        let actual:NativeRaceFrameState={...base,vehicle:createNativeRaceVehicleState(start.nativeYaw),
          contact:{...base.contact,position:[start.nativeX,start.nativeY,start.nativeZ].map(n=>Math.trunc(Math.fround(n*data.contact.positionDivisor))) as [number,number,number],
            referenceY:start.nativeY,yaw:start.nativeYaw},coordinates:[start.nativeX,start.nativeY,start.nativeZ,1],matrix,inverse:inverseNativeRaceMatrix(matrix)};
        let native=actual,sceneFlags=4,collisionUpdates=0;
        const origin=[...actual.contact.position],checkpoints=[];
        for(let tick=0;tick<600;tick++){
          const commands=tick<180?1:tick<240?0x2001:tick<360?1:tick<420?2:tick<480?5:0x8001;
          const input={...inputFor(elf,actual),commands,sceneFlags,sceneTime:tick,obstaclePoints:points};
          const expected=oracle.run({...input,state:native});
          const next=advanceNativeRaceFrame(input,data,p=>sampler.query(p));
          expect(next,`course ${course} tick ${tick} command ${commands}`).toEqual(expected);
          actual=next.state;native=expected.state;sceneFlags=expected.sceneFlags;
          if(expected.contactFlags||expected.obstacleFlags)collisionUpdates++;
          if([0,179,239,359,419,479,599].includes(tick))checkpoints.push({tick,commands,state:expected.state,
            contactFlags:expected.contactFlags,obstacleFlags:expected.obstacleFlags});
          hash.update(JSON.stringify({course,tick,result:expected})+'\n');totalUpdates++;
        }
        expect(actual.contact.position).not.toEqual(origin);
        expect(actual.distance).toBeGreaterThan(0);
        expect(collisionUpdates).toBeGreaterThan(0);
        summaries.push({course,updates:600,obstaclePoints:points.length,collisionUpdates,finalPosition:actual.contact.position,distance:actual.distance,checkpoints});
      }
      const outputSha256=hash.digest('hex');
      expect(outputSha256).toBe('7f34e9c3d1575f46e88d6ae59bf2a478438356909e836757073c8e9e6ce74b9e');
      if(process.env.RTA_RACE_FRAME_REPORT)writeFileSync(process.env.RTA_RACE_FRAME_REPORT,JSON.stringify({totalUpdates,courses:summaries,outputSha256,
        boundary:'Original course collision/obstacles and native frame instructions through body/distance. Commands are supplied; effects/memset are hooks. Wheel animation, reset/debug and equipment 0x300C remain outside this gate. No playable race claim.'},null,2)+'\n');
    }finally{closeSync(handle);}
  },120000);
});
