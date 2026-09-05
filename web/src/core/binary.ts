export class BinaryView {
  readonly bytes: Uint8Array;
  readonly view: DataView;

  constructor(source: ArrayBuffer | Uint8Array) {
    this.bytes = source instanceof Uint8Array ? source : new Uint8Array(source);
    this.view = new DataView(
      this.bytes.buffer,
      this.bytes.byteOffset,
      this.bytes.byteLength,
    );
  }

  get length(): number {
    return this.bytes.byteLength;
  }

  assertRange(offset: number, length: number, context = "binary read"): void {
    if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(length) || offset < 0 || length < 0 || offset + length > this.length) {
      throw new RangeError(`${context} [${offset}, ${offset + length}) exceeds ${this.length} bytes.`);
    }
  }

  u8(offset: number): number {
    this.assertRange(offset, 1);
    return this.view.getUint8(offset);
  }

  u16(offset: number): number {
    this.assertRange(offset, 2);
    return this.view.getUint16(offset, true);
  }

  u32(offset: number): number {
    this.assertRange(offset, 4);
    return this.view.getUint32(offset, true);
  }

  u32be(offset: number): number {
    this.assertRange(offset, 4);
    return this.view.getUint32(offset, false);
  }

  i32(offset: number): number {
    this.assertRange(offset, 4);
    return this.view.getInt32(offset, true);
  }

  f32(offset: number): number {
    this.assertRange(offset, 4);
    return this.view.getFloat32(offset, true);
  }

  u64(offset: number): bigint {
    this.assertRange(offset, 8);
    return this.view.getBigUint64(offset, true);
  }

  slice(offset: number, length: number): Uint8Array {
    this.assertRange(offset, length);
    return this.bytes.slice(offset, offset + length);
  }

  span(offset: number, length: number): Uint8Array {
    this.assertRange(offset, length);
    return this.bytes.subarray(offset, offset + length);
  }

  ascii(offset: number, length: number): string {
    return new TextDecoder("ascii").decode(this.span(offset, length));
  }
}

export function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

export function hex(value: number | bigint, width = 0): string {
  return `0x${value.toString(16).toUpperCase().padStart(width, "0")}`;
}
