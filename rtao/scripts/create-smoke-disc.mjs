import { mkdir, writeFile } from "node:fs/promises";
import { BlobWriter, Uint8ArrayReader, ZipWriter } from "@zip.js/zip.js";

const sectorSize = 2048;
const outputDirectory = new URL("../test-output/", import.meta.url);
const encoder = new TextEncoder();

const files = new Map([
  ["SYSTEM.CNF", encoder.encode("BOOT2 = cdrom0:\\\\SLES_513.56;1\r\nVER = 1.02\r\nVMODE = PAL\r\n")],
  ["SLES_513.56", encoder.encode("RTA browser smoke fixture; no original game data.\n")],
  ["SYS/SORA.GSL", new Uint8Array()],
  ["CARS/TIRE.BIN", new Uint8Array()],
  ["SHOP/T00.BIN", new Uint8Array()],
]);
for (let a = 0; a < 4; a += 1) {
  for (let b = 0; b < 4; b += 1) {
    for (let c = 0; c < 4; c += 1) {
      const field = `${a}${b}${c}`;
      files.set(`FLD/${field}.BIN`, createField(field === "223"));
    }
  }
}

const iso = createIso(files, ["SYS", "CARS", "SHOP", "FLD", "CAR2"]);
await mkdir(outputDirectory, { recursive: true });
await writeFile(new URL("rta-smoke.iso", outputDirectory), iso);

const zipWriter = new ZipWriter(new BlobWriter("application/zip"));
await zipWriter.add("Road Trip Adventure smoke.iso", new Uint8ArrayReader(iso));
const zip = await zipWriter.close();
await writeFile(new URL("rta-smoke.zip", outputDirectory), new Uint8Array(await zip.arrayBuffer()));
const rawBin = wrapRawMode2(iso);
const cue = encoder.encode(`FILE "Road Trip Adventure smoke.bin" BINARY\r\n  TRACK 01 MODE2/2352\r\n    INDEX 01 00:00:00\r\n`);
const binCueWriter = new ZipWriter(new BlobWriter("application/zip"));
await binCueWriter.add("Road Trip Adventure smoke.cue", new Uint8ArrayReader(cue));
await binCueWriter.add("Road Trip Adventure smoke.bin", new Uint8ArrayReader(rawBin));
const binCueZip = await binCueWriter.close();
await writeFile(new URL("rta-smoke-bin-cue.zip", outputDirectory), new Uint8Array(await binCueZip.arrayBuffer()));
console.log(`Generated clean-room smoke fixtures: ISO ${(iso.length / 1024).toFixed(0)} KiB, ZIP ${(zip.size / 1024).toFixed(0)} KiB, BIN/CUE ZIP ${(binCueZip.size / 1024).toFixed(0)} KiB.`);

function createField(withTriangle) {
  const texture = endDmaChain();
  const render = withTriangle ? renderSectionWithTriangle() : emptyChunkDirectory(65, 390);
  const collision = emptyChunkDirectory(256, 1536);
  const offsets = [16, 16 + texture.length, 16 + texture.length + render.length, 16 + texture.length + render.length + collision.length];
  const output = new Uint8Array(offsets.at(-1));
  const view = new DataView(output.buffer);
  offsets.forEach((value, index) => view.setUint32(index * 4, value, true));
  output.set(texture, offsets[0]);
  output.set(render, offsets[1]);
  output.set(collision, offsets[2]);
  return output;
}

function emptyChunkDirectory(count, length) {
  const output = new Uint8Array(length);
  const view = new DataView(output.buffer);
  for (let index = 0; index < count; index += 1) view.setUint32(index * 4, length, true);
  return output;
}

function renderSectionWithTriangle() {
  const directoryLength = 400;
  const first = triangleDmaChain();
  const empty = endDmaChain();
  const output = new Uint8Array(directoryLength + first.length + 64 * empty.length);
  const view = new DataView(output.buffer);
  let offset = directoryLength;
  for (let index = 0; index < 65; index += 1) {
    view.setUint32(index * 4, offset, true);
    view.setUint16(65 * 4 + index * 2, index === 0 ? 1 : 0, true);
    const chain = index === 0 ? first : empty;
    output.set(chain, offset);
    offset += chain.length;
  }
  return output;
}

function triangleDmaChain() {
  const payload = new Uint8Array(272);
  const view = new DataView(payload.buffer);
  let cursor = 0;
  cursor = writeVif(view, cursor, 0x68, 4, 0);
  for (const register of [0x0e, 0x15, 0x07, 0x09]) {
    view.setUint32(cursor + 8, register, true);
    cursor += 12;
  }
  cursor = writeVif(view, cursor, 0x6c, 1, 0);
  const gifLow = 3n | (1n << 46n) | (4n << 47n);
  view.setBigUint64(cursor, gifLow, true);
  view.setBigUint64(cursor + 8, 0n, true);
  cursor += 16;
  cursor = writeVif(view, cursor, 0x68, 15, 0);
  const vertices = [
    [[200, 0, 200], [128, 48, 40]],
    [[1400, 0, 200], [40, 128, 48]],
    [[800, 0, 1400], [48, 60, 128]],
  ];
  for (const [position, color] of vertices) {
    for (const vector of [position, color, [0,0,0], color, [0,0,1]]) {
      for (const value of vector) { view.setFloat32(cursor, value, true); cursor += 4; }
    }
  }
  cursor = writeVif(view, cursor, 0x15, 0, 8);
  while (cursor < payload.length) cursor = writeVif(view, cursor, 0, 0, 0);

  const output = new Uint8Array(16 + payload.length + 16);
  const chainView = new DataView(output.buffer);
  chainView.setBigUint64(0, 17n | (1n << 28n), true);
  output.set(payload, 16);
  chainView.setBigUint64(16 + payload.length, 7n << 28n, true);
  return output;
}

