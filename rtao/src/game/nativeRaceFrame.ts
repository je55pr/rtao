import {Elf32AddressSpace} from '../formats/elf32';
import {readNativeRaceContactData,type NativeRaceContactState,type NativeRaceContactDependencies,type NativeRaceContactData} from './nativeRaceContact';
import {advanceNativeRaceContact,transformNativeRaceIntegerVector,nativeRaceYawMatrix,
  readNativeRaceMathData,type NativeRaceMathData,type NativeRaceMatrix,type NativeRaceVector} from './nativeRaceMath';
import {nativeRaceBodyMatrix,readNativeRaceBodyData} from './nativeRaceBody';
import {advanceNativeRaceVehicleVelocity,integrateNativeRacePosition,nativeRaceDrag,nativeRacePositionCoordinates,
  type NativeRaceVehicleState,type NativeRaceEquipment} from './nativeRaceVehicle';
import type {NativeRaceDriftPolicy} from './nativeRaceTraction';
import {queryNativeRaceObstaclePoints,readNativeRaceObstacleData,type NativeRaceObstacleData} from './nativeRaceObstacle';
import {respondNativeRaceCollision} from './nativeRaceCollisionResponse';
import {advanceNativeFlightWingFlags,nativeSpecialAbilityFlags} from './nativeSpecialAbilityRuntime';

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
    ...readNativeRaceBodyData(executable),obstacleYawScale:elf.f32(gp-32596)};
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
  readonly equipmentBoostState:number;
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
  /** Exact f0 returned by PAL helper 0x0021E208 for car+0xF0. Its formula is not reconstructed here. */
  readonly flightWingVelocityScalar?:number;
  /** GP-selected callback, distinct from the car's +0x1FC schedule flag. */
  readonly highShiftSchedule:boolean;
  readonly obstaclePoints:readonly NativeRaceVector[];
  /** Browser gameplay may opt out of PAL's one-sided signed drift ramp. */
  readonly driftPolicy?:NativeRaceDriftPolicy;
}
const f=Math.fround;

export function advanceNativeRaceBoostEquipment(sceneFlags:number,commands:number,carFlags:number,state:number,fuel:number) {
  let nextState=state<<16>>16,nextFuel=fuel|0,forwardBonus=0;
  const soundRequests:number[]=[],side=carFlags&1,audible=(carFlags&3)!==0;
  const stopSound=()=>{if(audible)soundRequests.push(0x8010+side);};
  if((sceneFlags&0x0c)!==4) {
    if(nextState!==0)stopSound();
    return {state:0,fuel:nextFuel,forwardBonus,soundRequests};
  }
  if((commands&8)!==0&&nextFuel>=100) {
    nextFuel=(nextFuel-100)|0;
    if((sceneFlags&0x40)===0&&nextState===0&&audible)soundRequests.push(16+side);
    nextState=(((nextState&0xffff)+1)&0xffff)<<16>>16;
    if(nextFuel<12000){nextState=(nextState&3)<<16>>16;forwardBonus=44;}
    else if(nextFuel<30000){nextState=(nextState&7)<<16>>16;forwardBonus=89;}
    else forwardBonus=178;
    if(nextState===0)stopSound();
    return {state:nextState,fuel:nextFuel,forwardBonus,soundRequests};
  }
  if((sceneFlags&0x40)===0&&nextState!==0)stopSound();
  if(nextState>0)nextState=-2;
  else if(nextState<0)nextState=(nextState+1)<<16>>16;
  return {state:nextState,fuel:nextFuel,forwardBonus,soundRequests};
}

export function advanceNativeRaceEquipmentYaw(commands:number,verticalControl:number,yaw:number,forward:number) {
  let control=verticalControl<<24>>24;
  if(control>=0&&(commands&0x20)!==0)control=((control-1)&0xff)<<24>>24;
  if(control<=0&&(commands&0x40)!==0)control=((control+1)&0xff)<<24>>24;
  let direction=0;
  if((commands&0x8000)!==0)direction=-1;
  if((commands&0x2000)!==0)direction=1;
  const nextYaw=(yaw+(direction===0?0:Math.trunc(Math.imul(forward,direction)/512)))&0xffff;
  return {verticalControl:control,yaw:nextYaw};
}

/** 0x21C920 through 0x21D4EC: ordinary active frame up to wheel animation.
 * Commands are explicitly supplied at the 0x21B840 ownership/navigation boundary.
 * Reset/debug scene paths remain rejected; Flight Wing requires the exact 0x21E208 scalar. */
