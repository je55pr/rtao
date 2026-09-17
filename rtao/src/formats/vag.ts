import { BinaryView } from "../core/binary";
import { psAdpcmFrameSize, readPsAdpcmFrame, type PsAdpcmFrame } from "./psAdpcm";

export const palVagHeaderSize = 0x30;
export const palVagVersion = 0x20;
export const palVagSampleRate = 12_000;

export interface PalVagFile {
  readonly version: number;
  readonly sampleRate: number;
  readonly payloadSize: number;
  readonly frameCount: number;
  readonly name: string;
  readonly payload: Uint8Array;
}

/** Reads the exact VAGp variant used by the six PAL streamed-audio files. */
export function readPalVag(bytes: Uint8Array): PalVagFile {
  const data = new BinaryView(bytes);
  if (data.length < palVagHeaderSize) throw new Error("VAG file is shorter than its 0x30-byte header.");
  if (data.ascii(0, 4) !== "VAGp") throw new Error("VAG file is missing the VAGp signature.");

  const version = data.u32be(0x04);
  const payloadSize = data.u32be(0x0c);
  const sampleRate = data.u32be(0x10);
  if (version !== palVagVersion) throw new Error(`Unsupported PAL VAG version 0x${version.toString(16)}.`);
  if (sampleRate !== palVagSampleRate) throw new Error(`Unsupported PAL VAG sample rate ${sampleRate}.`);
  if (payloadSize !== data.length - palVagHeaderSize) {
    throw new Error(`VAG payload declares ${payloadSize} bytes but file contains ${data.length - palVagHeaderSize}.`);
  }
  if (payloadSize % psAdpcmFrameSize !== 0) {
    throw new Error(`VAG payload length ${payloadSize} is not a multiple of ${psAdpcmFrameSize}.`);
  }

  const rawName = data.span(0x20, 0x10);
  const zero = rawName.indexOf(0);
  const name = new TextDecoder("ascii").decode(rawName.subarray(0, zero < 0 ? rawName.length : zero));
  return {
    version,
    sampleRate,
    payloadSize,
    frameCount: payloadSize / psAdpcmFrameSize,
    name,
    payload: data.span(palVagHeaderSize, payloadSize),
  };
}

export function readPalVagFrame(vag: PalVagFile, frameIndex: number): PsAdpcmFrame {
  if (!Number.isSafeInteger(frameIndex) || frameIndex < 0 || frameIndex >= vag.frameCount) {
    throw new RangeError(`VAG frame index ${frameIndex} is outside 0..${vag.frameCount - 1}.`);
  }
  return readPsAdpcmFrame(vag.payload, frameIndex * psAdpcmFrameSize);
}
