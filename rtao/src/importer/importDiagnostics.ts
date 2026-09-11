/**
 * Turns a file selection and an import failure into something a player can act
 * on, before and after the long local import. Nothing here reads game data; it
 * only reasons about file names, sizes and the messages the importer throws.
 */

export interface SelectedFile {
  readonly name: string;
  readonly size: number;
}

export interface ImportProblem {
  readonly title: string;
  readonly detail: string;
  readonly hint: string;
}

export type ImportSelection =
  | { readonly kind: "zip" | "iso" | "bin-cue" | "bin" }
  | { readonly kind: "rejected"; readonly problem: ImportProblem };

/** A disc image is one large file; extracted game data is many small ones. */
const smallestPlausibleImageBytes = 64 * 1024 * 1024;

const archiveHints: Readonly<Record<string, string>> = {
  "7z": "7-Zip archives",
  rar: "RAR archives",
  gz: "GZIP archives",
  tar: "TAR archives",
  chd: "CHD compressed images",
  ecm: "ECM-compressed images",
};

function extensionOf(name: string): string {
  return name.split(/[\\/]/).at(-1)?.split(".").at(-1)?.toLowerCase() ?? "";
}

function looksLikeExtractedDisc(files: readonly SelectedFile[]): boolean {
  return files.some((file) => {
    const base = file.name.split(/[\\/]/).at(-1)?.toUpperCase() ?? "";
    return base === "SYSTEM.CNF" || /^S[LC][EUPK][SAM]_\d{3}\.\d{2}$/.test(base);
  });
}

export function classifyImportSelection(files: readonly SelectedFile[]): ImportSelection {
  if (files.length === 0) {
    return {
      kind: "rejected",
      problem: {
        title: "No file was selected.",
        detail: "Nothing arrived from the file picker or the drop.",
        hint: "Choose your own PAL disc image: a single ISO or ZIP, or a BIN and its CUE together.",
      },
    };
  }

  if (looksLikeExtractedDisc(files)) {
    return {
      kind: "rejected",
      problem: {
        title: "Those look like files extracted from a disc.",
        detail: "The selection contains disc contents such as SYSTEM.CNF or the boot executable rather than a disc image.",
        hint: "Select the original disc image instead — the ISO, or the BIN together with its CUE. RTAO reads the disc layout itself.",
      },
    };
  }

  const byExtension = new Map<string, SelectedFile[]>();
  for (const file of files) {
    const extension = extensionOf(file.name);
    byExtension.set(extension, [...byExtension.get(extension) ?? [], file]);
  }

  const zips = byExtension.get("zip") ?? [];
  const isos = byExtension.get("iso") ?? [];
  const bins = byExtension.get("bin") ?? [];
  const cues = byExtension.get("cue") ?? [];

  if (zips.length > 0) {
    if (files.length > zips.length || zips.length > 1) {
      return {
        kind: "rejected",
        problem: {
          title: "Choose one ZIP on its own.",
          detail: `The selection mixes ${describeCounts(byExtension)}.`,
          hint: "A ZIP is imported by itself; it should already contain the ISO, or the BIN and CUE.",
        },
      };
    }
    return { kind: "zip" };
  }

  if (isos.length > 0) {
    if (files.length > 1) {
      return {
        kind: "rejected",
        problem: {
          title: "Choose one ISO on its own.",
          detail: `The selection mixes ${describeCounts(byExtension)}.`,
          hint: "An ISO already contains the whole disc, so nothing else is needed alongside it.",
        },
      };
    }
    return { kind: "iso" };
  }

  if (bins.length === 0) {
    if (cues.length > 0) {
      return {
        kind: "rejected",
        problem: {
          title: "That CUE has no BIN with it.",
          detail: "A CUE only describes the track layout; the disc data lives in the BIN beside it.",
          hint: "Select the CUE and the BIN together — in most file pickers, hold Ctrl or Shift to pick both.",
        },
      };
    }
    const unsupported = [...byExtension.keys()].find((extension) => archiveHints[extension]);
    return {
      kind: "rejected",
      problem: {
        title: unsupported ? `${archiveHints[unsupported]} are not supported.` : "That file type is not supported.",
        detail: `Supported inputs are ISO, ZIP, BIN, or a BIN and CUE together. The selection was ${describeCounts(byExtension)}.`,
        hint: unsupported
          ? "Extract or convert it to an ISO or BIN/CUE first, then import that."
          : "Choose the disc image itself rather than an installer, save file or archive of another kind.",
      },
    };
  }

  if (bins.every((file) => file.size < smallestPlausibleImageBytes)) {
    return {
      kind: "rejected",
      problem: {
        title: "Those BIN files are too small to be a disc image.",
        detail: "Every selected BIN is well under the size of a PlayStation 2 disc, so they look like individual game files rather than the disc itself.",
        hint: "Select the original disc image — the ISO, or the single large BIN together with its CUE.",
      },
    };
  }

  if (cues.length > 1) {
    return {
      kind: "rejected",
      problem: {
        title: "Choose one CUE at a time.",
        detail: `The selection contains ${cues.length} CUE files.`,
        hint: "Import one disc at a time: a single CUE with the BIN it references.",
      },
    };
  }

  if (cues.length === 0 && bins.length > 1) {
    return {
      kind: "rejected",
      problem: {
        title: "Several BIN files were selected without a CUE.",
        detail: "Without a CUE there is no way to tell which BIN holds the disc, or where its first track starts.",
        hint: "Add the CUE that came with the BIN files, or select just the one BIN that holds the disc.",
      },
    };
  }

  return { kind: cues.length === 1 ? "bin-cue" : "bin" };
}

