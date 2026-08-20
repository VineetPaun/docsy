/**
 * Bounded LRU (AUDIT.md §8).
 *
 * It backs the embedding cache, so the two failure modes are worth pinning: an
 * eviction order that drops the hot key, and a bound that does not bound.
 *
 * Run: `bun test`
 */

import { expect, test } from "bun:test";
import { createLruCache } from "./lru";

test("returns what was stored, and undefined for a miss", () => {
  const cache = createLruCache<number>(2);
  cache.set("a", 1);

  expect(cache.get("a")).toBe(1);
  expect(cache.get("b")).toBeUndefined();
});

test("evicts the least recently used, not the oldest inserted", () => {
  const cache = createLruCache<number>(2);
  cache.set("a", 1);
  cache.set("b", 2);

  // Touching "a" makes "b" the eviction candidate.
  cache.get("a");
  cache.set("c", 3);

  expect(cache.get("a")).toBe(1);
  expect(cache.get("b")).toBeUndefined();
  expect(cache.get("c")).toBe(3);
});

test("never grows past its bound", () => {
  const cache = createLruCache<number>(3);
  for (let i = 0; i < 100; i++) cache.set(`k${i}`, i);

  expect(cache.size).toBe(3);
  expect(cache.get("k99")).toBe(99);
});

test("overwriting a key counts as using it", () => {
  const cache = createLruCache<number>(2);
  cache.set("a", 1);
  cache.set("b", 2);
  cache.set("a", 10);
  cache.set("c", 3);

  expect(cache.get("a")).toBe(10);
  expect(cache.get("b")).toBeUndefined();
});
