/**
 * Origin storage is shared by every build served from the same host, and OPFS
 * is keyed by origin rather than by path. A stable build at `/` and a DEV build
 * at `/dev/` would therefore share one install, one current pointer and one
 * cache schema version, so each build names its own storage root instead.
 */

export const stableAppDirectoryName = "rta-browser";

export function appStorageDirectoryName(channel: string | undefined): string {
  if (channel === undefined || channel === "" || channel === "stable") return stableAppDirectoryName;
  if (channel === "dev") return `${stableAppDirectoryName}-dev`;
  // Falling back would silently share the stable install; fail loudly instead.
  throw new Error(`Unknown RTAO storage channel '${channel}'. Expected 'stable' or 'dev'.`);
}
