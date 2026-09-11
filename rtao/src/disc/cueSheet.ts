export interface CueSheet {
  readonly binFileName: string;
  readonly firstSector: number;
}

const filePattern = /^\s*FILE\s+"(?<file>.+)"\s+BINARY\s*$/i;
const trackPattern = /^\s*TRACK\s+(?<number>\d+)\s+(?<mode>\S+)\s*$/i;
const indexPattern = /^\s*INDEX\s+(?<index>\d+)\s+(?<minutes>\d+):(?<seconds>\d+):(?<frames>\d+)\s*$/i;

/**
 * Reads the MODE2/2352 data track only. A retail disc may carry further CDDA
 * tracks after it; their INDEX lines describe audio this importer never reads,
 * so they are skipped rather than mistaken for the data track's start sector.
 */
export function parseCueSheet(text: string): CueSheet {
  let binFileName: string | undefined;
  let currentTrack: number | undefined;
  let dataTrackIsMode2 = false;
  let firstSector: number | undefined;

  for (const line of text.replaceAll("\r", "").split("\n")) {
    const file = filePattern.exec(line);
    if (file?.groups?.file) {
      binFileName = basename(file.groups.file);
      continue;
    }
    const track = trackPattern.exec(line);
    if (track?.groups) {
      currentTrack = Number.parseInt(track.groups.number ?? "", 10);
      if (currentTrack === 1) dataTrackIsMode2 = /^MODE2\/2352$/i.test(track.groups.mode ?? "");
      continue;
    }
    const index = indexPattern.exec(line);
    if (!index?.groups || currentTrack !== 1 || firstSector !== undefined) continue;
    if (Number.parseInt(index.groups.index ?? "", 10) !== 1) continue;
    const minutes = Number.parseInt(index.groups.minutes ?? "", 10);
    const seconds = Number.parseInt(index.groups.seconds ?? "", 10);
    const frames = Number.parseInt(index.groups.frames ?? "", 10);
    if (seconds >= 60 || frames >= 75) {
      throw new Error("Invalid CUE INDEX timestamp.");
    }
    firstSector = ((minutes * 60) + seconds) * 75 + frames;
  }

  if (!binFileName || !dataTrackIsMode2 || firstSector === undefined) {
    throw new Error("Expected a CUE whose TRACK 01 is MODE2/2352 with an INDEX 01.");
  }
  return { binFileName, firstSector };
}

function basename(path: string): string {
  return path.replaceAll("\\", "/").split("/").at(-1) ?? path;
}
