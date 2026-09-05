import { describe, expect, test } from "vitest";
import { Elf32AddressSpace } from "./elf32";
import { decodeCarPaint } from "./overworld";

describe("PAL executable data", () => {
  test("maps file-backed ELF32 virtual addresses", () => {
    const bytes = new Uint8Array(0x200);
    const view = new DataView(bytes.buffer);
    bytes.set([0x7f, 0x45, 0x4c, 0x46, 1, 1], 0);
    view.setUint32(0x1c, 0x34, true); view.setUint16(0x2a, 32, true); view.setUint16(0x2c, 1, true);
    view.setUint32(0x34, 1, true); view.setUint32(0x38, 0x100, true); view.setUint32(0x3c, 0x200000, true);
    view.setUint32(0x44, 0x100, true); view.setUint32(0x48, 0x100, true);
    view.setUint32(0x110, 0x12345678, true); bytes.set(new TextEncoder().encode("Peach\0"), 0x120);
    const elf = new Elf32AddressSpace(bytes);
    expect(elf.u32(0x200010)).toBe(0x12345678);
    expect(elf.asciiZ(0x200020)).toBe("Peach");
  });

  test("uses the executable's non-linear RGB444 paint intensity table", () => {
    expect(decodeCarPaint(0x00f)).toEqual({ primary: { r: 216, g: 25, b: 25 }, secondary: { r: 25, g: 25, b: 25 } });
  });
});
