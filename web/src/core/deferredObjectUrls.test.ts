import { describe, expect, it } from "vitest";
import { DeferredObjectUrls } from "./deferredObjectUrls";

describe("deferred object URL lifecycle", () => {
  it("keeps a fixture larger than 1 MiB alive until explicit cleanup", () => {
    const fixture = new Blob([new Uint8Array(2 * 1024 * 1024 + 17)]);
    const revoked: string[] = [];
    const urls = new DeferredObjectUrls(
      (blob) => {
        expect(blob.size).toBe(2 * 1024 * 1024 + 17);
        return "blob:rta-large-fixture";
      },
      (url) => revoked.push(url),
    );

    expect(urls.create(fixture)).toBe("blob:rta-large-fixture");
    expect(urls.size).toBe(1);
    expect(revoked).toEqual([]);

    urls.releaseAll();
    expect(urls.size).toBe(0);
    expect(revoked).toEqual(["blob:rta-large-fixture"]);
  });

  it("releases every retained URL exactly once", () => {
    let nextId = 0;
    const revoked: string[] = [];
    const urls = new DeferredObjectUrls(
      () => `blob:rta-${++nextId}`,
      (url) => revoked.push(url),
    );

    urls.create(new Blob(["sky"]));
    urls.create(new Blob(["field"]));
    urls.releaseAll();
    urls.releaseAll();

    expect(revoked).toEqual(["blob:rta-1", "blob:rta-2"]);
  });
});
