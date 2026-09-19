// Regenerate bounded PAL chase-camera evidence from the verified SLES_513.56.
// RTA_PAL_EXECUTABLE or argv 3 must name the developer-supplied European executable.
// Usage: node tools/verify_pal_camera_evidence.mjs <output-directory> [SLES_513.56]
import {createHash} from 'node:crypto';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';

const output=process.argv[2];
const executablePath=process.env.RTA_PAL_EXECUTABLE??process.argv[3];
if(!executablePath||!output)throw new Error('Set RTA_PAL_EXECUTABLE (or pass the executable as argv 3) and supply an output directory.');
const elf=readFileSync(executablePath);
const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
const executableSha256=sha256(elf);
const expectedSha256='2b4a310fc8bb145ccbc5e5ec5d023f0c29903c3e4555d63983d4a976f689eff9';
if(executableSha256!==expectedSha256)throw new Error('This evidence requires the verified PAL SLES_513.56 executable.');

const segments=[];
for(let i=0;i<elf.readUInt16LE(44);i++){
  const p=elf.readUInt32LE(28)+i*elf.readUInt16LE(42);
  if(elf.readUInt32LE(p)===1)segments.push({
    address:elf.readUInt32LE(p+8),
    file:elf.readUInt32LE(p+4),
    size:elf.readUInt32LE(p+16),
  });
}
const offsetFor=(address,length=1)=>{
  const segment=segments.find(s=>address>=s.address&&address+length<=s.address+s.size);
  if(!segment)throw new Error(`Unmapped PAL address 0x${address.toString(16)}`);
  return segment.file+address-segment.address;
};
const word=address=>elf.readUInt32LE(offsetFor(address,4));
const float32=address=>elf.readFloatLE(offsetFor(address,4));
const ranges=[
  ['follow target and fixed-step lag',0x21eac8,0x21ef1c],
  ['collision obstruction correction',0x21ef20,0x21f1d4],
  ['ordinary chase-camera update',0x21f540,0x21fb08],
  ['timed recenter state',0x21fb08,0x21fc40],
  ['camera transform builder',0x220458,0x2207e4],
  ['preset copy and lookup',0x2209c8,0x220a18],
];
const rangeReports=ranges.map(([name,start,end])=>{
  const length=end-start;
  const offset=offsetFor(start,length);
  return {
    name,
    start:`0x${start.toString(16)}`,
    endExclusive:`0x${end.toString(16)}`,
    instructionWords:length/4,
    rangeSha256:sha256(elf.subarray(offset,offset+length)),
  };
});

const presetBase=0x2a2150;
const presets=[];
for(let index=0;index<10;index++){
  const address=presetBase+index*0x20;
  const recordWords=Array.from({length:8},(_,i)=>word(address+i*4));
  const firstFiveFloats=Array.from({length:5},(_,i)=>float32(address+i*4));
  presets.push({
    index,
    address:`0x${address.toString(16)}`,
    vector00:[...firstFiveFloats.slice(0,4)],
    field10:firstFiveFloats[4],
    field14:`0x${recordWords[5].toString(16)}`,
    field18:`0x${recordWords[6].toString(16)}`,
    field1c:`0x${recordWords[7].toString(16)}`,
  });
}
const changeViewAddress=0x2a1278;
const changeViewWords=Array.from({length:15},(_,i)=>word(changeViewAddress+i*4));
const stringAddress=changeViewWords[0];
const stringOffset=offsetFor(stringAddress);
const stringEnd=elf.indexOf(0,stringOffset);
const changeViewText=elf.subarray(stringOffset,stringEnd).toString('ascii');
if(changeViewText!=='Change View')throw new Error(`Unexpected semantic camera control: ${changeViewText}`);

