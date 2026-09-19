import {describe,expect,it} from 'vitest';

const f32=Math.fround;
const acceleration=f32(0.001);

function stepLag(value:number,velocity:number,target:number) {
  value=f32(value);
  velocity=f32(velocity);
  target=f32(target);
  const error=f32(target-value);
  if(error>0){
    velocity=velocity<acceleration?acceleration:f32(velocity+acceleration);
    if(velocity>error)velocity=error;
  }else if(error<0){
    const negativeAcceleration=f32(-acceleration);
    velocity=velocity>negativeAcceleration?negativeAcceleration:f32(velocity+negativeAcceleration);
    if(velocity<error)velocity=error;
  }
  return {value:f32(value+velocity),velocity};
}

function recenterAngle(timer:number,current:number,presetField1c=0) {
  if(timer<0x40)return presetField1c===0?-0x8000:current;
  if(timer<0x80)return presetField1c===0?((current+0x200)<<16>>16):current;
  return current;
}

describe('retained PAL chase-camera scalar contract',()=>{
  it('uses the recovered 0.001-per-invocation lag recurrence without overshoot',()=>{
    let state={value:0,velocity:0};
    const trace=[] as Array<{value:number;velocity:number}>;
    for(let tick=0;tick<3;tick++){
      state=stepLag(state.value,state.velocity,0.005);
      trace.push(state);
    }
    expect(trace).toEqual([
      {value:f32(0.001),velocity:f32(0.001)},
      {value:f32(0.003),velocity:f32(0.002)},
      {value:f32(0.005),velocity:f32(f32(0.005)-f32(0.003))},
    ]);
    expect(stepLag(0,0,-0.005)).toEqual({value:f32(-0.001),velocity:f32(-0.001)});
  });

  it('holds the recovered reset angle then recenters by 0x200 for 64 invocations',()=>{
    let angle=0;
    for(let timer=0;timer<0x80;timer++)angle=recenterAngle(timer,angle);
    expect(recenterAngle(0,123)).toBe(-0x8000);
    expect(recenterAngle(0x3f,123)).toBe(-0x8000);
    expect(recenterAngle(0x40,-0x8000)).toBe(-0x7e00);
    expect(angle).toBe(0);
    expect(recenterAngle(0x80,angle)).toBe(0);
  });

  it('does not reinterpret the timed native recenter as an instant browser snap',()=>{
    expect(recenterAngle(0x40,-0x8000)).not.toBe(0);
    expect(recenterAngle(0x40,-0x8000,1)).toBe(-0x8000);
  });
});
