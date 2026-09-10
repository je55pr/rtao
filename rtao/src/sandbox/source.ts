import {
  expectedEuropeanExecutable,
  readGameIdentity,
  type GameIdentity,
} from "../formats/gameIdentity";
import { openDirectImportSource } from "../importer/directSource";

export type DirectImportSource = Awaited<ReturnType<typeof openDirectImportSource>>;

export async function readSupportedIdentity(source: DirectImportSource): Promise<GameIdentity> {
  const identity = await readGameIdentity(source.disc);
  if (!identity.supported) {
    throw new Error(`Expected PAL ${expectedEuropeanExecutable}; found '${identity.bootExecutable}'.`);
  }
  return identity;
}
