import { BlobReader, TextWriter, ZipReader, type Entry } from "@zip.js/zip.js";
import { parseCueSheet } from "../disc/cueSheet";
import { Iso9660Disc } from "../disc/iso9660";
import { BlobSource, RawMode2SectorSource, type RandomAccessSource } from "../disc/randomAccess";
import { createImportDirectory, fileSource, writeFile } from "../storage/opfs";

export type SourceKind = "iso" | "zip-iso" | "zip-bin-cue" | "bin-cue" | "bin";

export interface OpenedImportSource {
  readonly disc: Iso9660Disc;
  readonly kind: SourceKind;
  readonly label: string;
  cleanup(): Promise<void>;
}

type Progress = (phase: string, detail: string, completed: number, total: number) => void;

export async function openImportSource(files: File[], importId: string, progress: Progress): Promise<OpenedImportSource> {
  if (files.length === 0) throw new Error("Choose an ISO, ZIP, BIN, or BIN/CUE pair.");
  const byExtension = new Map<string, File[]>();
  for (const file of files) {
    const extension = file.name.split(".").at(-1)?.toLowerCase() ?? "";
    const list = byExtension.get(extension) ?? [];
    list.push(file);
    byExtension.set(extension, list);
  }

  const zip = byExtension.get("zip")?.[0];
  if (zip) {
    if (files.length !== 1) throw new Error("Drop one ZIP at a time.");
    return openZip(zip, importId, progress);
  }

  const iso = byExtension.get("iso")?.[0];
  if (iso) {
    if (files.length !== 1) throw new Error("Drop one ISO at a time.");
    const disc = await Iso9660Disc.open(new BlobSource(iso, `ISO: ${iso.name}`));
    return { disc, kind: "iso", label: iso.name, cleanup: async () => undefined };
  }

  const bins = byExtension.get("bin") ?? [];
  if (bins.length === 0) throw new Error("Supported inputs are ISO, ZIP, BIN, or a BIN/CUE pair.");
  const cue = byExtension.get("cue")?.[0];
  let bin: File;
  let firstSector = 0;
  let kind: SourceKind = "bin";
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

async function openZip(file: File, importId: string, progress: Progress): Promise<OpenedImportSource> {
  progress("archive", "Reading ZIP directory", 0, 1);
  const reader = new ZipReader(new BlobReader(file), {
    checkOverlappingEntry: true,
    checkSignature: true,
  });
  const entries = await reader.getEntries();
  const safeFiles = entries.filter((entry): entry is Entry & { directory: false } => !entry.directory && safeArchiveName(entry.filename));
  if (safeFiles.some((entry) => entry.encrypted)) {
    await reader.close();
    throw new Error("Password-protected ZIP files are not supported yet.");
  }

  const iso = safeFiles.find((entry) => extension(entry.filename) === "iso");
  const cue = safeFiles.find((entry) => extension(entry.filename) === "cue");
  let sourceEntry: Entry & { directory: false };
  let cueSheet: ReturnType<typeof parseCueSheet> | undefined;
  let kind: SourceKind;
  if (iso) {
    sourceEntry = iso;
    kind = "zip-iso";
  } else if (cue) {
    const cueText = await cue.getData(new TextWriter());
    cueSheet = parseCueSheet(cueText);
    const binEntries = safeFiles.filter((entry) => extension(entry.filename) === "bin");
    const resolvedName = resolveCueBinName(cueSheet.binFileName, binEntries.map((entry) => entry.filename));
    const referenced = resolvedName === undefined
      ? undefined
      : binEntries.find((entry) => entry.filename === resolvedName);
    if (!referenced) {
      await reader.close();
      throw new Error(`ZIP CUE references '${cueSheet.binFileName}', but it cannot be matched unambiguously to a BIN in the archive.`);
    }
    sourceEntry = referenced;
    kind = "zip-bin-cue";
  } else {
    const bin = safeFiles.find((entry) => extension(entry.filename) === "bin");
    if (!bin) {
      await reader.close();
      throw new Error("ZIP contains neither an ISO nor a BIN/CUE game image.");
    }
    sourceEntry = bin;
    kind = "zip-bin-cue";
  }

  await assertStorageHeadroom(sourceEntry.uncompressedSize);
  const importDirectory = await createImportDirectory(importId);
  const temporaryPath = `temporary/${kind === "zip-iso" ? "game.iso" : "game.bin"}`;
  progress("archive", `Extracting ${basename(sourceEntry.filename)} locally`, 0, sourceEntry.uncompressedSize);
  await writeFile(importDirectory, temporaryPath, async (destination) => {
    await sourceEntry.getData(destination, {
      checkCrc32: true,
      onprogress: (completed, total) => progress("archive", `Extracting ${basename(sourceEntry.filename)} locally`, completed, total),
    });
  });
  await reader.close();

  const stored = await fileSource(importDirectory, temporaryPath);
  const sectors: RandomAccessSource = kind === "zip-iso"
    ? stored
    : new RawMode2SectorSource(stored, cueSheet?.firstSector ?? 0);
  const disc = await Iso9660Disc.open(sectors);
  return {
    disc,
    kind,
    label: file.name,
    cleanup: async () => {
      try {
        await importDirectory.removeEntry("temporary", { recursive: true });
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "NotFoundError")) throw error;
      }
    },
  };
}

function safeArchiveName(path: string): boolean {
  const normalized = path.replaceAll("\\", "/");
  if (normalized.startsWith("/") || /^[A-Za-z]:\//.test(normalized)) return false;
  return !normalized.split("/").some((component) => component === "..");
}

function basename(path: string): string {
  return path.replaceAll("\\", "/").split("/").at(-1) ?? path;
}

function extension(path: string): string {
  return basename(path).split(".").at(-1)?.toLowerCase() ?? "";
}

export function resolveCueBinName(referencedName: string, candidates: readonly string[]): string | undefined {
  const exact = candidates.filter((candidate) => basename(candidate).toLowerCase() === referencedName.toLowerCase());
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) return undefined;
  return candidates.length === 1 ? candidates[0] : undefined;
}

async function assertStorageHeadroom(required: number): Promise<void> {
  const estimate = await navigator.storage.estimate();
  if (estimate.quota === undefined || estimate.usage === undefined) return;
  const available = estimate.quota - estimate.usage;
  if (available < required) {
    throw new Error(
      `The archive expands to ${formatBytes(required)}, but this browser reports only ${formatBytes(available)} of origin storage available.`,
    );
  }
}

function formatBytes(value: number): string {
  if (value >= 1024 ** 3) return `${(value / 1024 ** 3).toFixed(1)} GiB`;
  if (value >= 1024 ** 2) return `${(value / 1024 ** 2).toFixed(1)} MiB`;
  return `${Math.ceil(value / 1024)} KiB`;
}