export function advanceNativeRaceFrame(input:NativeRaceFrameInput,data:NativeRaceFrameData,query:NativeRaceContactDependencies['query']) {
  const {state}=input;
  if(input.sceneKind<0||input.sceneKind===28||input.sceneByte0B!==0||(input.sceneFlags&0x400))
    throw new RangeError('Unrecovered race frame reset/debug/scene path.');
  if((input.sceneFlags&0x4a000)||!(state.carFlags&65535))return {state,equipmentFlags:input.equipmentFlags,sceneFlags:input.sceneFlags>>>0,contactFlags:0,obstacleFlags:0,
    diagnosticRequested:false,impactRequests:[],soundRequests:[],skipped:true};
  let equipmentFlags=input.equipmentFlags;
  if(equipmentFlags&(nativeSpecialAbilityFlags.flightWingFitted|nativeSpecialAbilityFlags.flightWingActive)) {
    if(input.flightWingVelocityScalar===undefined) {
      throw new RangeError('Flight Wing requires the exact PAL 0x0021E208 velocity-derived scalar.');
    }
    equipmentFlags=advanceNativeFlightWingFlags(equipmentFlags,input.flightWingVelocityScalar);
  }
  const carFlags=state.carFlags&0xfeff,oldYaw=state.vehicle.yaw;
  const previousVelocity:NativeRaceVector=[state.velocity[0],(state.velocity[1]-89)|0,state.velocity[2],state.velocity[3]];
  const difference=state.velocity.map((n,i)=>(n-state.previousVelocity[i]!)|0) as unknown as NativeRaceVector;
  const localDelta=transformNativeRaceIntegerVector(state.inverse,difference);
  const localVelocity=transformNativeRaceIntegerVector(state.inverse,previousVelocity);
  const gravity=transformNativeRaceIntegerVector(state.inverse,[0,89,0,0]);
  let forward=localVelocity[2],equipmentBoostState=state.equipmentBoostState,vehicleFuel=state.vehicle.fuel;
  const equipmentSoundRequests:number[]=[];
  if(equipmentFlags&0x2000) {
    const boost=advanceNativeRaceBoostEquipment(input.sceneFlags,input.commands,carFlags,equipmentBoostState,vehicleFuel);
    equipmentBoostState=boost.state;vehicleFuel=boost.fuel;equipmentSoundRequests.push(...boost.soundRequests);
    forward=(forward+boost.forwardBonus)|0;
    if(forward>0xcf69)forward=0xcf69;
  }
  if((equipmentFlags&0x40)&&state.contact.specialState!==0) {
    if(input.commands&4)forward=(forward-89)|0;
    else if(input.commands&1)forward=(forward+89)|0;
  }
  const drag=nativeRaceDrag(forward,localVelocity[0],input.equipment.mass,state.contact.specialState,input.raceModeByte,state.positionIndex);
  let verticalControl=state.verticalControl,vehicleState={...state.vehicle,fuel:vehicleFuel};
  if(equipmentFlags&0x1000) {
    const modifier=advanceNativeRaceEquipmentYaw(input.commands,verticalControl,vehicleState.yaw,drag.forward);
    verticalControl=modifier.verticalControl;vehicleState={...vehicleState,yaw:modifier.yaw};
  }
  const impulses=state.contact.impulses.map(n=>{
    const q=Math.trunc(n/(state.contact.specialState>0?64:1024)),amount=Math.trunc(Math.imul(q,q)/input.equipment.mass);
    return (n+(q<0?amount:-amount))|0;
  });
  const drive=advanceNativeRaceVehicleVelocity({...vehicleState,runtimeFlags:0},input.equipment,{
    localForwardSpeed:drag.forward,localSideSpeed:drag.side,surfaceIndex:state.surfaces[0]!&7,
    driveContact:!!(state.contact.support[1]||state.contact.support[2]),contactAccelerationY:localDelta[1],
    contactAllowsYaw:!!(state.contact.support[0]||state.contact.support[1]||(state.contact.specialState&&(equipmentFlags&0x100))),
  },input.commands,input.sceneFlags,state.matrix,input.highShiftSchedule,input.driftPolicy??"retail");
  const position=integrateNativeRacePosition(state.contact.position,[drive.worldVelocity[0],drive.worldVelocity[1],drive.worldVelocity[2]]);
  const verticalProduct=Math.imul(verticalControl,drag.forward);
  const verticalImpulse=state.contact.specialState>0?Math.trunc(verticalProduct/256):Math.trunc(((verticalProduct+drag.forward)|0)/2048);
  const contact=advanceNativeRaceContact({state:{...state.contact,position,referenceY:state.coordinates[1],
    yaw:drive.state.yaw,runtimeFlags:drive.state.runtimeFlags,impulses},equipmentFlags,
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
  const bodyMatrix=nativeRaceBodyMatrix(contact.state.support,equipmentFlags,data);
  const schedule=(((input.sceneTime-0xe484)>>>0)>0x1944c?1:0)^((input.commands&16)?1:0);
  return {state:{...state,vehicle:{...drive.state,yaw:response.yaw,runtimeFlags:contact.state.runtimeFlags},
    contact:{...contact.state,position:response.position,yaw:response.yaw,referenceY:coordinates[1]},
    velocity:response.velocity,previousVelocity,matrix:contact.matrix,inverse:contact.inverse,bodyMatrix,coordinates,surfaces:contact.surfaces,
    carFlags:response.carFlags,positionIndex:response.positionIndex,
    distance:response.carFlags&0x200?state.distance:(state.distance+Math.abs(drive.state.nativeSpeed))|0,
    countdownByte:state.countdownByte?((state.countdownByte-1)<<24>>24):0,
    countdownHalf:state.countdownHalf?((state.countdownHalf-1)<<16>>16):0,equipmentBoostState,verticalControl,shiftScheduleFlag:schedule},
    equipmentFlags,sceneFlags:response.sceneFlags,contactFlags:contact.flags,obstacleFlags,diagnosticRequested:response.diagnosticRequested,
    impactRequests:[...contact.impactRequests,...response.impactRequests],soundRequests:[...equipmentSoundRequests,...contact.soundRequests],skipped:false};
}
