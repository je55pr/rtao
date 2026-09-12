/**
 * Bounded test oracle: executes the supplied PAL ELF's scalar instructions.
 * No executable bytes are bundled. This is deliberately not a PS2 emulator:
 * normal finite COP1/COP2 operations use host float32 rounding, and unsupported
 * instructions fail. Used only for the bounded recovered race call graph.
 */
import { PalVuMachine } from './palVuMachine';

export class PalScalarMachine {
  readonly memory = new Uint8Array(0x2000000);
  readonly view = new DataView(this.memory.buffer);
  private readonly registers = Array<bigint>(32).fill(0n);
  private readonly floatWords = new Uint32Array(32);
  private readonly floats = new Float32Array(this.floatWords.buffer);
  readonly vu = new PalVuMachine();
  private readonly codeRanges: readonly (readonly [number, number])[] = [
    [0x252198, 0x252324], [0x252ba0, 0x253090], [0x277b38, 0x277b50],
    [0x278120, 0x278310], [0x27a780, 0x27aa48],
    [0x22f068, 0x22f290], [0x22ed38, 0x22ee48], [0x2340c0, 0x234334],
    [0x238d00, 0x238e74],
    [0x21b238, 0x21b400], [0x21dcf8, 0x21df68], [0x218dc0, 0x218f70],
    [0x219d90, 0x21a364],
    [0x21b1c0, 0x21b6cc], [0x21af38, 0x21b1c0],
    [0x21bdd8, 0x21c920],
    [0x21c920, 0x21d550],
    [0x2086c0, 0x208790], [0x21a368, 0x21a510],
    [0x21a510, 0x21af38],
    [0x20ca68, 0x20ca90],
    [0x275770, 0x275928], [0x275990, 0x2759a8], [0x275a20, 0x275a30],
    [0x275a98, 0x275b38], [0x275c88, 0x275d30], [0x21e188, 0x21e1bc],
    [0x207748, 0x207aa0], [0x208c50, 0x208d30],
    [0x218f70, 0x21915c], [0x21cd88, 0x21cea8], [0x21d1b8, 0x21d24c], [0x21d2f0, 0x21d380],
  ];
  private gp = 0;

  constructor(elf: Uint8Array) {
    const data = new DataView(elf.buffer, elf.byteOffset, elf.byteLength);
    if (data.getUint32(0, true) !== 0x464c457f) throw new Error("PAL oracle requires ELF bytes.");
    for (let i = 0; i < data.getUint16(44, true); i++) {
      const offset = data.getUint32(28, true) + i * data.getUint16(42, true);
      const type = data.getUint32(offset, true);
      const file = data.getUint32(offset + 4, true);
      if (type === 0x70000000) this.gp = data.getUint32(file + 20, true);
      if (type === 1) this.memory.set(elf.subarray(file, file + data.getUint32(offset + 16, true)), data.getUint32(offset + 8, true));
    }
  }

  register(index: number): number { return Number(BigInt.asIntN(32, this.registers[index]!)); }

  /** Observe scalar arguments at explicitly hooked VU/orientation boundaries. */
  floatRegister(index: number): number { return this.floats[index]!; }

