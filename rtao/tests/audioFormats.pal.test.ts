import { createHash } from "node:crypto";
import { closeSync, fstatSync, openSync, readSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { nativeEngineLayers, nativeEnginePitchWord } from "../src/audio/nativeEngineAudio";
import {
  NativeTsqSequencer,
  nativeTsqStepUpdates,
  resolveTsqJumpTarget,
  resolveTsqMusicChannelPrograms,
} from "../src/audio/nativeTsqSequencer";
import { NativeSfxRuntime, nativeSfxRoutes } from "../src/audio/nativeSfx";
import { Iso9660Disc } from "../src/disc/iso9660";
import { RawMode2SectorSource } from "../src/disc/randomAccess";
import { decodePackedTsqRequest, readTsq, readTsqBytecodeToken, resolvePackedTsqRequest, tokenizeTsqBytecode } from "../src/formats/tsq";
import { readTvb } from "../src/formats/tvb";
import { readPalVag, readPalVagFrame } from "../src/formats/vag";

const binPath = process.env.RTA_PAL_BIN;

async function openDisc(): Promise<{ disc: Iso9660Disc; close: () => void }> {
  const handle = openSync(binPath!, "r");
  const disc = await Iso9660Disc.open(new RawMode2SectorSource({
    size: fstatSync(handle).size,
    label: "local PAL BIN",
    async read(offset, length) {
      const bytes = new Uint8Array(length);
      if (readSync(handle, bytes, 0, length, offset) !== length) throw new Error("Short PAL BIN read.");
      return bytes;
    },
  }));
  return { disc, close: () => closeSync(handle) };
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}
describe.skipIf(!binPath)("PAL audio format authority", () => {
  test("all six streamed VAG files satisfy the recovered header/frame invariants", async () => {
    const expected = [
      ["1CH_L.VAG", 24_706_320, 1_544_145], ["1CH_R.VAG", 24_706_320, 1_544_145],
      ["2CH_L.VAG", 24_724_224, 1_545_264], ["2CH_R.VAG", 24_724_224, 1_545_264],
      ["3CH_L.VAG", 24_891_472, 1_555_717], ["3CH_R.VAG", 24_891_472, 1_555_717],
    ] as const;
    const { disc, close } = await openDisc();
    try {
      for (const [name, payloadSize, frameCount] of expected) {
        const vag = readPalVag(await disc.readFile(`SOUND/${name}`));
        expect(vag).toMatchObject({ version: 0x20, sampleRate: 12_000, payloadSize, frameCount });
      }
    } finally {
      close();
    }
  });

  test("preserves the genuine 1CH_R interior anomaly instead of normalizing control/header bytes", async () => {
    const { disc, close } = await openDisc();
    try {
      const vag = readPalVag(await disc.readFile("SOUND/1CH_R.VAG"));
      expect(readPalVagFrame(vag, 25_574)).toMatchObject({ predictor: 1, shift: 4, control: 0x00 });
      expect(readPalVagFrame(vag, 25_575)).toMatchObject({ predictor: 0, shift: 14, control: 0xe3 });
      expect(readPalVagFrame(vag, 25_576)).toMatchObject({ predictor: 15, shift: 15, control: 0xb5 });
      expect(readPalVagFrame(vag, 25_664)).toMatchObject({ predictor: 4, shift: 4, control: 0x00 });
    } finally {
      close();
    }
  });
  test("recovers the three PAL TVB sample maps and payload-safe structural hashes", async () => {
    const expected = [
      ["CQ_MAIN.TVB", 59, 60, 297_344, "1d226f7b1d5b1f794db09f446db37c3423bb5e01e97f3a9fa315065c2456c07d"],
      ["ACTION.TVB", 26, 27, 237_776, "239c17f1118d7aa89d3580f75106b04f7231d704f3024ffbebe0af62b27a6582"],
      ["BGM.TVB", 31, 32, 297_984, "900fa480c28872a2b4f0a27a251aac928d8ba0fde104cb2c268bbb2da17343d2"],
    ] as const;
    const { disc, close } = await openDisc();
    try {
      for (const [name, spanCount, firstSentinel, payloadSize, hash] of expected) {
        const bytes = await disc.readFile(`SOUND/${name}`);
        const bank = readTvb(bytes);
        expect(sha256(bytes)).toBe(hash);
        expect(bank.adpcm).toHaveLength(payloadSize);
        expect(bank.sampleSpans).toHaveLength(spanCount);
        expect(bank.sentinelSlots[0]).toBe(firstSentinel);
        expect(bank.sentinelSlots.at(-1)).toBe(255);
      }
      const cq = readTvb(await disc.readFile("SOUND/CQ_MAIN.TVB"));
      expect(cq.waveOffsets[0x12]).toBe(0x115c0);
      expect(cq.adsrWords[0x12]).toBe(0xd2f2e11e);
      expect(cq.nativeAdsrWords[0x12]).toBe(0x0d0d1eee);
    } finally {
      close();
    }
  });

  test("pins the PAL engine loop pair and exact RPM pitch vectors", async () => {
    const { disc, close } = await openDisc();
    try {
      const cq = readTvb(await disc.readFile("SOUND/CQ_MAIN.TVB"));
      for (const layer of nativeEngineLayers) {
        const sample = cq.sampleBySlot[layer.slot]!;
        expect(sample).toMatchObject({
          startOffset: layer.startOffset,
          endOffset: layer.endOffset,
          frameCount: layer.adpcmFrames,
        });
        expect(cq.adsrWords[layer.slot]).toBe(0xd2f2e11e);
        expect(sample.adpcm[layer.loopStartAdpcmFrame * 16 + 1]).toBe(6);
        expect(sample.adpcm[(layer.adpcmFrames - 1) * 16 + 1]).toBe(3);
      }
      expect([4000, 4001, 6000, 10_000].map(nativeEnginePitchWord)).toEqual([9500, 10001, 13000, 16383]);
    } finally {
      close();
    }
  });

  test("all PAL TSQs use one of the two recovered directory shapes and exact boundary marker", async () => {
    const large = ["CQ_MAIN.TSQ", "ACTION.TSQ"] as const;
    const small = [
      "ROOM_1.TSQ", "BGM_01.TSQ", "BGM_02.TSQ", "BGM_03.TSQ", "BGM_04.TSQ", "BGM_05.TSQ", "BGM_06.TSQ",
      "BGM_07.TSQ", "BGM_08.TSQ", "BGM_09.TSQ", "BGM_10.TSQ", "BGM_11.TSQ", "BGM_12.TSQ",
      "REPLAY.TSQ", "SELECT.TSQ", "ENDING.TSQ", "DEMO.TSQ", "FANFARE.TSQ",
    ] as const;
    const { disc, close } = await openDisc();
    try {
      for (const name of large) expect(readTsq(await disc.readFile(`SOUND/${name}`))).toMatchObject({ directoryEntryCount: 100, directoryEnd: 0x190 });
      for (const name of small) expect(readTsq(await disc.readFile(`SOUND/${name}`))).toMatchObject({ directoryEntryCount: 51, directoryEnd: 0xcc });
    } finally {
      close();
    }
  });

  test("pins PAL SNDMOD countdown/F8 arithmetic and the BGM_01 36-channel loop trace", async () => {
    const { disc, close } = await openDisc();
    try {
      const sndmod = await disc.readFile("SNDMOD.IRX");
      const code = new DataView(sndmod.buffer, sndmod.byteOffset, sndmod.byteLength);
      const textFileOffset = 0xa0;
      expect(code.getUint32(textFileOffset + 0x4810, true)).toBe(0x2464ffff);
      expect(code.getUint32(textFileOffset + 0x48a0, true)).toBe(0x00642021);
      expect(code.getUint32(textFileOffset + 0x52c4, true)).toBe(0x2483ffff);

      const tsq = readTsq(await disc.readFile("SOUND/BGM_01.TSQ"));
      const programs = resolveTsqMusicChannelPrograms(tsq, 1);
      expect(programs).toHaveLength(36);
      expect(programs.every((program) => program.descriptor?.stateByte === 0x80)).toBe(true);
      expect(programs.slice(0, 3).map((program) => program.startOffset)).toEqual([0x190, 0x354, 0x517]);

      let pc = programs[0]!.startOffset;
      let stepUpdates = 0;
      let firstJump: ReturnType<typeof readTsqBytecodeToken> | undefined;
      for (let count = 0; count < 20_000; count += 1) {
        const token = readTsqBytecodeToken(tsq.bytes, pc);
        if (token.family === "step") stepUpdates += nativeTsqStepUpdates(token);
        if (token.family === "jump") {
          firstJump = token;
          break;
        }
        pc += token.length;
      }
      expect(firstJump).toBeDefined();
      expect({
        offset: firstJump!.offset,
        target: resolveTsqJumpTarget(firstJump!),
        stepUpdates,
      }).toEqual({ offset: 0x34f, target: 0x193, stepUpdates: 7367 });

      const sequencer = new NativeTsqSequencer(tsq.bytes, programs);
      sequencer.advanceTo(10_000);
      expect(sequencer.snapshot().channels.every((channel) =>
        channel.jumpCount === 1 && !channel.ended)).toBe(true);
    } finally {
      close();
    }
  });

  test("resolves recovered request IDs and the request-40 CQ_MAIN structural chain", async () => {
    const { disc, close } = await openDisc();
    try {
      const cqMain = readTsq(await disc.readFile("SOUND/CQ_MAIN.TSQ"));
      const action = readTsq(await disc.readFile("SOUND/ACTION.TSQ"));
      const banks = new Map([[0, cqMain], [3, action]]);
      expect(decodePackedTsqRequest(40)).toMatchObject({ bank: 0, index: 40, cancel: false });
      expect(decodePackedTsqRequest(0x0302)).toMatchObject({ bank: 3, index: 2, cancel: false });
      const request40 = resolvePackedTsqRequest(40, banks);
      expect(request40.tsq).toBe(cqMain);
      expect(request40.entry).toMatchObject({ index: 40, sequenceOffset: 0x30b });
      expect(resolvePackedTsqRequest(0x0302, banks).tsq).toBe(action);
      const tokens = tokenizeTsqBytecode(cqMain.bytes, request40.entry.sequenceOffset);
      expect(tokens.map((token) => token.family)).toEqual(["flag-off", "key-off", "volume", "tone", "key-on", "step", "key-off", "end"]);
      expect(tokens[3]?.immediateBytes).toEqual([0x12]);
    } finally {
      close();
    }
  });

  test("pins the recovered common SFX requests to their PAL TSQ priority, tone, and TVB span", async () => {
    const { disc, close } = await openDisc();
    try {
      const banks = new Map([
        [0, { tsq: readTsq(await disc.readFile("SOUND/CQ_MAIN.TSQ")), tvb: readTvb(await disc.readFile("SOUND/CQ_MAIN.TVB")) }],
        [3, { tsq: readTsq(await disc.readFile("SOUND/ACTION.TSQ")), tvb: readTvb(await disc.readFile("SOUND/ACTION.TVB")) }],
      ]);
      for (const route of Object.values(nativeSfxRoutes)) {
        const bank = banks.get(route.bank)!;
        const entry = bank.tsq.entries[route.index]!;
        expect(entry.priority).toBe(route.priority);
        const tones = tokenizeTsqBytecode(bank.tsq.bytes, entry.sequenceOffset)
          .filter((token) => token.family === "tone")
          .flatMap((token) => token.immediateBytes);
        expect(tones).toContain(route.tone);
        expect(bank.tvb.sampleBySlot[route.tone]).toMatchObject({
          startOffset: route.sampleStart,
          endOffset: route.sampleEnd,
        });
      }
    } finally {
      close();
    }
  });

  test("constructs and dispatches the common SFX runtime from retail banks", async () => {
    const { disc, close } = await openDisc();
    try {
      const runtime = NativeSfxRuntime.fromAssets(
        { playEvent: () => null },
        {
          cqMainTsq: await disc.readFile("SOUND/CQ_MAIN.TSQ"),
          cqMainTvb: await disc.readFile("SOUND/CQ_MAIN.TVB"),
          actionTsq: await disc.readFile("SOUND/ACTION.TSQ"),
          actionTvb: await disc.readFile("SOUND/ACTION.TVB"),
        },
      );
      for (const event of Object.keys(nativeSfxRoutes) as (keyof typeof nativeSfxRoutes)[]) {
        expect(runtime.dispatch(event)).toMatchObject({
          status: "locked",
          request: nativeSfxRoutes[event].request,
          event,
        });
      }
    } finally {
      close();
    }
  });
});
