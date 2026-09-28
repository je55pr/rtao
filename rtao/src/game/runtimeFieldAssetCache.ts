export interface RuntimeFieldAssetCacheStats {
  readonly entries: number;
  readonly hits: number;
  readonly misses: number;
}

export class RuntimeFieldAssetCache<T> {
  private readonly entries = new Map<number, Promise<T>>();
  private hits = 0;
  private misses = 0;

  constructor(private readonly capacity: number) {
    if (!Number.isInteger(capacity) || capacity < 1) {
      throw new RangeError("Runtime field asset cache capacity must be a positive integer.");
    }
  }

  getOrLoad(fieldNumber: number, load: () => Promise<T>): Promise<T> {
    const cached = this.entries.get(fieldNumber);
    if (cached) {
      this.hits += 1;
      this.entries.delete(fieldNumber);
      this.entries.set(fieldNumber, cached);
      return cached;
    }

    this.misses += 1;
    let pending: Promise<T>;
    pending = load().catch((error) => {
      if (this.entries.get(fieldNumber) === pending) this.entries.delete(fieldNumber);
      throw error;
    });
    this.entries.set(fieldNumber, pending);
    this.evictOverflow();
    return pending;
  }

  clear(): void {
    this.entries.clear();
    this.hits = 0;
    this.misses = 0;
  }

  snapshot(): RuntimeFieldAssetCacheStats {
    return {
      entries: this.entries.size,
      hits: this.hits,
      misses: this.misses,
    };
  }

  private evictOverflow(): void {
    while (this.entries.size > this.capacity) {
      const oldest = this.entries.keys().next().value as number | undefined;
      if (oldest === undefined) break;
      this.entries.delete(oldest);
    }
  }
}