  run(entry: number, arguments_: readonly number[], hooks: Readonly<Record<number, (arguments_: readonly number[]) => number>> = {},
    slice: { registers?: Readonly<Record<number, number>>; floats?: Readonly<Record<number, number>>;
      observe?: Readonly<Record<number, () => void>>; stopAt?: number; maxSteps?: number } = {}): number {
    const r = this.registers; r.fill(0n); this.floatWords.fill(0);
    this.vu.reset();
    for (const [index, value] of Object.entries(slice.floats ?? {})) this.floats[Number(index)] = value;
    arguments_.forEach((value, i) => { r[4 + i] = BigInt(value); });
    r[28] = BigInt(this.gp); r[29] = 0x1f00000n; r[31] = 0x1fffffcn;
    for (const [index, value] of Object.entries(slice.registers ?? {})) r[Number(index)] = BigInt(value);
    let pc = entry, next = pc + 4, lo = 0n, hi = 0n, lo1 = 0n, hi1 = 0n, condition = false;
    const u = (index: number): number => Number(BigInt.asUintN(32, r[index]!));
    const s = (index: number): number => u(index) | 0;
    const set32 = (index: number, value: number): void => { r[index] = BigInt(value | 0); };
    for (let steps = 0; steps < (slice.maxSteps ?? 20_000); steps++) {
      if (pc === 0x1fffffc || pc === slice.stopAt) return u(2);
      slice.observe?.[pc]?.();
      const hook = hooks[pc];
      if (hook) {
        set32(2, hook(Array.from({ length: 8 }, (_, i) => u(4 + i))));
        pc = u(31); next = pc + 4;
        continue;
      }
      if (!this.codeRanges.some(([start, end]) => pc >= start && pc < end)) throw new Error(`PAL oracle left its race call graph at ${pc.toString(16)}`);
      const word = this.view.getUint32(pc, true);
      const op = word >>> 26, rs = (word >>> 21) & 31, rt = (word >>> 16) & 31, rd = (word >>> 11) & 31;
      const sh = (word >>> 6) & 31, fn = word & 63, imm = word & 65535, simm = (imm << 16) >> 16;
      const address = (u(rs) + simm) >>> 0;
      let after = next + 4, skipDelay = false, handled = true;
      const branch = (take: boolean, likely = false): void => {
        if (take) after = pc + 4 + simm * 4;
        else if (likely) skipDelay = true;
      };
      if (word === 0) { /* nop */ }
      else if (op === 0) {
        switch (fn) {
          case 0: set32(rd, u(rt) << sh); break;
          case 2: set32(rd, u(rt) >>> sh); break;
          case 3: set32(rd, s(rt) >> sh); break;
          case 4: set32(rd, u(rt) << (u(rs) & 31)); break;
          case 7: set32(rd, s(rt) >> (u(rs) & 31)); break;
          case 8: after = u(rs); break;
          case 9: r[rd] = BigInt(pc + 8); after = u(rs); break;
          case 10: if (r[rt] === 0n) r[rd] = r[rs]!; break;
          case 11: if (r[rt] !== 0n) r[rd] = r[rs]!; break;
          case 16: r[rd] = hi; break;
          case 18: r[rd] = lo; break;
          case 24: {
            const product = BigInt(s(rs)) * BigInt(s(rt));
            lo = BigInt.asIntN(32, product); hi = BigInt.asIntN(32, product >> 32n); r[rd] = lo; break;
          }
          case 26: lo = BigInt(Math.trunc(s(rs) / s(rt))); hi = BigInt(s(rs) % s(rt)); break;
          case 33: set32(rd, s(rs) + s(rt)); break;
          case 35: set32(rd, s(rs) - s(rt)); break;
          case 36: r[rd] = r[rs]! & r[rt]!; break;
          case 37: r[rd] = r[rs]! | r[rt]!; break;
          case 38: r[rd] = r[rs]! ^ r[rt]!; break;
          case 42: r[rd] = r[rs]! < r[rt]! ? 1n : 0n; break;
          case 43: r[rd] = BigInt.asUintN(64, r[rs]!) < BigInt.asUintN(64, r[rt]!) ? 1n : 0n; break;
          case 45: r[rd] = BigInt.asIntN(64, r[rs]! + r[rt]!); break;
          case 56: r[rd] = BigInt.asIntN(64, r[rt]! << BigInt(sh)); break;
          case 58: r[rd] = BigInt.asUintN(64, r[rt]!) >> BigInt(sh); break;
          case 60: r[rd] = BigInt.asIntN(64, r[rt]! << BigInt(sh + 32)); break;
          default: handled = false;
        }
      } else if (op === 1) {
        if (rt === 0) branch(r[rs]! < 0n);
        else if (rt === 1) branch(r[rs]! >= 0n);
        else if (rt === 2) branch(r[rs]! < 0n, true);
        else if (rt === 3) branch(r[rs]! >= 0n, true);
        else handled = false;
      } else if (op === 2 || op === 3) {
        if (op === 3) r[31] = BigInt(pc + 8);
        after = ((pc + 4) & 0xf0000000) | ((word & 0x3ffffff) << 2);
      } else if ([4, 5, 6, 7, 20, 21, 22, 23].includes(op)) {
        const kind = op & 15;
        branch(kind === 4 ? r[rs] === r[rt] : kind === 5 ? r[rs] !== r[rt] : kind === 6 ? r[rs]! <= 0n : r[rs]! > 0n, op >= 20);
      } else if (op === 8 || op === 9) set32(rt, s(rs) + simm);
      else if (op === 10) r[rt] = r[rs]! < BigInt(simm) ? 1n : 0n;
      else if (op === 11) r[rt] = BigInt.asUintN(64, r[rs]!) < BigInt.asUintN(64, BigInt(simm)) ? 1n : 0n;
      else if (op === 12) r[rt] = r[rs]! & BigInt(imm);
      else if (op === 13) r[rt] = r[rs]! | BigInt(imm);
      else if (op === 14) r[rt] = r[rs]! ^ BigInt(imm);
      else if (op === 15) set32(rt, imm << 16);
      else if (op === 17) {
        if (rs === 0) set32(rt, this.floatWords[rd]!);
        else if (rs === 4) this.floatWords[rd] = u(rt);
        else if (rs === 8) branch((rt & 1) !== 0 ? condition : !condition, (rt & 2) !== 0);
        else if (rs === 16) {
          const a = this.floats[rd]!, b = this.floats[rt]!;
          if (fn === 0) this.floats[sh] = a + b;
          else if (fn === 1) this.floats[sh] = a - b;
          else if (fn === 2) this.floats[sh] = a * b;
          else if (fn === 3) this.floats[sh] = a / b;
          // R5900 SQRT.S encodes its operand in ft, unlike ordinary MIPS fs.
          else if (fn === 4) this.floats[sh] = Math.sqrt(Math.abs(b));
          else if (fn === 6) this.floatWords[sh] = this.floatWords[rd]!;
          else if (fn === 7) this.floats[sh] = -a;
          else if (fn === 36) this.floatWords[sh] = Math.trunc(a);
          else if (fn === 50) condition = a === b;
          else if (fn === 52) condition = a < b;
          else if (fn === 54) condition = a <= b;
          else handled = false;
        } else if (rs === 20 && fn === 32) this.floats[sh] = this.floatWords[rd]! | 0;
        else handled = false;
      } else if (op === 18) {
        if (rs >= 16) this.vu.execute(word);
        else if (rs === 1) {
          r[rt] = this.vu.words[rd]!.reduce((n,w,i) => n | BigInt(w) << BigInt(i*32),0n);
        } else if (rs === 5) {
          if (rd !== 0) for (let i=0;i<4;i++) this.vu.words[rd]![i] = Number(BigInt.asUintN(32,r[rt]! >> BigInt(i*32)));
        } else handled = false;
      } else if (op === 28) {
        if (fn === 18) r[rd] = lo1;
        else if (fn === 16) r[rd] = hi1;
        else if (fn === 26) { lo1 = BigInt(Math.trunc(s(rs) / s(rt))); hi1 = BigInt(s(rs) % s(rt)); }
        else if (fn === 8 && sh === 17) {
          let packed=0n;
          for(let i=0;i<4;i++)packed|=BigInt.asUintN(32,(r[rs]!>>BigInt(i*32))-(r[rt]!>>BigInt(i*32)))<<BigInt(i*32);
          r[rd]=packed;
        } else if ((fn === 8 || fn === 40) && sh === 18) {
          const first = fn === 8 ? 0 : 2, lane = (reg: number, i: number) => BigInt.asUintN(32,r[reg]! >> BigInt(i*32));
          r[rd] = lane(rt,first) | lane(rs,first) << 32n | lane(rt,first+1) << 64n | lane(rs,first+1) << 96n;
        } else if (fn === 9 && sh === 14) r[rd] = BigInt.asUintN(64,r[rt]!) | BigInt.asUintN(64,r[rs]!) << 64n;
        else if (fn === 41 && sh === 14) r[rd] = BigInt.asUintN(64,r[rs]! >> 64n) | BigInt.asUintN(64,r[rt]! >> 64n) << 64n;
        else handled = false;
      } else if (op === 30) r[rt] = this.view.getBigUint64(address,true) | this.view.getBigUint64(address+8,true) << 64n;
      else if (op === 31) {
        this.view.setBigUint64(address,BigInt.asUintN(64,r[rt]!),true);
        this.view.setBigUint64(address+8,BigInt.asUintN(64,r[rt]! >> 64n),true);
      } else if (op === 54) {
        if (rt !== 0) for (let i=0;i<4;i++) this.vu.words[rt]![i] = this.view.getUint32(address+i*4,true);
      } else if (op === 62) {
        for (let i=0;i<4;i++) this.view.setUint32(address+i*4,this.vu.words[rt]![i]!,true);
      } else if (op === 32) r[rt] = BigInt(this.view.getInt8(address));
      else if (op === 33) r[rt] = BigInt(this.view.getInt16(address, true));
      else if (op === 35) r[rt] = BigInt(this.view.getInt32(address, true));
      else if (op === 36) r[rt] = BigInt(this.view.getUint8(address));
      else if (op === 37) r[rt] = BigInt(this.view.getUint16(address, true));
      else if (op === 40) this.view.setUint8(address, u(rt));
      else if (op === 41) this.view.setUint16(address, u(rt), true);
      else if (op === 43) this.view.setUint32(address, u(rt), true);
      else if (op === 49) this.floatWords[rt] = this.view.getUint32(address, true);
      else if (op === 57) this.view.setUint32(address, this.floatWords[rt]!, true);
      else if (op === 55) r[rt] = this.view.getBigInt64(address, true);
      else if (op === 63) this.view.setBigInt64(address, r[rt]!, true);
      else if ([34, 38, 42, 46].includes(op)) {
        const k = address & 3, base = address & ~3, left = op === 34 || op === 42, load = op === 34 || op === 38;
        let value = u(rt);
        for (let i = left ? 0 : k; i <= (left ? k : 3); i++) {
          const shift = (left ? 3 - k + i : i - k) * 8;
          if (load) value = (value & ~(255 << shift)) | (this.memory[base + i]! << shift);
          else this.memory[base + i] = value >>> shift;
        }
        if (load) set32(rt, value);
      } else handled = false;
      if (!handled) throw new Error(`Unsupported PAL oracle word ${word.toString(16)} at ${pc.toString(16)}`);
      r[0] = 0n;
      pc = skipDelay ? next + 4 : next;
      next = skipDelay ? next + 8 : after;
    }
    throw new Error("PAL scalar oracle exceeded the bounded instruction budget.");
  }
}
