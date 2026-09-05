import type { Iso9660Disc } from "../disc/iso9660";

export const expectedEuropeanExecutable = "SLES_513.56";

export interface GameIdentity {
  readonly bootExecutable: string;
  readonly version: string;
  readonly videoMode: string;
  readonly supported: boolean;
}

export async function readGameIdentity(disc: Iso9660Disc): Promise<GameIdentity> {
  const text = new TextDecoder("ascii").decode(await disc.readFile("SYSTEM.CNF"));
  const values = new Map<string, string>();
  for (const line of text.replaceAll("\r", "").split("\n")) {
    const equals = line.indexOf("=");
    if (equals < 0) continue;
    values.set(line.slice(0, equals).trim().toUpperCase(), line.slice(equals + 1).trim());
  }

  const boot = values.get("BOOT2");
  if (!boot) throw new Error("SYSTEM.CNF has no BOOT2 entry.");
  let executable = boot.split(/[\\/]/).at(-1) ?? boot;
  const versionSuffix = executable.indexOf(";");
  if (versionSuffix >= 0) executable = executable.slice(0, versionSuffix);
  const supported = executable.toUpperCase() === expectedEuropeanExecutable;
  return {
    bootExecutable: executable,
    version: values.get("VER") ?? "",
    videoMode: values.get("VMODE") ?? "",
    supported,
  };
}
