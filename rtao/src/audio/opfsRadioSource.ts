import type { PcmClip } from "./pcm";
import { nativeRadioSampleRate } from "./nativeRadioRuntime";
import { RadioRangeDecoder, radioCheckpointPath } from "./radioRangeDecoder";
import type { RadioVagCheckpointIndex } from "./radioVagCheckpoints";
import { fileSource, readJson } from "../storage/opfs";

export interface RadioStereoRangeSource {
  readClip(sampleOffset: number, sampleCount: number): Promise<PcmClip>;
}

export async function openOpfsRadioStereoSource(
  root: FileSystemDirectoryHandle,
  leftPath: string,
  rightPath: string,
): Promise<RadioStereoRangeSource> {
  const [leftIndex, rightIndex, leftFile, rightFile] = await Promise.all([
    readJson<RadioVagCheckpointIndex>(root, radioCheckpointPath(leftPath)),
    readJson<RadioVagCheckpointIndex>(root, radioCheckpointPath(rightPath)),
    fileSource(root, leftPath),
    fileSource(root, rightPath),
  ]);
  if (leftIndex.frameCount !== rightIndex.frameCount || leftIndex.payloadSize !== rightIndex.payloadSize) {
    throw new Error("PAL radio stereo checkpoint indexes disagree on stream length.");
  }
  const left = new RadioRangeDecoder(leftIndex, (offset, length) => leftFile.read(offset, length));
  const right = new RadioRangeDecoder(rightIndex, (offset, length) => rightFile.read(offset, length));
  return {
    async readClip(sampleOffset, sampleCount) {
      const [leftPcm, rightPcm] = await Promise.all([
        left.readFloat32(sampleOffset, sampleCount),
        right.readFloat32(sampleOffset, sampleCount),
      ]);
      return {
        sampleRate: nativeRadioSampleRate,
        channels: [leftPcm, rightPcm],
        frameCount: sampleCount,
      };
    },
  };
}
