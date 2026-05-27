import { LRUCache } from "lru-cache";

export type LruOptions<_K extends {}, _V extends {}> = {
  max?: number;
  ttlMs?: number;
};

export function makeLru<K extends {}, V extends {}>(opts: LruOptions<K, V> = {}): LRUCache<K, V> {
  return new LRUCache<K, V>({
    max: opts.max ?? 1000,
    ttl: opts.ttlMs ?? 5 * 60 * 1000,
    updateAgeOnGet: false,
    allowStale: false,
  });
}

export { LRUCache };
