import {Elf32AddressSpace} from '../formats/elf32';
import {readNativeRaceContactData,type NativeRaceContactState,type NativeRaceContactDependencies,type NativeRaceContactData} from './nativeRaceContact';
import {advanceNativeRaceContact,transformNativeRaceIntegerVector,nativeRaceNormalBasis,nativeRaceYawMatrix,
  readNativeRaceMathData,type NativeRaceMathData,type NativeRaceMatrix,type NativeRaceVector} from './nativeRaceMath';
import {advanceNativeRaceVehicleVelocity,integrateNativeRacePosition,nativeRaceDrag,nativeRacePositionCoordinates,
  type NativeRaceVehicleState,type NativeRaceEquipment} from './nativeRaceVehicle';
import {queryNativeRaceObstaclePoints,readNativeRaceObstacleData,type NativeRaceObstacleData} from './nativeRaceObstacle';
import {respondNativeRaceCollision} from './nativeRaceCollisionResponse';

export interface NativeRaceFrameData {
  readonly contact:NativeRaceContactData;
  readonly math:NativeRaceMathData;
  readonly obstacle:NativeRaceObstacleData;
  readonly bodySideDivisor:number;
  readonly bodyForwardDivisor:number;
  readonly bigTyreLift:number;
  readonly obstacleYawScale:number;
}
export function readNativeRaceFrameData(executable:Uint8Array):NativeRaceFrameData {
  const elf=new Elf32AddressSpace(executable),gp=0x3dd7f0;
  return {contact:readNativeRaceContactData(executable),math:readNativeRaceMathData(executable),obstacle:readNativeRaceObstacleData(executable),
    bodySideDivisor:elf.f32(gp-32472),bodyForwardDivisor:elf.f32(gp-32468),bigTyreLift:elf.f32(gp-32464),obstacleYawScale:elf.f32(gp-32596)};
}
export interface NativeRaceFrameState {
  readonly vehicle:NativeRaceVehicleState;
  readonly contact:NativeRaceContactState;
  readonly velocity:NativeRaceVector;
  readonly previousVelocity:NativeRaceVector;
  readonly matrix:NativeRaceMatrix;
  readonly inverse:NativeRaceMatrix;
  readonly bodyMatrix:NativeRaceMatrix;
  readonly coordinates:NativeRaceVector;
  readonly surfaces:readonly number[];
  readonly carFlags:number;
  readonly positionIndex:number;
  readonly distance:number;
  readonly countdownByte:number;
  readonly countdownHalf:number;
  readonly verticalControl:number;
  readonly shiftScheduleFlag:number;
}
export interface NativeRaceFrameInput {
  readonly state:NativeRaceFrameState;
  readonly equipment:NativeRaceEquipment;
  readonly equipmentFlags:number;
  readonly globalEquipmentFlags:number;
  readonly sceneFlags:number;
  readonly sceneKind:number;
  readonly sceneByte0B:number;
  readonly sceneTime:number;
  readonly raceModeByte:number;
  readonly commands:number;
  /** GP-selected callback, distinct from the car's +0x1FC schedule flag. */
  readonly highShiftSchedule:boolean;
  readonly obstaclePoints:readonly NativeRaceVector[];
}
const f=Math.fround;

/** 0x21C920 through 0x21D4EC: ordinary active frame up to wheel animation.
 * Commands are explicitly supplied at the 0x21B840 ownership/navigation boundary.
 * Reset/debug/special equipment paths are rejected until separately verified. */
