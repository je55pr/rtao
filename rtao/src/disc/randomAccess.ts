export interface RandomAccessSource {
  readonly size: number;
  readonly label: string;
  read(offset: number, length: number): Promise<Uint8Array>;
}

export class BlobSource implements RandomAccessSource {
  constructor(
    private readonly blob: Blob,
    readonly label: string,
  ) {}

  get size(): number {
    return this.blob.size;
  }

  async read(offset: number, length: number): Promise<Uint8Array> {
    assertReadRange(this.size, offset, length, this.label);
    return new Uint8Array(await this.blob.slice(offset, offset + length).arrayBuffer());
  }
}

export class MemorySource implements RandomAccessSource {
  private readonly bytes: Uint8Array;

  constructor(bytes: Uint8Array, readonly label = "memory") {
    this.bytes = bytes;
  }

  get size(): number {
    return this.bytes.byteLength;
  }

  async read(offset: number, length: number): Promise<Uint8Array> {
    assertReadRange(this.size, offset, length, this.label);
    return this.bytes.slice(offset, offset + length);
  }
}

export class RawMode2SectorSource implements RandomAccessSource {
  static readonly rawSectorSize = 2352;
  static readonly userDataOffset = 24;
  static readonly userDataSize = 2048;

  private readonly sectorCount: number;

  constructor(
    private readonly source: RandomAccessSource,
    private readonly firstSector = 0,
  ) {
    if (source.size % RawMode2SectorSource.rawSectorSize !== 0) {
      throw new Error("MODE2/2352 BIN size is not a multiple of 2352 bytes.");
    }
    const totalSectors = source.size / RawMode2SectorSource.rawSectorSize;
    if (!Number.isSafeInteger(firstSector) || firstSector < 0 || firstSector >= totalSectors) {
      throw new Error("CUE INDEX points beyond the BIN image.");
    }
    this.sectorCount = totalSectors - firstSector;
  }

  get label(): string {
    return `MODE2/2352: ${this.source.label}`;
  }

  get size(): number {
    return this.sectorCount * RawMode2SectorSource.userDataSize;
  }

  async read(offset: number, length: number): Promise<Uint8Array> {
    assertReadRange(this.size, offset, length, this.label);
    if (length === 0) return new Uint8Array();

    const first = Math.floor(offset / RawMode2SectorSource.userDataSize);
    const last = Math.floor((offset + length - 1) / RawMode2SectorSource.userDataSize);
    const rawSectorCount = last - first + 1;
    // A BIN-backed OPFS Blob has meaningful per-read latency. Reading one raw
    // sector at a time turned a 500 KiB car into hundreds of asynchronous file
    // operations. Fetch the contiguous raw span once, then project its 2048-byte
    // user-data sectors in memory.
    const rawStart = (this.firstSector + first) * RawMode2SectorSource.rawSectorSize;
    const rawSpan = await this.source.read(rawStart, rawSectorCount * RawMode2SectorSource.rawSectorSize);
    const output = new Uint8Array(length);
    let written = 0;

    for (let sector = first; sector <= last; sector += 1) {
      const rawOffset = (sector - first) * RawMode2SectorSource.rawSectorSize;
      if (rawSpan[rawOffset] !== 0x00 || rawSpan[rawOffset + 1] !== 0xff || rawSpan[rawOffset + 11] !== 0x00 || rawSpan[rawOffset + 15] !== 0x02) {
        throw new Error(`Sector ${sector} is not a MODE2 raw sector.`);
      }

      const sectorStart = sector * RawMode2SectorSource.userDataSize;
      const from = Math.max(offset, sectorStart) - sectorStart;
      const to = Math.min(offset + length, sectorStart + RawMode2SectorSource.userDataSize) - sectorStart;
      const chunk = rawSpan.subarray(
        rawOffset + RawMode2SectorSource.userDataOffset + from,
        rawOffset + RawMode2SectorSource.userDataOffset + to,
      );
      output.set(chunk, written);
      written += chunk.byteLength;
    }
    return output;
  }
}

function assertReadRange(size: number, offset: number, length: number, label: string): void {
  if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(length) || offset < 0 || length < 0 || offset + length > size) {
    throw new RangeError(`${label}: byte range [${offset}, ${offset + length}) exceeds ${size}.`);
  }
}