const f32=x=>Math.fround(x);
const positiveLagStep=float32(0x3d5938);
const negativeLagStep=float32(0x3d593c);
const stepLag=(value,velocity,target)=>{
  value=f32(value); velocity=f32(velocity); target=f32(target);
  const error=f32(target-value);
  if(error>0){
    velocity=velocity<positiveLagStep?positiveLagStep:f32(velocity+positiveLagStep);
    if(velocity>error)velocity=error;
  }else if(error<0){
    velocity=velocity>negativeLagStep?negativeLagStep:f32(velocity+negativeLagStep);
    if(velocity<error)velocity=error;
  }
  return {value:f32(value+velocity),velocity};
};
let lag={value:0,velocity:0};
const smoothingTrace=[];
for(let tick=0;tick<3;tick++){
  lag=stepLag(lag.value,lag.velocity,0.005);
  smoothingTrace.push({tick,...lag});
}
const recenterTrace=[
  {timer:0,angle:-0x8000,behavior:'hold reset angle'},
  {timer:0x3f,angle:-0x8000,behavior:'hold reset angle'},
  {timer:0x40,angle:-0x8000+0x200,behavior:'advance by +0x200'},
  {timer:0x7f,angle:0,behavior:'64th +0x200 advance reaches zero'},
  {timer:0x80,angle:0,behavior:'clear context +0x28 bit 0x400 and restore ordinary callback'},
];
const contract={
  schema:1,
  executable:{name:'SLES_513.56',sha256:executableSha256},
  addresses:{
    followHelper:'0x0021eac8',
    obstructionCorrection:'0x0021ef20',
    ordinaryUpdate:'0x0021f540',
    recenterState:'0x0021fb08',
    cameraTransformBuilder:'0x00220458',
    projectionPairSetter:'0x002207e8',
    presetCopy:'0x002209c8',
    presetLookup:'0x00220a00',
    presetTable:'0x002a2150',
    changeViewEntry:'0x002a1278',
    changeViewString:'0x002fe328',
    selectedSceneCollisionQuerySlot:'gp-0x3e60',
    perPlayerLagState:'0x017d41b0 + player*0x10',
  },
  vehicleInputs:{
    yaw:{recordOffset:'0x1d4',load:'signed halfword',use:'radians = int16 * pi * 2^-15'},
    slip:{recordOffset:'0x1d6',load:'halfword',use:'when copied preset field +0x1c is zero, negated and stored to camera state +0x1a; otherwise +0x1a is cleared'},
  },
  constants:{
    pi:{addresses:['0x003d5934','0x003d5958'],value:float32(0x3d5934)},
    lagStepPerInvocation:{
      positive:{addresses:['0x003d5938','0x003d5940','0x003d5948'],value:positiveLagStep},
      negative:{addresses:['0x003d593c','0x003d5944','0x003d594c'],value:negativeLagStep},
    },
  },
  presets,
  semanticControl:{
    label:changeViewText,
    entryAddress:`0x${changeViewAddress.toString(16)}`,
    field08:`0x${changeViewWords[2].toString(16)}`,
    ordinaryViewBranch:'0x0021f7cc..0x0021f868 branches on copied preset field +0x1c and passes one of the paired preset selectors to 0x002209c8',
    boundary:'The executable independently proves the semantic Change View entry and the native preset-toggle branch. The runtime binding mask is indirect, so this evidence does not assign a browser button/key directly.',
  },
  fixedStepLag:{
    recurrence:'error=target-value; velocity steps toward error by +0.001 or -0.001 per camera invocation, clamps to error to prevent overshoot, then value+=velocity',
    numericTrace:smoothingTrace,
    boundary:'The helper has no dt input. Evidence establishes per-invocation recurrence, not an independent wall-clock rate.',
  },
  resetAndRecenter:{
    reset:'ordinary update with controller +0x08 == 0 clears four per-player lag words at 0x017d41b0 + player*0x10 before returning',
    trigger:'controller +0x1c bit 0x400 installs 0x0021fb08 and zeroes controller +0x08',
    timedState:'for controller +0x08 < 0x40, camera state +0x16 is -0x8000 when preset field +0x1c is zero; from 0x40 through 0x7f it advances +0x200 per invocation; at >=0x80 context +0x28 bit 0x400 is cleared and the controller callback returns to 0x0021f540',
    numericTrace:recenterTrace,
    boundary:'No single native boolean equivalent to the browser chase-camera snap flag is proven.',
  },
  obstruction:{
    querySlot:'gp-0x3e60',
    probeOffsets:['camera output +0x100','camera output +0x110'],
    correctedHeightOffsets:['+0x104','+0x114'],
    correction:'0x0021ef20 changes camera state +0x16 by -0x80 or +0x80, rebuilds via 0x00220458, and repeats while the selected scene collision query reports an invalid probe or raises corrected height, stopping at the signed-angle boundary',
    provenance:'gp-0x3e60 is the same selected collision-function slot already retained for PAL vehicle contact archaeology.',
  },
  boundary:'Static executable archaeology plus deterministic scalar traces. No production camera behavior is changed, no browser-only safety policy is claimed as native, and field names remain raw where consumers do not prove semantics.',
};
mkdirSync(output,{recursive:true});
writeFileSync(join(output,'pal-chase-camera-contract.json'),JSON.stringify(contract,null,2)+'\n');
const verification={
  executableSha256,
  instructionWords:rangeReports.reduce((sum,range)=>sum+range.instructionWords,0),
  ranges:rangeReports,
  presetTableSha256:sha256(elf.subarray(offsetFor(presetBase,0x140),offsetFor(presetBase,0x140)+0x140)),
  changeViewEntrySha256:sha256(elf.subarray(offsetFor(changeViewAddress,0x3c),offsetFor(changeViewAddress,0x3c)+0x3c)),
  contractSha256:sha256(JSON.stringify(contract,null,2)+'\n'),
};
writeFileSync(join(output,'pal-chase-camera-verification.json'),JSON.stringify(verification,null,2)+'\n');
console.log(JSON.stringify(verification,null,2));
