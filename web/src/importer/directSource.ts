import { parseCueSheet } from "../disc/cueSheet";
import { Iso9660Disc } from "../disc/iso9660";
import { BlobSource, RawMode2SectorSource } from "../disc/randomAccess";

export type DirectSourceKind = "iso" | "bin-cue" | "bin";

export interface OpenedDirectImportSource {
  readonly disc: Iso9660Disc;
  readonly kind: DirectSourceKind;
  readonly label: string;
  cleanup(): Promise<void>;
}

export async function openDirectImportSource(files: readonly File[]): Promise<OpenedDirectImportSource> {
  if (files.length === 0) throw new Error("Choose an ISO, BIN, or BIN/CUE pair.");
  const byExtension = new Map<string, File[]>();
  for (const file of files) {
    const extension = file.name.split(".").at(-1)?.toLowerCase() ?? "";
    const list = byExtension.get(extension) ?? [];
    list.push(file);
    byExtension.set(extension, list);
  }

  const zip = byExtension.get("zip")?.[0];
  if (zip) {
    throw new Error("Sandbox capture supports direct ISO, BIN, or BIN/CUE inputs only; ZIP import stays in the full browser app.");
  }

  const iso = byExtension.get("iso")?.[0];
  if (iso) {
    if (files.length !== 1) throw new Error("Choose one ISO at a time.");
    const disc = await Iso9660Disc.open(new BlobSource(iso, `ISO: ${iso.name}`));
    return { disc, kind: "iso", label: iso.name, cleanup: async () => undefined };
  }

  const bins = byExtension.get("bin") ?? [];
  if (bins.length === 0) throw new Error("Supported sandbox-capture inputs are ISO, BIN, or a BIN/CUE pair.");
  const cue = byExtension.get("cue")?.[0];
  let bin: File;
  let firstSector = 0;
  let kind: DirectSourceKind = "bin";
  if (cue) {
    const sheet = parseCueSheet(await cue.text());
    const resolvedName = resolveCueBinName(sheet.binFileName, bins.map((candidate) => candidate.name));
    const resolvedIndex = resolvedName === undefined ? -1 : bins.findIndex((candidate) => candidate.name === resolvedName);
    const resolved = bins[resolvedIndex];
    if (!resolved) {
      throw new Error(`CUE references '${sheet.binFileName}', but it cannot be matched unambiguously to the selected BIN files.`);
    }
    bin = resolved;
    firstSector = sheet.firstSector;
    kind = "bin-cue";
  } else if (bins.length === 1 && bins[0]) {
    bin = bins[0];
  } else {
    throw new Error("Choose a CUE as well when selecting more than one BIN file.");
  }
  const sectors = new RawMode2SectorSource(new BlobSource(bin, bin.name), firstSector);
  return {
    disc: await Iso9660Disc.open(sectors),
    kind,
    label: cue ? `${cue.name} + ${bin.name}` : bin.name,
    cleanup: async () => undefined,
  };
}

function basename(path: string): string {
  return path.replaceAll("\\", "/").split("/").at(-1) ?? path;
}

function resolveCueBinName(referencedName: string, candidates: readonly string[]): string | undefined {
  const exact = candidates.filter((candidate) => basename(candidate).toLowerCase() === referencedName.toLowerCase());
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) return undefined;
  return candidates.length === 1 ? candidates[0] : undefined;
}
