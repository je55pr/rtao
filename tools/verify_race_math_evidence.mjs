// Regenerate the bounded PAL instruction evidence; original inputs stay local.
// node tools/verify_race_math_evidence.mjs <output-directory> [math|frame]
// RTA_PAL_EXECUTABLE must name the developer-supplied European executable.
import {createHash} from 'node:crypto';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';

const path=process.env.RTA_PAL_EXECUTABLE,output=process.argv[2];
const scope=process.argv[3]??'math';
if(!['math','frame'].includes(scope))throw new Error('Evidence scope must be math or frame.');
if(!path||!output)throw new Error('Set RTA_PAL_EXECUTABLE and supply an output directory.');
const elf=readFileSync(path),sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
const executableSha256=sha256(elf);
if(executableSha256!=='2b4a310fc8bb145ccbc5e5ec5d023f0c29903c3e4555d63983d4a976f689eff9')
  throw new Error('This evidence requires the verified SLES_513.56 executable.');
const segments=[];
for(let i=0;i<elf.readUInt16LE(44);i++){
  const p=elf.readUInt32LE(28)+i*elf.readUInt16LE(42);
  if(elf.readUInt32LE(p)===1)segments.push({address:elf.readUInt32LE(p+8),file:elf.readUInt32LE(p+4),size:elf.readUInt32LE(p+16)});
}
const word=address=>{
  const segment=segments.find(s=>address>=s.address&&address+4<=s.address+s.size);
  if(!segment)throw new Error(`Unmapped instruction ${address.toString(16)}`);
  return elf.readUInt32LE(segment.file+address-segment.address);
};
const ranges=scope==='frame'?[
  ['course obstacle pointer producer',0x20ca44,0x20ca90],
  ['standard and scene-28 response, obstacle iterator and wrapper',0x21a510,0x21af38],
  ['zero-curvature caller-delta write',0x21b3a4,0x21b3b0],
  ['vehicle frame through body orientation and distance',0x21c920,0x21d4ec],
]:[
  ['normal basis and yaw composition',0x2086c0,0x208790],
  ['normal adjustment',0x21a368,0x21a510],
  ['integer movement transform',0x21e188,0x21e1bc],
  ['point transform, matrix product, cross, normalize, inverse',0x275770,0x275928],
  ['vector addition',0x275990,0x2759a8],
  ['identity support',0x275a20,0x275a30],
  ['identity and rotation polynomial',0x275a98,0x275b38],
  ['yaw matrix constructor',0x275c88,0x275d30],
];
const lines=[],reports=[];
for(const [name,start,end] of ranges){
  const selected=[];
  for(let address=start;address<end;address+=4)selected.push(`${address.toString(16).padStart(8,'0')}: ${word(address).toString(16).padStart(8,'0')}`);
  reports.push({name,start:`0x${start.toString(16)}`,endExclusive:`0x${end.toString(16)}`,instructionWords:selected.length,
    textSha256:sha256(selected.join('\n')+'\n')});
  lines.push(`# ${name}`,...selected,'');
}
const trace=lines.join('\n').trimEnd()+'\n';
mkdirSync(output,{recursive:true});
const prefix=scope==='frame'?'native-frame':'native-math';
writeFileSync(join(output,prefix+'-instructions.txt'),trace);
const report={executableSha256,instructionWords:reports.reduce((n,r)=>n+r.instructionWords,0),ranges:reports,
  traceSha256:sha256(trace),boundary:'Instruction words from the supplied ELF; instruction execution uses the bounded host-float32 oracle, not PS2 hardware.'};
writeFileSync(join(output,prefix+'-trace-verification.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
