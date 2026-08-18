/**
 * Bounded-parallelism helper (AUDIT.md §8).
 *
 * Two things can go wrong invisibly here: results coming back in completion
 * order rather than input order (a file's text attached to the wrong document),
 * and the limit not actually limiting (20 concurrent PDF extractions).
 *
 * Run: `bun test`
 */

import { expect, test } from "bun:test";
import { mapWithConcurrency } from "./concurrency";

const tick = () => new Promise((resolve) => setTimeout(resolve, 1));

test("keeps input order even when jobs finish out of order", async () => {
  const results = await mapWithConcurrency([3, 1, 2], 3, async (n) => {
    // The first item is the slowest, so completion order is 1, 2, 3.
    for (let i = 0; i < n; i++) await tick();
    return n * 10;
  });

  expect(results).toEqual([30, 10, 20]);
});

test("never exceeds the concurrency limit", async () => {
  let inFlight = 0;
  let peak = 0;

  await mapWithConcurrency(Array.from({ length: 12 }), 3, async () => {
    inFlight++;
    peak = Math.max(peak, inFlight);
    await tick();
    inFlight--;
  });

  expect(peak).toBe(3);
});

test("processes every item when there are fewer than the limit", async () => {
  const seen: number[] = [];

  await mapWithConcurrency([1, 2], 8, async (n) => {
    seen.push(n);
  });

  expect(seen.sort()).toEqual([1, 2]);
});

test("an empty list does no work and returns nothing", async () => {
  expect(await mapWithConcurrency([], 4, async () => "x")).toEqual([]);
});