export function advanceNativeRaceFrame(input:NativeRaceFrameInput,data:NativeRaceFrameData,query:NativeRaceContactDependencies['query']) {
  const {state}=input;
  if(input.sceneKind<0||input.sceneKind===28||input.sceneByte0B!==0||(input.sceneFlags&0x400)||(input.equipmentFlags&0x300c))
    throw new RangeError('Unrecovered race frame reset/debug/scene/equipment path.');
  if((input.sceneFlags&0x4a000)||!(state.carFlags&65535))return {state,sceneFlags:input.sceneFlags>>>0,contactFlags:0,obstacleFlags:0,
    diagnosticRequested:false,impactRequests:[],soundRequests:[],skipped:true};
  const carFlags=state.carFlags&0xfeff,oldYaw=state.vehicle.yaw;
  const previousVelocity:NativeRaceVector=[state.velocity[0],(state.velocity[1]-89)|0,state.velocity[2],state.velocity[3]];
  const difference=state.velocity.map((n,i)=>(n-state.previousVelocity[i]!)|0) as unknown as NativeRaceVector;
  const localDelta=transformNativeRaceIntegerVector(state.inverse,difference);
  const localVelocity=transformNativeRaceIntegerVector(state.inverse,previousVelocity);
  const gravity=transformNativeRaceIntegerVector(state.inverse,[0,89,0,0]);
  let forward=localVelocity[2];
  if((input.equipmentFlags&0x40)&&state.contact.specialState!==0) {
    if(input.commands&4)forward=(forward-89)|0;
    else if(input.commands&1)forward=(forward+89)|0;
  }
  const drag=nativeRaceDrag(forward,localVelocity[0],input.equipment.mass,state.contact.specialState,input.raceModeByte,state.positionIndex);
  const impulses=state.contact.impulses.map(n=>{
    const q=Math.trunc(n/(state.contact.specialState>0?64:1024)),amount=Math.trunc(Math.imul(q,q)/input.equipment.mass);
    return (n+(q<0?amount:-amount))|0;
  });
  const drive=advanceNativeRaceVehicleVelocity({...state.vehicle,runtimeFlags:0},input.equipment,{
    localForwardSpeed:drag.forward,localSideSpeed:drag.side,surfaceIndex:state.surfaces[0]!&7,
    driveContact:!!(state.contact.support[1]||state.contact.support[2]),contactAccelerationY:localDelta[1],
    contactAllowsYaw:!!(state.contact.support[0]||state.contact.support[1]||(state.contact.specialState&&(input.equipmentFlags&0x100))),
  },input.commands,input.sceneFlags,state.matrix,input.highShiftSchedule);
  const position=integrateNativeRacePosition(state.contact.position,[drive.worldVelocity[0],drive.worldVelocity[1],drive.worldVelocity[2]]);
  const verticalProduct=Math.imul(state.verticalControl,drag.forward);
  const verticalImpulse=state.contact.specialState>0?Math.trunc(verticalProduct/256):Math.trunc(((verticalProduct+drag.forward)|0)/2048);
  const contact=advanceNativeRaceContact({state:{...state.contact,position,referenceY:state.coordinates[1],
    yaw:drive.state.yaw,runtimeFlags:drive.state.runtimeFlags,impulses},equipmentFlags:input.equipmentFlags,
    globalEquipmentFlags:input.globalEquipmentFlags,carFlags,sceneFlags:input.sceneFlags,sceneByte0B:0,sceneCommands:[0,0],
    // 0x21B3AC clears the caller's local-delta X when curvature is zero.
    localX:drive.state.curvature===0?0:localDelta[0],localZ:localDelta[2],responseZ:drag.forward,responseW:gravity[1],verticalImpulse,commands:input.commands},
    data.contact,data.math,state.matrix,query);
  const coordinates:NativeRaceVector=[...nativeRacePositionCoordinates(contact.state.position),1];
  const inverseYaw=nativeRaceYawMatrix(f(f(-(drive.state.yaw<<16>>16)*data.obstacleYawScale)/32768),data.math);
  const obstacleFlags=queryNativeRaceObstaclePoints(input.obstaclePoints,coordinates,inverseYaw,f(coordinates[1]+1),data.obstacle);
  const response=respondNativeRaceCollision({position:contact.state.position,velocity:drive.worldVelocity,matrix:contact.matrix,inverse:contact.inverse,
    yaw:drive.state.yaw,previousYaw:oldYaw,collisionFlags:contact.flags|obstacleFlags,carFlags,positionIndex:state.positionIndex,
    sceneFlags:input.sceneFlags,sceneKind:input.sceneKind});
  const [front,left,right]=contact.state.support;
  const rearAverage=Math.trunc(((left!+right!)|0)/2);
  const bodyMatrix=nativeRaceNormalBasis([f(f((right!-left!)|0)/data.bodySideDivisor),1,
    f(f((front!-rearAverage)|0)/data.bodyForwardDivisor),0]);
  bodyMatrix[13]=f(f(f((Math.trunc(((front!+rearAverage)|0)/2)-4096)|0)*(-1/32768))+
    ((input.equipmentFlags&0x400)?data.bigTyreLift:0));
  const schedule=(((input.sceneTime-0xe484)>>>0)>0x1944c?1:0)^((input.commands&16)?1:0);
  return {state:{...state,vehicle:{...drive.state,yaw:response.yaw,runtimeFlags:contact.state.runtimeFlags},
    contact:{...contact.state,position:response.position,yaw:response.yaw,referenceY:coordinates[1]},
    velocity:response.velocity,previousVelocity,matrix:contact.matrix,inverse:contact.inverse,bodyMatrix,coordinates,surfaces:contact.surfaces,
    carFlags:response.carFlags,positionIndex:response.positionIndex,
    distance:response.carFlags&0x200?state.distance:(state.distance+Math.abs(drive.state.nativeSpeed))|0,
    countdownByte:state.countdownByte?((state.countdownByte-1)<<24>>24):0,
    countdownHalf:state.countdownHalf?((state.countdownHalf-1)<<16>>16):0,shiftScheduleFlag:schedule},
    sceneFlags:response.sceneFlags,contactFlags:contact.flags,obstacleFlags,diagnosticRequested:response.diagnosticRequested,
    impactRequests:[...contact.impactRequests,...response.impactRequests],soundRequests:contact.soundRequests,skipped:false};
}
