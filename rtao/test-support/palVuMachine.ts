/** Bounded COP2 macro-mode oracle. Decodes supplied instructions independently
 * of the production matrix functions. Finite arithmetic uses host float32;
 * pipeline timing, flags, extended PS2 exponents and hardware rounding are not
 * modeled. Opcode/lane meanings cross-checked with PCSX2's opcode/VU tables. */
export class PalVuMachine {
  readonly words = Array.from({length:32}, () => new Uint32Array(4));
  private readonly vectors = this.words.map(w => new Float32Array(w.buffer));
  private readonly accumulator = new Float32Array(4);
  private q = 0;

  reset(): void {
    for (const w of this.words) w.fill(0);
    this.vectors[0]![3] = 1; this.accumulator.fill(0); this.q = 0;
  }

  execute(word: number): void {
    const fs = word >>> 11 & 31, ft = word >>> 16 & 31, fd = word >>> 6 & 31;
    const mask = word >>> 21 & 15, fn = word & 63;
    const a = [...this.vectors[fs]!], b = [...this.vectors[ft]!];
    const write = (destination: number, values: readonly number[]) => {
      if (destination !== 0) for (let lane = 0; lane < 4; lane++) if (mask & (8 >> lane)) this.vectors[destination]![lane] = values[lane]!;
    };
    const binary = (kind: number, scalar?: number, acc = false) => {
      const values = a.map((v,i) => {
        const t = scalar ?? b[i]!, product = Math.fround(v * t);
        return kind === 0 ? Math.fround(v + t) : kind === 1 ? Math.fround(v - t) : kind === 2 ? product
          : kind === 3 ? Math.fround(this.accumulator[i]! + product) : Math.fround(this.accumulator[i]! - product);
      });
      if (acc) { for (let i=0;i<4;i++) if (mask & (8 >> i)) this.accumulator[i] = values[i]!; }
      else write(fd,values);
    };
    if (fn < 4) binary(0,b[fn]);
    else if (fn < 8) binary(1,b[fn & 3]);
    else if (fn < 12) binary(3,b[fn & 3]);
    else if (fn < 16) binary(4,b[fn & 3]);
    else if (fn >= 24 && fn < 28) binary(2,b[fn & 3]);
    else if (fn === 28) binary(2,this.q);
    else if (fn === 32) binary(0,this.q);
    else if (fn === 40) binary(0);
    else if (fn === 41) binary(3);
    else if (fn === 42) binary(2);
    else if (fn === 44) binary(1);
    else if (fn === 46) {
      write(fd,[0,1,2,3].map(i => i === 3 ? 0 : Math.fround(this.accumulator[i]! - Math.fround(a[(i+1)%3]! * b[(i+2)%3]!))));
    } else if (fn >= 60) {
      const special = (word & 3) | (word >>> 4 & 124);
      if (special >= 8 && special < 12) binary(3,b[special & 3],true);
      else if (special >= 24 && special < 28) binary(2,b[special & 3],true);
      else if (special === 46) {
        for (let i=0;i<3;i++) this.accumulator[i] = a[(i+1)%3]! * b[(i+2)%3]!;
      } else if (special === 47 || special === 59) { /* VNOP / VWAITQ */ }
      else if (special === 48) {
        const source = [...this.words[fs]!];
        if (ft !== 0) for (let i=0;i<4;i++) if (mask & (8 >> i)) this.words[ft]![i] = source[i]!;
      } else if (special === 49) {
        const source = [...this.words[fs]!];
        if (ft !== 0) for (let i=0;i<4;i++) if (mask & (8 >> i)) this.words[ft]![i] = source[(i+1)%4]!;
      } else if (special === 56) {
        const numerator = a[word >>> 21 & 3]!, denominator = b[word >>> 23 & 3]!;
        this.q = denominator === 0 ? (Math.sign(numerator) || 1) * (Object.is(denominator,-0) ? -1 : 1) * 3.4028234663852886e38
          : Math.fround(numerator / denominator);
      } else if (special === 57) this.q = Math.fround(Math.sqrt(Math.abs(b[word >>> 23 & 3]!)));
      else if (special === 16 || special === 19 || special === 20 || special === 23) {
        if (ft !== 0) for (let i=0;i<4;i++) if (mask & (8 >> i)) {
          const scale = (special & 3) === 3 ? 32768 : 1;
          if (special < 20) this.vectors[ft]![i] = Math.fround(this.words[fs]![i]! | 0) / scale;
          else this.words[ft]![i] = Math.max(-2147483648,Math.min(2147483647,Math.trunc(Math.fround(a[i]! * scale))));
        }
      } else throw new Error(`Unsupported VU special ${special} word ${word.toString(16)}`);
    } else throw new Error(`Unsupported VU word ${word.toString(16)}`);
  }
}
