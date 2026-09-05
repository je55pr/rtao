export type CreateObjectUrl = (blob: Blob) => string;
export type RevokeObjectUrl = (url: string) => void;

/**
 * Holds object URLs until their owning operation is explicitly disposed.
 *
 * Revoking a download URL on the next task is not safe: Chromium may still be
 * streaming a large Blob into its download artifact. Keeping the URL leased
 * until the fixture source is disposed lets Playwright finish `save_as()`
 * without racing URL revocation.
 */
export class DeferredObjectUrls {
  private readonly urls = new Set<string>();

  constructor(
    private readonly createObjectUrl: CreateObjectUrl = (blob) => URL.createObjectURL(blob),
    private readonly revokeObjectUrl: RevokeObjectUrl = (url) => URL.revokeObjectURL(url),
  ) {}

  create(blob: Blob): string {
    const url = this.createObjectUrl(blob);
    this.urls.add(url);
    return url;
  }

  releaseAll(): void {
    for (const url of this.urls) this.revokeObjectUrl(url);
    this.urls.clear();
  }

  get size(): number {
    return this.urls.size;
  }
}
