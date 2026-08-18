/**
 * Run an async job over a list, a few at a time (AUDIT.md §8).
 *
 * A twelve-file drop used to be twelve sequential extract → upload → embed
 * round trips, each waiting on the last, so the wall-clock cost was the sum of
 * every file's latency even though the server handles them independently.
 *
 * ponytail: a fixed-size worker pool rather than `p-limit`. Twenty lines against
 * a dependency, and `Promise.all` alone is not the answer — unbounded fan-out
 * on a 20-file drop means 20 simultaneous PDF extractions.
 */

/**
 * Map `items` through `fn` with at most `limit` in flight.
 *
 * Results keep the input order regardless of completion order. `fn` must not
 * throw — a rejection aborts the pool and loses the results of jobs that had
 * already finished, which is exactly the "one bad file discards the batch"
 * behaviour this exists to avoid. Catch per item and return a result object.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;

  // One worker per slot, each pulling the next index until the list is done.
  const workers = Array.from(
    { length: Math.max(1, Math.min(limit, items.length)) },
    async () => {
      while (true) {
        const index = next++;
        if (index >= items.length) return;

        results[index] = await fn(items[index], index);
      }
    }
  );

  await Promise.all(workers);

  return results;
}
