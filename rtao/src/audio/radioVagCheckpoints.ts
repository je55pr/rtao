import { decodePsAdpcmFrame, psAdpcmFrameSize, readPsAdpcmFrame, type PsAdpcmState } from "../formats/psAdpcm";
import { palVagHeaderSize, readPalVag } from "../formats/vag";

export const radioVagCheckpointVersion = 1;
export const radioVagCheckpointStrideFrames = 2048;

export interface RadioVagCheckpoint {
  readonly frameIndex: number;
  readonly previous1: number;
  readonly previous2: number;
}

export interface RadioVagCheckpointIndex {
  readonly version: number;
  readonly payloadSize: number;
  readonly frameCount: number;
  readonly strideFrames: number;
  readonly checkpoints: readonly RadioVagCheckpoint[];
}

export function buildRadioVagCheckpointIndex(
  bytes: Uint8Array,
  strideFrames = radioVagCheckpointStrideFrames,
): RadioVagCheckpointIndex {
  if (!Number.isSafeInteger(strideFrames) || strideFrames <= 0) {
    throw new RangeError("Radio VAG checkpoint stride must be a positive integer.");
  }
  const vag = readPalVag(bytes);
  const checkpoints: RadioVagCheckpoint[] = [];
  let state: PsAdpcmState = { previous1: 0, previous2: 0 };
  for (let frameIndex = 0; frameIndex < vag.frameCount; frameIndex += 1) {
    if (frameIndex % strideFrames === 0) {
      checkpoints.push({ frameIndex, previous1: state.previous1, previous2: state.previous2 });
    }
    state = decodePsAdpcmFrame(
      readPsAdpcmFrame(vag.payload, frameIndex * psAdpcmFrameSize),
      state,
    ).state;
  }
  return {
    version: radioVagCheckpointVersion,
    payloadSize: vag.payloadSize,
    frameCount: vag.frameCount,
    strideFrames,
    checkpoints,
  };
}

export function radioVagReplayRange(
  index: RadioVagCheckpointIndex,
  targetFrame: number,
): { checkpoint: RadioVagCheckpoint; fileOffset: number; frameCount: number } {
  if (!Number.isSafeInteger(targetFrame) || targetFrame < 0 || targetFrame >= index.frameCount) {
    throw new RangeError(`Radio VAG target frame ${targetFrame} is outside 0..${index.frameCount - 1}.`);
  }
  const checkpointIndex = Math.floor(targetFrame / index.strideFrames);
  const checkpoint = index.checkpoints[checkpointIndex];
  if (!checkpoint) throw new Error(`Radio VAG checkpoint ${checkpointIndex} is missing.`);
  return {
    checkpoint,
    fileOffset: palVagHeaderSize + checkpoint.frameIndex * psAdpcmFrameSize,
    frameCount: targetFrame - checkpoint.frameIndex + 1,
  };
}
