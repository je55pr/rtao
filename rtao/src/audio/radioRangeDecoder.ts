import { decodePsAdpcmFrame, psAdpcmFrameSize, psAdpcmSamplesPerFrame, readPsAdpcmFrame, type PsAdpcmState } from "../formats/psAdpcm";
import { palVagHeaderSize } from "../formats/vag";
import { radioVagCheckpointVersion, radioVagReplayRange, type RadioVagCheckpointIndex } from "./radioVagCheckpoints";

export type RadioRangeReader = (offset: number, length: number) => Promise<Uint8Array>;

export class RadioRangeDecoder {
  constructor(
    private readonly index: RadioVagCheckpointIndex,
    private readonly readRange: RadioRangeReader,
  ) {
    if (index.version !== radioVagCheckpointVersion) throw new Error(`Unsupported radio checkpoint version ${index.version}.`);
  }

  async readFloat32(sampleOffset: number, sampleCount: number): Promise<Float32Array> {
    if (!Number.isSafeInteger(sampleOffset) || sampleOffset < 0) throw new RangeError("Radio sample offset must be non-negative.");
    if (!Number.isSafeInteger(sampleCount) || sampleCount < 0) throw new RangeError("Radio sample count must be non-negative.");
    if (sampleCount === 0) return new Float32Array();
    const firstFrame = Math.floor(sampleOffset / psAdpcmSamplesPerFrame);
    const lastFrame = Math.floor((sampleOffset + sampleCount - 1) / psAdpcmSamplesPerFrame);
    if (lastFrame >= this.index.frameCount) throw new RangeError("Radio sample range exceeds the indexed VAG payload.");

    const replay = radioVagReplayRange(this.index, firstFrame);
    const frameCount = lastFrame - replay.checkpoint.frameIndex + 1;
    const bytes = await this.readRange(replay.fileOffset, frameCount * psAdpcmFrameSize);
    let state: PsAdpcmState = {
      previous1: replay.checkpoint.previous1,
      previous2: replay.checkpoint.previous2,
    };
    const output = new Float32Array(sampleCount);
    let target = 0;
    for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) {
      const decoded = decodePsAdpcmFrame(readPsAdpcmFrame(bytes, frameIndex * psAdpcmFrameSize), state);
      state = decoded.state;
      const absoluteFrame = replay.checkpoint.frameIndex + frameIndex;
      if (absoluteFrame < firstFrame) continue;
      const from = absoluteFrame === firstFrame ? sampleOffset % psAdpcmSamplesPerFrame : 0;
      const remaining = sampleCount - target;
      const take = Math.min(psAdpcmSamplesPerFrame - from, remaining);
      for (let index = 0; index < take; index += 1) {
        output[target + index] = decoded.samples[from + index]! / 0x8000;
      }
      target += take;
      if (target === sampleCount) break;
    }
    return output;
  }
}

export function radioCheckpointPath(vagPath: string): string {
  const name = vagPath.replace(/^game\/SOUND\//i, "").replace(/\.VAG$/i, ".checkpoints.json");
  return `compiled/${name}`;
}

export function radioPayloadFileOffset(frameIndex: number): number {
  return palVagHeaderSize + frameIndex * psAdpcmFrameSize;
}