function writeVif(view, offset, command, count, immediate) {
  view.setUint32(offset, (command << 24) | (count << 16) | immediate, true);
  return offset + 4;
}

function endDmaChain() {
  const output = new Uint8Array(16);
  new DataView(output.buffer).setBigUint64(0, 7n << 28n, true);
  return output;
}

function createIso(fileMap, directoryNames) {
  const tree = { name: "", directories: new Map(), files: [] };
  for (const directory of directoryNames) tree.directories.set(directory, { name: directory, directories: new Map(), files: [] });
  for (const [path, bytes] of fileMap) {
    const parts = path.split("/");
    const name = parts.pop();
    let node = tree;
    for (const component of parts) {
      let next = node.directories.get(component);
      if (!next) { next = { name: component, directories: new Map(), files: [] }; node.directories.set(component, next); }
      node = next;
    }
    node.files.push({ name, bytes });
  }

  const directories = [tree, ...tree.directories.values()];
  let nextSector = 20;
  for (const directory of directories) {
    directory.extent = nextSector;
    directory.size = directory.name === "FLD" ? sectorSize * 2 : sectorSize;
    nextSector += directory.size / sectorSize;
  }
  for (const directory of directories) {
    for (const file of directory.files) {
      file.extent = nextSector;
      nextSector += Math.ceil(Math.max(1, file.bytes.length) / sectorSize);
    }
  }
  const output = new Uint8Array(nextSector * sectorSize);
  const view = new DataView(output.buffer);
  const pvd = 16 * sectorSize;
  output[pvd] = 1; output.set(encoder.encode("CD001"), pvd + 1); output[pvd + 6] = 1;
  writeRecord(output, view, pvd + 156, "\0", tree.extent, tree.size, true);
  const terminator = 17 * sectorSize;
  output[terminator] = 255; output.set(encoder.encode("CD001"), terminator + 1); output[terminator + 6] = 1;

  for (const directory of directories) {
    let cursor = directory.extent * sectorSize;
    cursor = appendRecord(output, view, cursor, directory, "\0", directory.extent, directory.size, true);
    cursor = appendRecord(output, view, cursor, directory, "\u0001", tree.extent, tree.size, true);
    for (const child of directory.directories.values()) cursor = appendRecord(output, view, cursor, directory, child.name, child.extent, child.size, true);
    for (const file of directory.files) {
      cursor = appendRecord(output, view, cursor, directory, `${file.name};1`, file.extent, file.bytes.length, false);
      output.set(file.bytes, file.extent * sectorSize);
    }
  }
  return output;
}

function appendRecord(output, view, cursor, directory, name, extent, size, isDirectory) {
  const length = recordLength(name);
  const withinSector = cursor % sectorSize;
  if (withinSector + length > sectorSize) cursor += sectorSize - withinSector;
  const end = writeRecord(output, view, cursor, name, extent, size, isDirectory);
  if (end > directory.extent * sectorSize + directory.size) throw new Error(`${directory.name || "root"} directory overflow.`);
  return end;
}

function recordLength(name) {
  const length = encoder.encode(name).length;
  return 33 + length + (length % 2 === 0 ? 1 : 0);
}

function writeRecord(output, view, offset, name, extent, size, isDirectory) {
  const nameBytes = encoder.encode(name), length = recordLength(name);
  output[offset] = length;
  view.setUint32(offset + 2, extent, true); view.setUint32(offset + 6, extent, false);
  view.setUint32(offset + 10, size, true); view.setUint32(offset + 14, size, false);
  output[offset + 25] = isDirectory ? 2 : 0;
  output[offset + 28] = 1; output[offset + 30] = 0; output[offset + 31] = 1;
  output[offset + 32] = nameBytes.length; output.set(nameBytes, offset + 33);
  return offset + length;
}

function wrapRawMode2(cooked) {
  const sectors = cooked.length / sectorSize;
  const raw = new Uint8Array(sectors * 2352);
  for (let sector = 0; sector < sectors; sector += 1) {
    const offset = sector * 2352;
    raw[offset] = 0;
    raw.fill(0xff, offset + 1, offset + 11);
    raw[offset + 11] = 0;
    raw[offset + 15] = 2;
    raw.set(cooked.subarray(sector * sectorSize, sector * sectorSize + sectorSize), offset + 24);
  }
  return raw;
}
