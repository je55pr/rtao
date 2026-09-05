import {readFieldHeader,readCollisionChunkDirectory} from '../src/formats/field';
import type {NativeRaceFrameInput,NativeRaceFrameState} from '../src/game/nativeRaceFrame';
import type {NativeRaceContactDependencies} from '../src/game/nativeRaceContact';
import {PalScalarMachine} from './palScalarMachine';

/** Executes the enclosing frame through body orientation/distance, stopping at
 * wheel animation. Commands, effects, memset and optional synthetic queries are
 * the only hooks. The frame retains its own state independently of production. */
export function palRaceFrameOracle(executable:Uint8Array) {
  const m=new PalScalarMachine(executable),v=m.view,car=0x1800000,scene=0x1801000,object=0x1802000,
    equipment=0x1803000,globalEquipment=0x1804000,curve=0x1805000,directory=0x1000000,syntheticPoints=0x1806000;
  const ints=(address:number,n:number)=>Array.from({length:n},(_,i)=>v.getInt32(address+i*4,true));
  const floats=(address:number,n:number)=>Array.from({length:n},(_,i)=>v.getFloat32(address+i*4,true));
  const putInts=(address:number,values:readonly number[])=>values.forEach((n,i)=>v.setInt32(address+i*4,n,true));
  const putFloats=(address:number,values:readonly number[])=>values.forEach((n,i)=>v.setFloat32(address+i*4,n,true));
  let originalCourse=false;
  return {machine:m,
    loadCourse(bytes:Uint8Array){
      const header=readFieldHeader(bytes),chunks=readCollisionChunkDirectory(bytes,header).chunks;
      m.memory.set(bytes.subarray(header.collision.offset,header.collision.offset+header.collision.length),directory);
      v.setUint32(scene+0x78,directory,true);v.setInt32(scene+0x68,0,true);
      const first=v.getUint32(directory,true);
      v.setUint32(scene+0xf0,first===0x608?directory+v.getUint32(directory+0x600,true):0,true);
      for(const chunk of chunks)v.setUint32(directory+chunk.index*4,directory+chunk.relativeOffset,true);
      originalCourse=true;
    },
    run(input:NativeRaceFrameInput,query?:NativeRaceContactDependencies['query']) {
      m.memory.fill(0,car,car+0x1000);
      const s=input.state,e=input.equipment;
      putFloats(car,s.matrix);putFloats(car+0x40,s.bodyMatrix);putFloats(car+0x90,s.coordinates);putFloats(car+0xb0,s.inverse);
      putInts(car+0xa0,s.contact.position);putInts(car+0xf0,s.velocity);putInts(car+0x100,s.previousVelocity);
      putInts(car+0x19c,s.surfaces);putInts(car+0x1c0,s.contact.impulses);putInts(car+0x1dc,s.contact.support);putInts(car+0x1e8,s.contact.supportDelta);
      v.setUint32(car+0x184,equipment,true);v.setUint32(car+0x200,curve,true);m.memory.set(e.brakeCurve,curve);
      v.setUint16(equipment+8,input.equipmentFlags,true);v.setUint32(0x1824270,globalEquipment,true);v.setUint16(globalEquipment+8,input.globalEquipmentFlags,true);
      for(const [off,n] of [[0x214,e.engineScalar],[0x218,e.mass],[0x23c,s.vehicle.fuel],[0x1d8,s.vehicle.steeringSpeedMemory],
        [0x1b8,s.vehicle.nativeSpeed],[0x1bc,s.vehicle.wheelSpeed],[0x1f4,s.contact.unsupportedTicks],[0x1f8,s.vehicle.runtimeFlags],[0x204,s.distance]])v.setInt32(car+off!,n!,true);
      for(const [off,n] of [[0x198,s.carFlags],[0x240,e.fuelConsumption],[0x242,e.steeringScalar],[0x1cc,s.vehicle.curvature],
        [0x1ce,s.vehicle.steeringAccumulator],[0x1d0,s.vehicle.engineSpeed],[0x1d4,s.vehicle.yaw],[0x1d6,s.vehicle.slipAngle],
        [0x1d2,s.vehicle.driftRate],[0x210,s.countdownHalf]])v.setInt16(car+off!,n!,true);
      e.surfaceGrips.forEach((n,i)=>v.setInt16(car+0x21c+i*2,n,true));e.gearWords.forEach((n,i)=>v.setInt16(car+0x22c+i*2,n,true));
      for(const [off,n] of [[0x1ff,s.vehicle.gear],[0x1fe,s.vehicle.brakeHold],[0x1fc,s.shiftScheduleFlag],[0x213,s.contact.specialState],
        [0x212,s.countdownByte],[0x244,s.verticalControl],[0x247,s.positionIndex]])v.setUint8(car+off!,n!);
      v.setUint32(object+0x28,car,true);v.setUint32(scene+0x28,input.sceneFlags,true);v.setInt8(scene+0x22,input.sceneKind);
      v.setUint8(scene+0xb,input.sceneByte0B);v.setUint8(scene+0xa,input.raceModeByte);v.setUint32(scene+0x14,input.sceneTime,true);
      v.setUint32(0x3dd7f0-16024,input.highShiftSchedule?0x21dcf8:0x21de30,true);v.setUint32(0x3dd7f0-15968,0x208c50,true);
      if(!originalCourse){
        v.setUint32(scene+0x78,directory,true);v.setInt32(scene+0x68,0,true);v.setUint32(scene+0xf0,syntheticPoints,true);
        v.setUint32(directory+0x604,input.obstaclePoints.length,true);input.obstaclePoints.forEach((p,i)=>putFloats(syntheticPoints+i*16,p));
      }
      let contactFlags=0,obstacleFlags=0,diagnosticRequested=false,queryIndex=0;
      const impactRequests:{channel:number;kind:number;strength:number}[]=[],soundRequests:number[]=[];
      const hooks:Record<number,(a:readonly number[])=>number>={
        0x21b840:()=>input.commands,
        0x281a58:a=>{m.memory.fill(a[1]!,a[0]!,a[0]!+a[2]!);return a[0]!;},
        0x218b18:()=>0,
        0x20b898:a=>{impactRequests.push({channel:a[1]!,kind:a[2]!,strength:a[3]!});return 0;},
        0x25b2c8:a=>{soundRequests.push(a[0]!);return 0;},
        0x281c48:()=>{diagnosticRequested=true;return 0;},
      };
      if(query)hooks[0x208c50]=a=>{
        const result=query(floats(a[0]!,4) as [number,number,number,number],a[3]!,queryIndex++);
        putFloats(a[0]!,result.point);v.setFloat32(a[1]!,result.ceilingY,true);return result.flags;
      };
      m.run(0x21c920,[object,scene],hooks,{stopAt:0x21d4ec,maxSteps:500000,
        observe:{0x21d2ec:()=>{contactFlags=m.register(2);},0x21d380:()=>{obstacleFlags=m.register(2);}}});
      const state:NativeRaceFrameState={...s,vehicle:{gear:v.getInt8(car+0x1ff),brakeHold:v.getUint8(car+0x1fe),
        steeringAccumulator:v.getInt16(car+0x1ce,true),steeringSpeedMemory:v.getInt32(car+0x1d8,true),curvature:v.getInt16(car+0x1cc,true),
        engineSpeed:v.getInt16(car+0x1d0,true),nativeSpeed:v.getInt32(car+0x1b8,true),wheelSpeed:v.getInt32(car+0x1bc,true),
        fuel:v.getInt32(car+0x23c,true),yaw:v.getUint16(car+0x1d4,true),slipAngle:v.getInt16(car+0x1d6,true),
        driftRate:v.getInt16(car+0x1d2,true),runtimeFlags:v.getUint32(car+0x1f8,true)},
        contact:{...s.contact,position:ints(car+0xa0,3) as [number,number,number],referenceY:v.getFloat32(car+0x94,true),
          yaw:v.getUint16(car+0x1d4,true),support:ints(car+0x1dc,3),supportDelta:ints(car+0x1e8,3),impulses:ints(car+0x1c0,3),
          unsupportedTicks:v.getInt32(car+0x1f4,true),runtimeFlags:v.getUint32(car+0x1f8,true),specialState:v.getInt8(car+0x213)},
        velocity:ints(car+0xf0,4) as [number,number,number,number],previousVelocity:ints(car+0x100,4) as [number,number,number,number],
        matrix:floats(car,16),inverse:floats(car+0xb0,16),bodyMatrix:floats(car+0x40,16),coordinates:floats(car+0x90,4) as [number,number,number,number],
        surfaces:ints(car+0x19c,7),carFlags:v.getUint16(car+0x198,true),positionIndex:v.getUint8(car+0x247),distance:v.getInt32(car+0x204,true),
        countdownByte:v.getInt8(car+0x212),countdownHalf:v.getInt16(car+0x210,true),verticalControl:v.getInt8(car+0x244),shiftScheduleFlag:v.getUint8(car+0x1fc)};
      return {state,sceneFlags:v.getUint32(scene+0x28,true),contactFlags,obstacleFlags,diagnosticRequested,impactRequests,soundRequests,
        skipped:!!((input.sceneFlags&0x4a000)||!(s.carFlags&65535))};
    },
  };
}