function describeCounts(byExtension: ReadonlyMap<string, readonly SelectedFile[]>): string {
  const parts = [...byExtension.entries()]
    .map(([extension, files]) => `${files.length} ${extension ? `.${extension}` : "unnamed"} file${files.length === 1 ? "" : "s"}`);
  if (parts.length === 1) return parts[0]!;
  return `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`;
}

const regionsBySerialPrefix: Readonly<Record<string, string>> = {
  SLES: "European (PAL)",
  SCES: "European (PAL)",
  SLUS: "North American",
  SCUS: "North American",
  SLPS: "Japanese",
  SLPM: "Japanese",
  SCPS: "Japanese",
  SLKA: "Korean",
  SCKA: "Korean",
};

export function discRegion(bootExecutable: string): string | undefined {
  return regionsBySerialPrefix[bootExecutable.slice(0, 4).toUpperCase()];
}

/**
 * Rewrites importer errors as something the player can act on. Unrecognised
 * failures keep `fallbackTitle`, so a caller that already knows which stage
 * failed does not lose that context.
 */
export function describeImportFailure(message: string, fallbackTitle = "That game image could not be imported."): ImportProblem {
  const wrongRelease = /Expected PAL (\S+); found '([^']*)'/.exec(message);
  if (wrongRelease) {
    const found = wrongRelease[2] ?? "";
    const region = discRegion(found);
    return {
      title: region ? `That looks like the ${region} release.` : "That is a different game or release.",
      detail: `RTAO is reconstructed against the European PAL release, which boots ${wrongRelease[1]}. This disc boots ${found || "an unrecognised executable"}.`,
      hint: "Import your own PAL copy of Road Trip Adventure. Other regions differ enough that their data is not interchangeable.",
    };
  }

  if (message.includes("BOOT2")) {
    return {
      title: "That disc image is not a PlayStation 2 game.",
      detail: "Its SYSTEM.CNF has no BOOT2 entry, which every PlayStation 2 disc uses to name its boot executable.",
      hint: "Check that the image is a PlayStation 2 disc rather than a PlayStation 1, PC or video disc.",
    };
  }

  if (message.includes("Password-protected")) {
    return {
      title: "That ZIP is password-protected.",
      detail: "RTAO cannot open encrypted archive entries.",
      hint: "Extract the archive yourself, then import the ISO or BIN/CUE inside it.",
    };
  }

  if (message.includes("neither an ISO nor a BIN/CUE")) {
    return {
      title: "That ZIP has no disc image inside.",
      detail: "The archive was opened successfully, but it contains no ISO and no BIN.",
      hint: "Check the archive holds the disc image itself rather than extracted game files or another archive.",
    };
  }

  if (message.includes("CUE references")) {
    return {
      title: "The CUE does not match the selected BIN.",
      detail: message,
      hint: "Select the BIN the CUE names, or rename the BIN to match it.",
    };
  }

  if (message.includes("TRACK 01 MODE2/2352")) {
    return {
      title: "That CUE describes a layout RTAO cannot read.",
      detail: message,
      hint: "RTAO reads a single-track MODE2/2352 disc. A multi-track or audio-track CUE needs re-dumping as a plain data track.",
    };
  }

  if (message.includes("CUE INDEX")) {
    return {
      title: "The CUE and BIN do not line up.",
      detail: message,
      hint: "The pair may be mismatched or the BIN may be truncated. Re-dump the disc, or select the BIN this CUE was written for.",
    };
  }

  if (/Required game file|was not found|standard FLD sectors/.test(message)) {
    return {
      title: "That disc image is missing game files.",
      detail: message,
      hint: "The image looks like a partial or trimmed dump. Import a complete dump of your own PAL disc.",
    };
  }

  if (message.includes("origin storage available")) {
    return {
      title: "This browser does not have room for the install.",
      detail: message,
      hint: "Free up space for this site, or remove an earlier local install, then import again.",
    };
  }

  if (/ISO ?9660|volume descriptor|raw sector|not a multiple of/i.test(message)) {
    return {
      title: "That file could not be read as a disc image.",
      detail: message,
      hint: "The image may be truncated, compressed or in a format RTAO cannot read. A plain ISO or BIN/CUE from your own disc works best.",
    };
  }

  return {
    title: fallbackTitle,
    detail: message,
    hint: "Check the image is a complete PAL copy of Road Trip Adventure, then try again.",
  };
}
