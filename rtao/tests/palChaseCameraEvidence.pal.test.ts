import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';

const executablePath=process.env.RTA_PAL_EXECUTABLE;
const suite=executablePath?describe:describe.skip;
const verificationUrl=new URL(
  '../../docs/evidence/camera/2026-09-19/pal-chase-camera-verification.json',
  import.meta.url,
);

suite('verified PAL chase-camera executable evidence',()=>{
  if(!executablePath)return;
  const elf=readFileSync(executablePath);
  const verification=JSON.parse(readFileSync(verificationUrl,'utf8'));
  const sha256=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
  const segments:Array<{address:number;file:number;size:number}>=[];
  for(let i=0;i<elf.readUInt16LE(44);i++){
    const p=elf.readUInt32LE(28)+i*elf.readUInt16LE(42);
    if(elf.readUInt32LE(p)===1)segments.push({
      address:elf.readUInt32LE(p+8),
      file:elf.readUInt32LE(p+4),
      size:elf.readUInt32LE(p+16),
    });
  }
  const offsetFor=(address:number,length=1)=>{
    const segment=segments.find(s=>address>=s.address&&address+length<=s.address+s.size);
    if(!segment)throw new Error(`unmapped PAL address 0x${address.toString(16)}`);
    return segment.file+address-segment.address;
  };
  const word=(address:number)=>elf.readUInt32LE(offsetFor(address,4));
  const float32=(address:number)=>elf.readFloatLE(offsetFor(address,4));
  const opcode=(instruction:number)=>instruction>>>26;
  const rs=(instruction:number)=>(instruction>>>21)&0x1f;
  const rt=(instruction:number)=>(instruction>>>16)&0x1f;
  const signedImmediate=(instruction:number)=>(instruction<<16)>>16;
  const unsignedImmediate=(instruction:number)=>instruction&0xffff;
  const jumpTarget=(address:number,instruction:number)=>(
    ((address+4)&0xf0000000)|((instruction&0x03ffffff)<<2)
  )>>>0;
  it('matches the retained authority and all bounded code-range hashes',()=>{
    expect(sha256(elf)).toBe(
      '2b4a310fc8bb145ccbc5e5ec5d023f0c29903c3e4555d63983d4a976f689eff9',
    );
    expect(verification.instructionWords).toBe(1145);
    for(const range of verification.ranges as Array<{
      start:string;
      endExclusive:string;
      rangeSha256:string;
    }>){
      const start=Number.parseInt(range.start,16);
      const end=Number.parseInt(range.endExclusive,16);
      const offset=offsetFor(start,end-start);
      expect(sha256(elf.subarray(offset,offset+end-start))).toBe(range.rangeSha256);
    }
  });

  it('decodes the recovered vehicle yaw and slip loads without storing raw words',()=>{
    const yaw=word(0x21f874);
    expect(opcode(yaw)).toBe(0x21);
    expect(rs(yaw)).toBe(19);
    expect(signedImmediate(yaw)).toBe(0x1d4);

    const slip=word(0x21fa30);
    expect(opcode(slip)).toBe(0x25);
    expect(rs(slip)).toBe(19);
    expect(signedImmediate(slip)).toBe(0x1d6);
  });

  it('pins lag constants, the ten preset records and semantic Change View entry',()=>{
    expect(float32(0x3d5938)).toBeCloseTo(0.001,9);
    expect(float32(0x3d593c)).toBeCloseTo(-0.001,9);
    const presets=[
      [0,2,-7,1,500,0x380,0,0],
      [0,1.5,-0.25,1,500,0,0,1],
      [0,1.2,-7,1,461,0x600,0,0],
      [0,1.5,-0.25,1,500,0,0,1],
      [0,2.5,-7,1,500,0x580,0,0],
      [0,2.2,0,1,500,0,0,1],
      [0,1.6,-7,1,461,0x800,0,0],
      [0,2,-0.25,1,500,0,0,1],
      [0,2,-9.3,1,500,0xd80,0,0],
      [0,1.2,-10.8,1,461,0x880,0,0],
    ] as const;
    presets.forEach((preset,index)=>{
      const base=0x2a2150+index*0x20;
      for(let field=0;field<5;field++)expect(float32(base+field*4)).toBeCloseTo(preset[field] as number,5);
      for(let field=5;field<8;field++)expect(word(base+field*4)).toBe(preset[field]);
    });
    const entry=0x2a1278;
    const stringAddress=word(entry);
    expect(word(entry+8)).toBe(0x78);
    const stringOffset=offsetFor(stringAddress);
    const end=elf.indexOf(0,stringOffset);
    expect(elf.subarray(stringOffset,end).toString('ascii')).toBe('Change View');
  });
  it('pins the native output-builder and projection-pair boundary',()=>{
    const builderCall=word(0x21fa70);
    expect(opcode(builderCall)).toBe(3);
    expect(jumpTarget(0x21fa70,builderCall)).toBe(0x220458);

    const projectionX=word(0x2207e8);
    expect(opcode(projectionX)).toBe(0x39);
    expect(rs(projectionX)).toBe(28);
    expect(rt(projectionX)).toBe(12);
    expect(signedImmediate(projectionX)).toBe(-16016);

    const projectionY=word(0x2207f0);
    expect(opcode(projectionY)).toBe(0x39);
    expect(rs(projectionY)).toBe(28);
    expect(rt(projectionY)).toBe(13);
    expect(signedImmediate(projectionY)).toBe(-16012);

    const projectionOutput=word(0x220500);
    expect(opcode(projectionOutput)).toBe(9);
    expect(rs(projectionOutput)).toBe(18);
    expect(rt(projectionOutput)).toBe(16);
    expect(signedImmediate(projectionOutput)).toBe(0x100);
  });

  it('pins mutable descriptor rotations feeding the final transform builder',()=>{
    const descriptorAngles=word(0x22035c);
    expect(opcode(descriptorAngles)).toBe(9);
    expect(rs(descriptorAngles)).toBe(20);
    expect(rt(descriptorAngles)).toBe(5);
    expect(signedImmediate(descriptorAngles)).toBe(0x14);

    const rotationCall=word(0x22037c);
    expect(opcode(rotationCall)).toBe(3);
    expect(jumpTarget(0x22037c,rotationCall)).toBe(0x208580);

    const plus16=word(0x208598),plus1a=word(0x20859c);
    const plus18=word(0x2085a4),plus14=word(0x2085ac);
    expect(opcode(plus16)).toBe(0x25);
    expect(rs(plus16)).toBe(3);
    expect(signedImmediate(plus16)).toBe(2);
    expect(opcode(plus1a)).toBe(0x25);
    expect(rs(plus1a)).toBe(3);
    expect(signedImmediate(plus1a)).toBe(6);
    expect(opcode(plus18)).toBe(0x21);
    expect(rs(plus18)).toBe(3);
    expect(signedImmediate(plus18)).toBe(4);
    expect(opcode(plus14)).toBe(0x21);
    expect(rs(plus14)).toBe(3);
    expect(signedImmediate(plus14)).toBe(0);

    const yawCombine=word(0x2085a8);
    expect(opcode(yawCombine)).toBe(0);
    expect(rs(yawCombine)).toBe(2);
    expect(rt(yawCombine)).toBe(7);
    expect(yawCombine&0x3f).toBe(0x21);
  });

  it('pins the recovered final-output projection and renderer handoff constants',()=>{
    expect(float32(0x3d5984)).toBeCloseTo(0.8,7);
    expect(float32(0x3d5988)).toBeCloseTo(0.53,7);
    expect(float32(0x3d598c)).toBeCloseTo(0.47,7);
    const frustum=[
      [-320,-112,1.5,1],[320,-112,1.5,1],[-320,112,700,1],
      [320,112,700,1],[0,-112,1.5,1],[-107,112,700,1],[107,112,700,1],
    ];
    frustum.forEach((vector,index)=>vector.forEach((value,lane)=>
      expect(float32(0x2a2290+index*16+lane*4)).toBeCloseTo(value,5)));

    const dmaLui=word(0x2276f4),dmaOri=word(0x2276fc);
    expect(opcode(dmaLui)).toBe(0xf);
    expect(rt(dmaLui)).toBe(3);
    expect(unsignedImmediate(dmaLui)).toBe(0x3000);
    expect(opcode(dmaOri)).toBe(0xd);
    expect(rs(dmaOri)).toBe(3);
    expect(rt(dmaOri)).toBe(3);
    expect(unsignedImmediate(dmaOri)).toBe(8);

    const vifLui=word(0x2276f8),vifOri=word(0x227704);
    expect(opcode(vifLui)).toBe(0xf);
    expect(rt(vifLui)).toBe(4);
    expect(unsignedImmediate(vifLui)).toBe(0x6c08);
    expect(opcode(vifOri)).toBe(0xd);
    expect(rs(vifOri)).toBe(4);
    expect(rt(vifOri)).toBe(4);
    expect(unsignedImmediate(vifOri)).toBe(4);
  });

  it('pins the native camera-world helper inputs and matrix-builder chain',()=>{
    const source=word(0x21eae8);
    expect(opcode(source)).toBe(9);
    expect(rs(source)).toBe(17);
    expect(rt(source)).toBe(5);
    expect(signedImmediate(source)).toBe(0x10);

    const mode=word(0x21eb58);
    expect(opcode(mode)).toBe(0x23);
    expect(rs(mode)).toBe(18);
    expect(rt(mode)).toBe(2);
    expect(signedImmediate(mode)).toBe(0x1c);

    const offset50=word(0x21eb80);
    expect(opcode(offset50)).toBe(0x31);
    expect(rs(offset50)).toBe(17);
    expect(signedImmediate(offset50)).toBe(0x50);

    const slip=word(0x21edb8),relativeYaw=word(0x21edbc);
    expect(opcode(slip)).toBe(0x25);
    expect(rs(slip)).toBe(18);
    expect(signedImmediate(slip)).toBe(0x1a);
    expect(opcode(relativeYaw)).toBe(0x25);
    expect(rs(relativeYaw)).toBe(18);
    expect(signedImmediate(relativeYaw)).toBe(0x16);

    for(const [address,target] of [
      [0x21ee30,0x275830],
      [0x21eeb8,0x2086c0],
      [0x21eec4,0x2086c0],
      [0x21eee4,0x208738],
    ] as const){
      const call=word(address);
      expect(opcode(call)).toBe(3);
      expect(jumpTarget(address,call)).toBe(target);
    }

    const stackSecondary=word(0x21fa3c);
    expect(opcode(stackSecondary)).toBe(9);
    expect(rs(stackSecondary)).toBe(29);
    expect(rt(stackSecondary)).toBe(20);
    expect(signedImmediate(stackSecondary)).toBe(0x40);

    const primary=word(0x21fa6c),secondary=word(0x21fa74);
    expect(opcode(primary)).toBe(0);
    expect(rs(primary)).toBe(29);
    expect(rt(primary)).toBe(0);
    expect((primary>>>11)&0x1f).toBe(6);
    expect(primary&0x3f).toBe(0x2d);
    expect(opcode(secondary)).toBe(0);
    expect(rs(secondary)).toBe(20);
    expect(rt(secondary)).toBe(0);
    expect((secondary>>>11)&0x1f).toBe(7);
    expect(secondary&0x3f).toBe(0x2d);
  });

  it('decodes the selected collision query and transform rebuild call',()=>{
    const queryLoad=word(0x21ef24);
    expect(opcode(queryLoad)).toBe(0x23);
    expect(rs(queryLoad)).toBe(28);
    expect(signedImmediate(queryLoad)).toBe(-0x3e60);

    const queryCall=word(0x21ef84);
    expect(opcode(queryCall)).toBe(0);
    expect(rs(queryCall)).toBe(2);
    expect(queryCall&0x3f).toBe(9);

    const rebuild=word(0x21f0e8);
    expect(opcode(rebuild)).toBe(3);
    expect(jumpTarget(0x21f0e8,rebuild)).toBe(0x220458);
  });

  it('decodes the timed recenter angle and completion mask',()=>{
    const resetAngle=word(0x21fbac);
    expect(opcode(resetAngle)).toBe(9);
    expect(rs(resetAngle)).toBe(0);
    expect(rt(resetAngle)).toBe(2);
    expect(signedImmediate(resetAngle)).toBe(-0x8000);

    const angleStep=word(0x21fbd0);
    expect(opcode(angleStep)).toBe(9);
    expect(rs(angleStep)).toBe(2);
    expect(rt(angleStep)).toBe(2);
    expect(signedImmediate(angleStep)).toBe(0x200);

    const clearMask=word(0x21fbe0);
    expect(opcode(clearMask)).toBe(9);
    expect(rs(clearMask)).toBe(0);
    expect(rt(clearMask)).toBe(5);
    expect(signedImmediate(clearMask)).toBe(-0x401);
  });
});
