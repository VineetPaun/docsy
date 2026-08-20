/**
 * The smallest LRU that works (AUDIT.md §8).
 *
 * A `Map` already keeps insertion order, so "least recently used" is its first
 * key once every read re-inserts. That is the whole implementation — no
 * dependency, no doubly-linked list, no TTL. Bounded because these caches live
 * in a long-running server process and an unbounded one is a slow memory leak.
 */
export interface LruCache<T> {
  get(key: string): T | undefined;
  set(key: string, value: T): void;
  readonly size: number;
}

export function createLruCache<T>(maxEntries: number): LruCache<T> {
  const entries = new Map<string, T>();

  return {
    get(key) {
      if (!entries.has(key)) return undefined;

      // Re-insert so this key becomes the newest, not the next to be evicted.
      const value = entries.get(key) as T;
      entries.delete(key);
      entries.set(key, value);

      return value;
    },

    set(key, value) {
      // Delete first so an overwrite also counts as a use.
      entries.delete(key);
      entries.set(key, value);

      if (entries.size > maxEntries) {
        // The oldest key is the first one the iterator yields.
        const oldest = entries.keys().next().value;
        if (oldest !== undefined) entries.delete(oldest);
      }
    },

    get size() {
      return entries.size;
    },
  };
}
