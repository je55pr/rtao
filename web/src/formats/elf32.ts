import { BinaryView } from "../core/binary";

interface ElfSegment {
  readonly fileOffset: number;
  readonly virtualAddress: number;
  readonly fileSize: number;
}

export class Elf32AddressSpace {
  private readonly data: BinaryView;
  private readonly segments: ElfSegment[] = [];

  constructor(bytes: Uint8Array) {
    this.data = new BinaryView(bytes);
    if (bytes.length < 0x34 || this.data.u32(0) !== 0x464c457f) throw new Error("Expected an ELF executable.");
    if (this.data.u8(4) !== 1 || this.data.u8(5) !== 1) throw new Error("Only little-endian ELF32 images are supported.");
    const programHeaderOffset = this.data.u32(0x1c);
    const entrySize = this.data.u16(0x2a);
    const count = this.data.u16(0x2c);
    if (entrySize < 32) throw new Error("ELF program-header entry is unexpectedly small.");
    for (let index = 0; index < count; index += 1) {
      const offset = programHeaderOffset + index * entrySize;
      if (this.data.u32(offset) !== 1) continue;
      this.segments.push({
        fileOffset: this.data.u32(offset + 4),
        virtualAddress: this.data.u32(offset + 8),
        fileSize: this.data.u32(offset + 16),
      });
    }
    if (this.segments.length === 0) throw new Error("ELF contains no file-backed PT_LOAD segment.");
  }

  u32(virtualAddress: number): number { return this.data.u32(this.map(virtualAddress, 4)); }
  f32(virtualAddress: number): number { return this.data.f32(this.map(virtualAddress, 4)); }
  bytes(virtualAddress: number, count: number): Uint8Array { return this.data.slice(this.map(virtualAddress, count), count); }

  isFileBacked(virtualAddress: number, count = 1): boolean {
    try { this.map(virtualAddress, count); return true; } catch { return false; }
  }

  asciiZ(virtualAddress: number, maxLength = 256): string {
    const offset = this.map(virtualAddress, 1);
    let length = 0;
    while (length < maxLength && offset + length < this.data.length && this.data.u8(offset + length) !== 0) length += 1;
    return new TextDecoder("ascii").decode(this.data.span(offset, length));
  }

  private map(virtualAddress: number, count: number): number {
    for (const segment of this.segments) {
      if (virtualAddress < segment.virtualAddress || virtualAddress + count > segment.virtualAddress + segment.fileSize) continue;
      const offset = segment.fileOffset + virtualAddress - segment.virtualAddress;
      this.data.assertRange(offset, count, "ELF virtual address");
      return offset;
    }
    throw new Error(`Virtual address 0x${virtualAddress.toString(16)} (+${count}) is not backed by ELF file data.`);
  }
}
