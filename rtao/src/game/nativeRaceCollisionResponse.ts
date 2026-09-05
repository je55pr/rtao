import {transformNativeRaceIntegerVector,type NativeRaceMatrix} from './nativeRaceMath';
import {integrateNativeRacePosition} from './nativeRaceVehicle';

type Position = readonly [number,number,number];
type Velocity = readonly [number,number,number,number];
export interface NativeRaceCollisionResponseInput {
  readonly position: Position;
  readonly velocity: Velocity;
  readonly matrix: NativeRaceMatrix;
  readonly inverse: NativeRaceMatrix;
  readonly yaw: number;
  readonly previousYaw: number;
  readonly collisionFlags: number;
  readonly carFlags: number;
  readonly positionIndex: number;
  readonly sceneFlags: number;
  /** Signed scene +0x22. The separate scene-28 response is not this API. */
  readonly sceneKind: number;
}

/** 0x21A510..0x21AB60, standard (scene +0x22 != 28) response.
 * Matrices remain the caller's contact matrices even after yaw is restored.
 * Effects are returned as requests; no guessed audio/UI behavior is run. */
export function respondNativeRaceCollision(input: NativeRaceCollisionResponseInput) {
  if ((input.sceneKind << 24 >> 24) === 28) throw new RangeError('Scene-28 collision response remains unrecovered.');
  let position: [number,number,number] = [...input.position];
  let yaw=input.yaw&65535,carFlags=input.carFlags&65535,positionIndex=input.positionIndex&255,sceneFlags=input.sceneFlags>>>0;
  const velocity=input.velocity.map(n=>n|0) as [number,number,number,number];
  if (input.collisionFlags>>>0) {
    // Native rollback uses (-velocity << 5)/25, twice the integration scale.
    position=position.map((n,i)=>{
      const next=(n+Math.trunc(((-velocity[i]!)<<5)/25))|0;
      return i===1?next:next&0x0fffffff;
    }) as [number,number,number];
    yaw=input.previousYaw&65535;
  }
  const local=transformNativeRaceIntegerVector(input.inverse,velocity),flags=input.collisionFlags&15;
  let pushX=0,pushZ=0,deltaX=0,deltaZ=0,diagnosticRequested=false;
  const negX=(-local[0])|0,negZ=(-local[2])|0;
  // Jump table 0x2FEB20 includes entry points inside shared case tails.
  if (flags===1||flags===7||flags===2||flags===11) {
    deltaX=Math.trunc(negX/4);deltaZ=Math.trunc(negZ/16);
    const left=flags===1||flags===7;
    yaw=(yaw+(left?512:-512))&65535;pushX=left?2048:-2048;pushZ=-2048;
  } else if (flags===4||flags===6||flags===13||flags===8||flags===9||flags===14) {
    deltaX=Math.trunc(negX/2);deltaZ=Math.trunc(negZ/8);
    pushX=flags===4||flags===6||flags===13?2048:-2048;pushZ=2048;
  } else if (flags===3||flags===12) {
    deltaZ=negZ;pushZ=flags===3?-2048:2048;
  } else if (flags===5) pushX=2048;
  else if (flags===10) pushX=-2048;
  else if (flags===15) {
    if (carFlags&3) {diagnosticRequested=true;sceneFlags=(sceneFlags|0x200)>>>0;}
    else {carFlags=0;positionIndex=255;}
  }
  const push=transformNativeRaceIntegerVector(input.matrix,[pushX,0,pushZ,0]);
  position=integrateNativeRacePosition(position,[push[0],push[1],push[2]]);
  const delta=transformNativeRaceIntegerVector(input.matrix,[deltaX,0,deltaZ,0]);
  // Only X/Z velocity writes survive this response, including on slopes.
  velocity[0]=(velocity[0]+delta[0])|0;velocity[2]=(velocity[2]+delta[2])|0;
  const impactRequests: {channel:number;kind:number;strength:number}[]=[];
  if (!(carFlags&0xfb0)&&!(sceneFlags&0x40)&&flags) {
    const kind=[1,4,5].includes(flags)?4:[2,8,10].includes(flags)?3:5;
    impactRequests.push({channel:carFlags&1,kind,strength:255});
  }
  return {position,velocity,yaw,carFlags,positionIndex,sceneFlags,diagnosticRequested,impactRequests};
}
