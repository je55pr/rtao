import { describe, expect, it, vi } from "vitest";
import { RuntimeFieldAssetCache } from "./runtimeFieldAssetCache";

describe("RuntimeFieldAssetCache", () => {
  it("reuses a loaded field and reports hits and misses", async () => {
    const cache = new RuntimeFieldAssetCache<string>(3);
    const load = vi.fn(async () => "field-223");

    await expect(cache.getOrLoad(223, load)).resolves.toBe("field-223");
    await expect(cache.getOrLoad(223, load)).resolves.toBe("field-223");

    expect(load).toHaveBeenCalledTimes(1);
    expect(cache.snapshot()).toEqual({ entries: 1, hits: 1, misses: 1 });
  });

  it("keeps the most recently used fields when capacity is exceeded", async () => {
    const cache = new RuntimeFieldAssetCache<string>(2);
    const loads = new Map<number, number>();
    const load = (fieldNumber: number) => async () => {
      loads.set(fieldNumber, (loads.get(fieldNumber) ?? 0) + 1);
      return `field-${fieldNumber}`;
    };

    await cache.getOrLoad(223, load(223));
    await cache.getOrLoad(221, load(221));
    await cache.getOrLoad(223, load(223));
    await cache.getOrLoad(220, load(220));

    await cache.getOrLoad(223, load(223));
    await cache.getOrLoad(221, load(221));

    expect(loads.get(223)).toBe(1);
    expect(loads.get(221)).toBe(2);
    expect(loads.get(220)).toBe(1);
    expect(cache.snapshot()).toEqual({ entries: 2, hits: 2, misses: 4 });
  });

  it("drops failed loads so a later transition can retry", async () => {
    const cache = new RuntimeFieldAssetCache<string>(2);
    const load = vi.fn()
      .mockRejectedValueOnce(new Error("OPFS read failed"))
      .mockResolvedValueOnce("field-113");

    await expect(cache.getOrLoad(113, load)).rejects.toThrow("OPFS read failed");
    await expect(cache.getOrLoad(113, load)).resolves.toBe("field-113");

    expect(load).toHaveBeenCalledTimes(2);
    expect(cache.snapshot()).toEqual({ entries: 1, hits: 0, misses: 2 });
  });

  it("clears retained assets and counters when the install changes", async () => {
    const cache = new RuntimeFieldAssetCache<string>(2);
    await cache.getOrLoad(223, async () => "field-223");
    await cache.getOrLoad(223, async () => "unused");

    cache.clear();

    expect(cache.snapshot()).toEqual({ entries: 0, hits: 0, misses: 0 });
  });
});
