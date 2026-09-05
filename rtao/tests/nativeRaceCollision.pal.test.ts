import { closeSync, fstatSync, openSync, readFileSync, readSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { describe, expect, test } from 'vitest';
import { NativeRaceCollisionSampler, nativeRaceCollisionCell, queryNativeRaceCollisionChunk, type NativeRaceCollisionPoint } from '../src/game/nativeRaceCollision';
import { Iso9660Disc } from '../src/disc/iso9660';
import { RawMode2SectorSource } from '../src/disc/randomAccess';
import { readCollisionChunkDirectory, readFieldHeader } from '../src/formats/field';
import { nativeRaceStartSeed, readRaceStartAnchors } from '../src/formats/raceCatalogue';
import { PalScalarMachine } from '../test-support/palScalarMachine';

interface Packet { vertices: readonly (readonly [number, number, number])[]; slopes: readonly (readonly [number, number])[]; flags: number }
function encode(packets: readonly Packet[]): Uint8Array {
  const bytes = new Uint8Array(packets.reduce((n, p) => n + p.vertices.length * 32 - 16, 0));
  const v = new DataView(bytes.buffer);
  let offset = 0;
  for (const p of packets) {
    v.setUint32(offset, p.vertices.length, true); v.setUint32(offset + 12, p.flags, true);
    p.vertices.forEach((xyz, i) => xyz.forEach((n, j) => v.setFloat32(offset + 16 + i * 16 + j * 4, n, true)));
    p.slopes.forEach(([x, z], i) => {
      v.setFloat32(offset + 16 + p.vertices.length * 16 + i * 16, x, true);
      v.setFloat32(offset + 24 + p.vertices.length * 16 + i * 16, z, true);
    });
    offset += p.vertices.length * 32 - 16;
  }
  return bytes;
}

const executablePath = process.env.RTA_PAL_EXECUTABLE;
describe.skipIf(!executablePath)('PAL native course collision query', () => {
  function oracle() {
    const m = new PalScalarMachine(new Uint8Array(readFileSync(executablePath!))), v = m.view;
    const chunk = 0x1000000, pointAddress = 0x1010000, outputs = 0x1010100;
    return (bytes: Uint8Array, count: number, point: NativeRaceCollisionPoint) => {
      m.memory.set(bytes, chunk);
      point.forEach((n, i) => v.setFloat32(pointAddress + i * 4, n, true));
      v.setUint32(outputs, 0, true); v.setFloat32(outputs + 4, -10000, true);
      v.setFloat32(outputs + 8, 10000, true); v.setFloat32(outputs + 12, 0, true);
      const flags = m.run(0x207748, [chunk, pointAddress, outputs, count, outputs + 4, outputs + 8, outputs + 12, -1]) | 0;
      const plane = v.getUint32(outputs, true);
      return { flags, planeOffset: plane === 0 ? null : plane - chunk,
        groundY:v.getFloat32(outputs + 4, true), ceilingY:v.getFloat32(outputs + 8, true), extraY:v.getFloat32(outputs + 12, true) };
    };
  }

  test('8192 seeded strip queries match all PAL output writes', () => {
    const runPal = oracle();
    let seed = 0x636f6c6c;
    const rand = (): number => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed; };
    let selected = 0, ceiling = 0, extra = 0, signedGround = 0;
    for (let i = 0; i < 8192; i++) {
      const packets: Packet[] = Array.from({length:i % 9}, () => {
        const height = (rand() % 2001 - 1000) / 32;
        const count = 3 + rand() % 4;
        const slopeX = (rand() % 101 - 50) / 128, slopeZ = (rand() % 101 - 50) / 128;
        const vertices = Array.from({length:count}, (_, j): [number, number, number] => {
          const x = Math.floor(j / 2) * 10, z = j % 2 * 10;
          return [x, height - x * slopeX - z * slopeZ, z];
        });
        return { vertices, slopes:Array.from({length:count - 2}, (): [number, number] => [slopeX, slopeZ]),
          flags:[0, 3, 0x80000000, 0x80000007, 0x10000000, 0x10000008][rand() % 6]! };
      });
      const bytes = encode(packets);
      const point: NativeRaceCollisionPoint = [i % 4 === 0 ? (rand() % 4) * 10 : (rand() % 3001 - 500) / 128,
        (rand() % 2001 - 1000) / 32, i % 4 === 0 ? (rand() % 2) * 10 : (rand() % 2001 - 500) / 128, 17];
      const expected = runPal(bytes, packets.length, point);
      expect(queryNativeRaceCollisionChunk(bytes, 0, packets.length, point), `case ${i}`).toEqual(expected);
      selected += expected.flags >= 0 ? 1 : 0; ceiling += expected.ceilingY < 10000 ? 1 : 0;
      extra += expected.extraY !== 0 ? 1 : 0; signedGround += expected.flags === -1 && expected.groundY > -10000 ? 1 : 0;
    }
    for (const count of [selected, ceiling, extra, signedGround]) expect(count).toBeGreaterThan(100);
  });

  test('preserves signed-surface equality, packet order and last extra-height write', () => {
    const runPal = oracle();
    const packet = (height: number, flags: number): Packet => ({
      vertices:[[0,height,0], [0,height,10], [10,height,0]], slopes:[[0,0]], flags,
    });
    const cases = [
      [packet(5, 0x80000000)],
      [packet(0, 3), packet(3, 0x80000000)],
      [packet(3, 0x80000000), packet(2, 7)],
      [packet(3, 0), packet(3, 7)],
      [packet(9, 0x10000000), packet(1, 0x10000000)],
      [packet(7, 3), packet(6, 0x80000000)],
    ];
    for (const packets of cases) for (const y of [2, 3, 5, 7]) {
      const bytes = encode(packets), point: NativeRaceCollisionPoint = [2, y, 2, 0];
      expect(queryNativeRaceCollisionChunk(bytes, 0, packets.length, point)).toEqual(runPal(bytes, packets.length, point));
    }
    const bytes = encode(cases[1]!);
    expect(queryNativeRaceCollisionChunk(bytes, 0, 2, [2,5,2,0])).toMatchObject({flags:3, groundY:3});
    expect(queryNativeRaceCollisionChunk(encode(cases[2]!), 0, 2, [2,5,2,0])).toMatchObject({flags:-1, groundY:3});
  });

  test('course wrapper selects one wrapped cell and preserves point writes on misses', () => {
    const m = new PalScalarMachine(new Uint8Array(readFileSync(executablePath!))), v = m.view;
    const pointAddress = 0x1000000, aux = 0x1000100, plane = 0x1000200, scene = 0x1001000, directory = 0x1002000;
    v.setUint32(scene + 0x78, directory, true);
    for (let cell = 0; cell < 256; cell++) {
      v.setUint32(directory + cell * 4, 0x1100000 + cell * 32, true);
      v.setInt16(directory + 0x400 + cell * 2, cell, true);
    }
    const coordinates = [-1600, -100.00001, -100, -99.99999, -0.001, 0, 99.99999, 100, 1599.9999, 1600, 1700];
    for (const x of coordinates) for (const z of coordinates) for (const flags of [-1, 0, 7]) {
      [x, 11, z, 19].forEach((n, i) => v.setFloat32(pointAddress + i * 4, n, true));
      let selected = -1;
      const result = m.run(0x208c50, [pointAddress, aux, plane, 0, scene], {
        0x207748: a => {
          selected = a[3]!;
          expect(a[0]).toBe(0x1100000 + selected * 32);
          expect(v.getFloat32(a[4]!, true)).toBe(-10000);
          expect(v.getFloat32(a[5]!, true)).toBe(10000);
          expect(v.getFloat32(a[6]!, true)).toBe(0);
          v.setFloat32(a[4]!, 5, true); v.setFloat32(a[5]!, 9, true); v.setFloat32(a[6]!, 13, true);
          return flags;
        },
      }) | 0;
      expect(selected).toBe(nativeRaceCollisionCell(x, z));
      expect(result).toBe(flags); expect(v.getFloat32(aux, true)).toBe(9);
      expect(v.getFloat32(pointAddress + 4, true)).toBe(flags < 0 ? 11 : 5);
      expect(v.getFloat32(pointAddress + 12, true)).toBe(flags < 0 ? 19 : 13);
    }
  });

  test.skipIf(!process.env.RTA_PAL_BIN)('original records in all 15 courses match the complete PAL wrapper', async () => {
    const handle = openSync(process.env.RTA_PAL_BIN!, 'r');
    try {
      const disc = await Iso9660Disc.open(new RawMode2SectorSource({
        size:fstatSync(handle).size, label:'local PAL BIN',
        async read(offset, length) {
          const bytes = new Uint8Array(length);
          if (readSync(handle, bytes, 0, length, offset) !== length) throw new Error('Short PAL BIN read.');
          return bytes;
        },
      }));
      const elf = new Uint8Array(readFileSync(executablePath!));
      const m = new PalScalarMachine(elf), v = m.view;
      const anchors = readRaceStartAnchors(elf);
      const directory = 0x1000000, pointAddress = 0x1d00000, aux = pointAddress + 16, plane = aux + 4, scene = aux + 16;
      let queries = 0, hits = 0;
      const digest = createHash('sha256');
      for (let course = 0; course < 15; course++) {
        const bytes = await disc.readFile(`COURSE/C${String(course).padStart(2, '0')}.BIN`);
        const header = readFieldHeader(bytes), chunks = readCollisionChunkDirectory(bytes, header).chunks;
        const sampler = new NativeRaceCollisionSampler(bytes), source = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        m.memory.set(bytes.subarray(header.collision.offset, header.collision.offset + header.collision.length), directory);
        v.setUint32(scene + 0x78, directory, true);
        for (const chunk of chunks) v.setUint32(directory + chunk.index * 4, directory + chunk.relativeOffset, true);
        const points: NativeRaceCollisionPoint[] = [];
        for (let slot = 0; slot < 24; slot++) {
          const seed = nativeRaceStartSeed(anchors[course]!, slot);
          points.push([seed.nativeX, seed.nativeY, seed.nativeZ, 0]);
        }
        // Sample an authored triangle centroid in every populated cell, at three heights.
        for (const chunk of chunks) {
          if (chunk.declaredPacketCount === 0) continue;
          const start = header.collision.offset + chunk.relativeOffset + 16;
          if ((source.getUint32(start - 16, true) & 0x7fff) < 3) continue;
          const xyz = [0,4,8].map(axis => (source.getFloat32(start + axis, true)
            + source.getFloat32(start + 16 + axis, true) + source.getFloat32(start + 32 + axis, true)) / 3);
          for (const height of [-1, 0, 1]) points.push([xyz[0]!, xyz[1]! + height, xyz[2]!, 23]);
        }
        for (const point of points) {
          point.forEach((n, i) => v.setFloat32(pointAddress + i * 4, n, true));
          v.setUint32(plane, 0, true);
          const flags = m.run(0x208c50, [pointAddress, aux, plane, 0, scene]) | 0;
          const planeAddress = v.getUint32(plane, true);
          const expected = { flags, planeOffset:planeAddress === 0 ? null : planeAddress - directory + header.collision.offset,
            groundY:v.getFloat32(0x1f00000 - 48, true), ceilingY:v.getFloat32(aux, true),
            extraY:v.getFloat32(0x1f00000 - 40, true),
            point:Array.from({length:4}, (_, i) => v.getFloat32(pointAddress + i * 4, true)) };
          expect(sampler.query(point), `course ${course}, point ${point}`).toEqual(expected);
          digest.update(JSON.stringify({ course, point, expected }) + '\n');
          queries++; hits += flags >= 0 ? 1 : 0;
        }
      }
      expect(queries).toBeGreaterThan(1000); expect(hits).toBeGreaterThan(500);
      if (process.env.RTA_RACE_COLLISION_REPORT) writeFileSync(process.env.RTA_RACE_COLLISION_REPORT,
        JSON.stringify({ authority:'SLES_513.56', courses:15, gridQueries:360, queries, hits,
          outputSha256:digest.digest('hex'), syntheticInstructionCases:8192, wrapperBoundaryCases:363 }, null, 2) + '\n');
    } finally { closeSync(handle); }
  });
});
