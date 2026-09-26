/**
 * OPFS is keyed by origin. The hosted build now lives only at the root Pages
 * URL, but it intentionally keeps the historical `dev` channel so installs
 * created by the former `/dev/` deployment remain reusable after the move.
 */

export const stableAppDirectoryName = "rta-browser";

export function appStorageDirectoryName(channel: string | undefined): string {
  if (channel === undefined || channel === "" || channel === "stable") return stableAppDirectoryName;
  if (channel === "dev") return `${stableAppDirectoryName}-dev`;
  // Falling back would silently share the stable install; fail loudly instead.
  throw new Error(`Unknown RTAO storage channel '${channel}'. Expected 'stable' or 'dev'.`);
}
