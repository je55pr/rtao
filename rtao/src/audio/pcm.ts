import { decodePsAdpcm } from "../formats/psAdpcm";
import { readTvb } from "../formats/tvb";
import { readPalVag } from "../formats/vag";

export interface PcmClip {
  readonly sampleRate: number;
  readonly channels: readonly Float32Array[];
  readonly frameCount: number;
}

export interface PcmLoop {
  readonly startFrame: number;
  readonly endFrame: number;
}

function assertSampleRate(sampleRate: number): void {
  if (!Number.isFinite(sampleRate) || sampleRate <= 0) {
    throw new RangeError(`PCM sample rate must be finite and positive; got ${sampleRate}.`);
  }
}

function pcm16ToFloat32(samples: Int16Array): Float32Array {
  const output = new Float32Array(samples.length);
  for (let index = 0; index < samples.length; index += 1) {
    output[index] = samples[index]! / 0x8000;
  }
  return output;
}
export function pcmClipFromPsAdpcm(adpcm: Uint8Array, sampleRate: number): PcmClip {
  assertSampleRate(sampleRate);
  const channel = pcm16ToFloat32(decodePsAdpcm(adpcm));
  return {
    sampleRate,
    channels: [channel],
    frameCount: channel.length,
  };
}

/** Decodes only the bounded PAL VAG/PS-ADPCM contract; unsupported frames are not repaired or guessed. */
export function decodePalVagClip(bytes: Uint8Array): PcmClip {
  const vag = readPalVag(bytes);
  return pcmClipFromPsAdpcm(vag.payload, vag.sampleRate);
}

export function decodePalVagStereo(leftBytes: Uint8Array, rightBytes: Uint8Array): PcmClip {
  const left = decodePalVagClip(leftBytes);
  const right = decodePalVagClip(rightBytes);
  if (left.sampleRate !== right.sampleRate) {
    throw new Error(`VAG channel sample rates differ: ${left.sampleRate} != ${right.sampleRate}.`);
  }
  if (left.frameCount !== right.frameCount) {
    throw new Error(`VAG channel frame counts differ: ${left.frameCount} != ${right.frameCount}.`);
  }
  return {
    sampleRate: left.sampleRate,
    channels: [left.channels[0]!, right.channels[0]!],
    frameCount: left.frameCount,
  };
}

/** TVB stores no sample rate, so the recovered caller/runtime must supply it explicitly. */
export function decodeTvbSlotClip(bytes: Uint8Array, slot: number, sampleRate: number): PcmClip {
  if (!Number.isSafeInteger(slot) || slot < 0 || slot > 0xff) {
    throw new RangeError(`TVB slot must be an integer in 0..255; got ${slot}.`);
  }
  const bank = readTvb(bytes);
  const sample = bank.sampleBySlot[slot];
  if (!sample) throw new Error(`TVB slot ${slot} is a payload-end sentinel, not a playable sample.`);
  return pcmClipFromPsAdpcm(sample.adpcm, sampleRate);
}

export function assertPcmClip(clip: PcmClip): void {
  assertSampleRate(clip.sampleRate);
  if (!Number.isSafeInteger(clip.frameCount) || clip.frameCount <= 0) {
    throw new RangeError(`PCM frame count must be a positive integer; got ${clip.frameCount}.`);
  }
  if (clip.channels.length === 0) throw new Error("PCM clip must contain at least one channel.");
  for (const [index, channel] of clip.channels.entries()) {
    if (channel.length !== clip.frameCount) {
      throw new Error(`PCM channel ${index} has ${channel.length} frames; expected ${clip.frameCount}.`);
    }
  }
}

export function assertPcmLoop(loop: PcmLoop, clip: PcmClip): void {
  if (!Number.isSafeInteger(loop.startFrame) || !Number.isSafeInteger(loop.endFrame)) {
    throw new RangeError("PCM loop frames must be integers.");
  }
  if (loop.startFrame < 0 || loop.endFrame > clip.frameCount || loop.startFrame >= loop.endFrame) {
    throw new RangeError(
      `PCM loop [${loop.startFrame}, ${loop.endFrame}) is outside clip frame range 0..${clip.frameCount}.`,
    );
  }
}
