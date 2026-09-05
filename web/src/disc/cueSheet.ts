export interface CueSheet {
  readonly binFileName: string;
  readonly firstSector: number;
}

const filePattern = /^\s*FILE\s+"(?<file>.+)"\s+BINARY\s*$/i;
const trackPattern = /^\s*TRACK\s+01\s+MODE2\/2352\s*$/i;
const indexPattern = /^\s*INDEX\s+01\s+(?<minutes>\d+):(?<seconds>\d+):(?<frames>\d+)\s*$/i;

export function parseCueSheet(text: string): CueSheet {
  let binFileName: string | undefined;
  let mode2 = false;
  let firstSector: number | undefined;

  for (const line of text.replaceAll("\r", "").split("\n")) {
    const file = filePattern.exec(line);
    if (file?.groups?.file) {
      binFileName = basename(file.groups.file);
      continue;
    }
    if (trackPattern.test(line)) {
      mode2 = true;
      continue;
    }
    const index = indexPattern.exec(line);
    if (index?.groups) {
      const minutes = Number.parseInt(index.groups.minutes ?? "", 10);
      const seconds = Number.parseInt(index.groups.seconds ?? "", 10);
      const frames = Number.parseInt(index.groups.frames ?? "", 10);
      if (seconds >= 60 || frames >= 75) {
        throw new Error("Invalid CUE INDEX timestamp.");
      }
      firstSector = ((minutes * 60) + seconds) * 75 + frames;
    }
  }

  if (!binFileName || !mode2 || firstSector === undefined) {
    throw new Error("Expected a single-track TRACK 01 MODE2/2352 CUE with INDEX 01.");
  }
  return { binFileName, firstSector };
}

function basename(path: string): string {
  return path.replaceAll("\\", "/").split("/").at(-1) ?? path;
}
