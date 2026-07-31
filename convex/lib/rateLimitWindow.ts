/**
 * The fixed-window decision, with no database in it (AUDIT.md §3.4).
 *
 * Split out from the mutation in `convex/users.ts` purely so it can be tested
 * without a Convex harness — see `lib/rate-limit.test.ts`. The window arithmetic
 * is the part worth pinning down: an off-by-one there either lets a paid route
 * run unbounded or locks a user out of it for good.
 */

/** The stored counter, or null when the user has never hit this route. */
export type Counter = { windowStart: number; count: number } | null;

export type Decision =
  /** Start a fresh window at `now`: no counter yet, or the last one expired. */
  | { action: "reset" }
  /** Within the window and under budget. */
  | { action: "increment"; count: number }
  /** Over budget; `retryAfterSeconds` is what the 429 advertises. */
  | { action: "reject"; retryAfterSeconds: number };

export function decideRateLimit(
  counter: Counter,
  now: number,
  limit: number,
  windowMs: number
): Decision {
  if (!counter || now - counter.windowStart >= windowMs) {
    return { action: "reset" };
  }

  if (counter.count >= limit) {
    return {
      action: "reject",
      // Never advertise 0 — a client that trusts `Retry-After: 0` retries
      // immediately and is rejected again.
      retryAfterSeconds: Math.max(
        1,
        Math.ceil((counter.windowStart + windowMs - now) / 1000)
      ),
    };
  }

  return { action: "increment", count: counter.count + 1 };
}
