import { closeSync, fstatSync, openSync, readFileSync, readSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { describe, expect, test } from 'vitest';
import { produceNativeRaceContacts, readNativeRaceContactData, type NativeRaceContactInput } from '../src/game/nativeRaceContact';
import { NativeRaceCollisionSampler, type NativeRaceCollisionPoint as Point } from '../src/game/nativeRaceCollision';
import { palRaceContactOracle } from '../test-support/palRaceContactOracle';
import { Iso9660Disc } from '../src/disc/iso9660';
import { RawMode2SectorSource } from '../src/disc/randomAccess';
import { readCollisionChunkDirectory, readFieldHeader } from '../src/formats/field';
import { nativeRaceStartSeed, readRaceStartAnchors } from '../src/formats/raceCatalogue';

const executablePath = process.env.RTA_PAL_EXECUTABLE;
const baseline = (): NativeRaceContactInput => ({
  state:{position:[0, 0, 0], referenceY:0, support:[4096,4096,4096], supportDelta:[0,0,0], impulses:[0,0,0],
    unsupportedTicks:0, runtimeFlags:0, specialState:0, yaw:0},
  equipmentFlags:0, globalEquipmentFlags:0, carFlags:2, sceneFlags:4, sceneByte0B:0, sceneCommands:[0,0],
  localX:0, localZ:0, responseZ:0, responseW:0, verticalImpulse:-89, commands:0,
});
const transform = (points: readonly Point[]) => (_probe: Point, translation: Point, i: number): Point =>
  points[i]!.map((n, j) => Math.fround(Math.fround(n) + translation[j]!)) as unknown as Point;
function scalarResult(result: ReturnType<typeof produceNativeRaceContacts>) {
  const {missFlags: _miss, supportFlags: _support, ...rest} = result;
  return rest;
}

describe.skipIf(!executablePath)('PAL seven-probe contact producer', () => {
  test('8192 prescribed-transform cases match scalar writes, ordering and orientation arguments', () => {
    const elf = new Uint8Array(readFileSync(executablePath!)), data = readNativeRaceContactData(elf), oracle = palRaceContactOracle(elf);
    let seed = 0x636e7463;
    const rand = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed; };
    const pick = <T,>(values: readonly T[]): T => values[(rand() >>> 8) % values.length]!;
    const counts = {miss:0, clamp:0, ceiling:0, impact:0, sound:0, special:0, equalized:0, mode64:0, mode128:0};
    for (let i = 0; i < 8192; i++) {
      const input: NativeRaceContactInput = {...baseline(),
        state:{position:[pick([-0x2000001,-0x1000000,-1,0,0xffffff,0x1000000,0x1ffffff,0x2000000,0xfffffff]), rand() % 65537 - 32768,
          pick([-0x2000001,-1,0,0x1ffffff,0x2000000,0x2000001,0xfffffff])],
        referenceY:pick([-2,-1,-0.5,0,0.5,1,2]), support:Array.from({length:3}, () => pick([0,1,4096,8192])),
        supportDelta:Array.from({length:3}, () => rand() % 2001 - 1000), impulses:Array.from({length:3}, () => pick([0,178,179,-701,999])),
        unsupportedTicks:pick([0,64,65,66]), runtimeFlags:pick([0,1,0x40,0x80]), specialState:pick([-1,0,1]), yaw:rand() & 65535},
        equipmentFlags:pick([0,8,0x100,0x400,0x508]), globalEquipmentFlags:pick([0,0x400]),
        carFlags:pick([0,2,3,0x10,0x80]), sceneFlags:pick([0,4,0x40,0x48]), sceneByte0B:pick([0,1]),
        sceneCommands:[pick([0,0x1000,0x4000,0x5000]),pick([0,0x1000,0x4000,0x5000])],
        localX:rand() % 10001 - 5000, localZ:rand() % 10001 - 5000,
        responseZ:pick([-8193,-9,-1,0,8192,8193]), responseW:rand() % 301 - 150, verticalImpulse:rand() % 301 - 150,
        commands:pick([0,0x8000,0x2000,0xa000]),
      };
      const transformed = Array.from({length:7}, (_, j): Point => [j - 3,(rand() % 129 - 64) / 32,(j * 3) % 7 - 3,0]);
      const hits = Array.from({length:7}, () => ({flags:pick([-1,0,3,0x3005]), delta:pick([-2,-0.01,0,0.64,1.28,2]),
        extra:pick([-1,0,1,2]), ceiling:pick([-3,0,3,10000])}));
      const query = (p: Point, _sector: number, j: number) => {
        const h = hits[j]!;
        return {point:h.flags === -1 ? p : [p[0],Math.fround(p[1] + h.delta),p[2],h.extra] as Point,
          flags:h.flags, ceilingY:h.ceiling};
      };
      const expected = oracle.run(input, transformed, query);
      const actual = produceNativeRaceContacts(input, data, {transformProbe:transform(transformed), query});
      expect(scalarResult(actual), `case ${i}: ${JSON.stringify(input)}`).toEqual(expected.result);
      expect(expected.probeCalls.map(p => p.address)).toEqual(Array.from({length:7}, (_, j) => 0x2a1dd0 + j * 16));
      expect(expected.probeCalls.map(p => p.probe)).toEqual(data.probes);
      expect(expected.orientationCalls).toEqual(['cross','normalize',...(actual.orientation.adjustmentMode ? ['adjust'] : []),'basis','yaw','inverse']);
      // Check every producer query argument, including signed toroidal sector extraction.
      const observed: {point: number[]; sector: number}[] = [];
      produceNativeRaceContacts(input, data, {transformProbe:transform(transformed), query:(p,s,j) => {
        observed.push({point:[...p],sector:s}); return query(p,s,j);
      }});
      expect(observed).toEqual(expected.queryCalls);
      counts.miss += actual.missFlags !== 0 ? 1 : 0; counts.clamp += actual.supportFlags & 0x7f ? 1 : 0;
      counts.ceiling += actual.supportFlags & 0x100 ? 1 : 0; counts.impact += actual.impactRequests.length;
      counts.sound += actual.soundRequests.length; counts.special += actual.state.specialState === 1 ? 1 : 0;
      counts.equalized += actual.state.unsupportedTicks > 65 ? 1 : 0;
      counts.mode64 += actual.orientation.adjustmentMode === 64 ? 1 : 0; counts.mode128 += actual.orientation.adjustmentMode === 128 ? 1 : 0;
    }
    for (const [name, count] of Object.entries(counts)) expect(count, name).toBeGreaterThan(10);
  }, 60000);

  test('600 updates retain independently advanced PAL contact history', () => {
    const elf = new Uint8Array(readFileSync(executablePath!)), data = readNativeRaceContactData(elf), oracle = palRaceContactOracle(elf);
    let input = baseline(), palInput = baseline();
    for (let tick = 0; tick < 600; tick++) {
      const transformed: Point[] = Array.from({length:7}, (_, i) => [i - 3,0,(i % 3) - 1,0]);
      const query = (p: Point) => ({point:[p[0],tick < 100 ? -4 : tick < 250 ? 0 : tick < 400 ? 2 : -2,p[2],0] as Point,
        flags:tick < 50 ? -1 : 3, ceilingY:10000});
      const expected = oracle.run(palInput, transformed, query).result;
      const actual = produceNativeRaceContacts(input, data, {transformProbe:transform(transformed),query});
      expect(scalarResult(actual), `tick ${tick}`).toEqual(expected);
      input = {...input,state:actual.state};
      palInput = {...palInput,state:{...expected.state,position:expected.state.position as [number,number,number]}};
    }
  });

  test.skipIf(!process.env.RTA_PAL_BIN)('all 360 original grids run seven real course queries and the PAL support solver', async () => {
    const handle = openSync(process.env.RTA_PAL_BIN!, 'r');
    try {
      const disc = await Iso9660Disc.open(new RawMode2SectorSource({size:fstatSync(handle).size,label:'local PAL BIN',
        async read(offset,length) { const b = new Uint8Array(length); if (readSync(handle,b,0,length,offset) !== length) throw new Error('Short BIN read'); return b; },
      }));
      const elf = new Uint8Array(readFileSync(executablePath!));
      expect(createHash('sha256').update(await disc.readFile('SLES_513.56')).digest('hex'))
        .toBe(createHash('sha256').update(elf).digest('hex'));
      const data = readNativeRaceContactData(elf), oracle = palRaceContactOracle(elf), m = oracle.machine, v = m.view;
      const anchors = readRaceStartAnchors(elf), directory = 0x1000000, digest = createHash('sha256');
      let cases = 0, selectedProbes = 0;
      for (let course = 0; course < 15; course++) {
        const bytes = await disc.readFile(`COURSE/C${String(course).padStart(2,'0')}.BIN`);
        const header = readFieldHeader(bytes), chunks = readCollisionChunkDirectory(bytes,header).chunks;
        m.memory.set(bytes.subarray(header.collision.offset,header.collision.offset + header.collision.length),directory);
        v.setUint32(oracle.scene + 0x78,directory,true);
        for (const chunk of chunks) v.setUint32(directory + chunk.index * 4,directory + chunk.relativeOffset,true);
        const sampler = new NativeRaceCollisionSampler(bytes);
        for (let slot = 0; slot < 24; slot++) {
          const start = nativeRaceStartSeed(anchors[course]!,slot);
          const input: NativeRaceContactInput = {...baseline(),state:{...baseline().state,
            position:[Math.trunc(Math.fround(start.nativeX * data.positionDivisor)),Math.trunc(Math.fround(start.nativeY * data.positionDivisor)),
              Math.trunc(Math.fround(start.nativeZ * data.positionDivisor))],referenceY:start.nativeY}};
          // Prescribed identity VU output: this is a contact test at grid positions,
          // not verification of native grid yaw, transforms or moving trajectories.
          const transformed = data.probes;
          const expected = oracle.run(input,transformed).result;
          const actual = produceNativeRaceContacts(input,data,{transformProbe:transform(transformed),query:p => {
            const hit = sampler.query(p);
            selectedProbes += hit.flags >= 0 ? 1 : 0;
            return hit;
          }});
          expect(scalarResult(actual), `course ${course} slot ${slot}`).toEqual(expected);
          cases++;
          digest.update(JSON.stringify({course,slot,result:expected}) + '\n');
        }
      }
      expect(cases).toBe(360); expect(selectedProbes).toBeGreaterThan(2000);
      const outputSha256 = digest.digest('hex');
      expect(outputSha256).toBe('82b4b755ab4f205404aa8b82219f8d1f4abe18d94965933a6aa6df553a9ba119');
      if (process.env.RTA_RACE_CONTACT_REPORT) writeFileSync(process.env.RTA_RACE_CONTACT_REPORT,JSON.stringify({
        authority:'SLES_513.56',courses:15,gridCases:cases,courseQueries:cases * 7,selectedProbes,
        syntheticCases:8192,historyUpdates:600,outputSha256,
        boundary:'Prescribed VU probe outputs; orientation helpers observed through hooks. No moving trajectory validation.',
      },null,2) + '\n');
    } finally { closeSync(handle); }
  }, 60000);
});
