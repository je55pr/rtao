import {Elf32AddressSpace} from '../formats/elf32';
import {readFieldHeader} from '../formats/field';
import {transformNativeRaceVector,type NativeRaceMatrix,type NativeRaceVector} from './nativeRaceMath';

export interface NativeRaceObstacleData {readonly minimumX:number;readonly maximumX:number;}
export function readNativeRaceObstacleData(executable:Uint8Array): NativeRaceObstacleData {
  const elf=new Elf32AddressSpace(executable);
  return {minimumX:elf.f32(0x3dd7f0-32604),maximumX:elf.f32(0x3dd7f0-32600)};
}

/** Scene setup 0x20CA44..0x20CA84: 0x608 headers carry the relative point
 * pointer at +0x600 and count at +0x604; legacy 0x600 headers have no points. */
export function readNativeRaceObstaclePoints(course:Uint8Array): NativeRaceVector[] {
  const section=readFieldHeader(course).collision,v=new DataView(course.buffer,course.byteOffset,course.byteLength),base=section.offset;
  const first=v.getUint32(base,true);
  if(first===0x600)return [];
  if(first!==0x608||section.length<0x608)throw new RangeError('Unrecovered native obstacle directory.');
  const offset=v.getUint32(base+0x600,true),count=v.getUint32(base+0x604,true);
  if(offset<0x608||offset+count*16>section.length)throw new RangeError('Native obstacle points exceed the collision section.');
  return Array.from({length:count},(_,i)=>[0,4,8,12].map(n=>v.getFloat32(base+offset+i*16+n,true)) as unknown as NativeRaceVector);
}

/** 0x21AB60: authored (X,Y,Z,lower-height) records, supplied by the scene.
 * The record's W is a height filter, not the transform W: the delta uses W=0.
 * This iterator does not guess how scene +0xE8 supplies its record buffer. */
export function queryNativeRaceObstaclePoints(points:readonly NativeRaceVector[],position:NativeRaceVector,
  inverseYaw:NativeRaceMatrix,height:number,data:NativeRaceObstacleData):number {
  let flags=0;
  const f=Math.fround;
  for (const point of points) {
    const delta:NativeRaceVector=[f(f(point[0])-f(position[0])),f(f(point[1])-f(position[1])),f(f(point[2])-f(position[2])),0];
    if(f(height)<f(point[3])||delta[1]<0)continue;
    const local=transformNativeRaceVector(inverseYaw,delta),x=local[0],z=local[2];
    if(z>=0&&z<=1.5) {
      if(data.minimumX<=x&&x<0)flags|=1;
      else if(0<=x&&x<=data.maximumX)flags|=2;
    } else if(-1.5<=z&&z<0) {
      if(data.minimumX<=x&&x<0)flags|=4;
      else if(0<=x&&x<=data.maximumX)flags|=8;
    }
  }
  return flags;
}
