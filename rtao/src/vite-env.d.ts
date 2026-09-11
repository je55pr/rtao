/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * Which published build this is: omitted or "stable" for the public build,
   * "dev" for the DEV player. Selects the origin storage root — see
   * `src/storage/storageChannel.ts`.
   */
  readonly VITE_RTA_CHANNEL?: string;
}
