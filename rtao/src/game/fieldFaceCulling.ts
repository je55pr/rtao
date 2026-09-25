import type { CompiledFieldBatch } from "../formats/fieldGeometry";

export type PalFieldSubmissionFamily =
  | "ordinary-mscalf8"
  | "billboard-mscalf6"
  | "dynamic-mscalf4";

export type PalFieldFaceCullMode = "none" | "unresolved";

export function palFieldSubmissionFamily(
  batch: Pick<CompiledFieldBatch, "billboard">,
): PalFieldSubmissionFamily {
  return batch.billboard ? "billboard-mscalf6" : "ordinary-mscalf8";
}

export function palFieldFaceCullMode(family: PalFieldSubmissionFamily): PalFieldFaceCullMode {
  switch (family) {
    // Recovered VU1 program 8 clips/trivially rejects through CLIP/FCOR/FCAND
    // and the GS ADC bit, but contains no face-orientation reject.
    case "ordinary-mscalf8":
      return "none";
    // Camera-facing cards must remain fail-closed until MSCALF-6 culling is
    // separately recovered. Rendering both sides preserves current PAL evidence.
    case "billboard-mscalf6":
    case "dynamic-mscalf4":
      return "unresolved";
  }
}
