/**
 * Per-user rate limiting for the routes that spend money (AUDIT.md §3.4).
 *
 * The counter lives in Convex (`consumeRateLimit` in `convex/users.ts`), not in
 * Redis and not in process memory:
 *
 * - **Not memory.** Serverless handlers scale out, so a per-instance `Map`
 *   would let a burst through in proportion to the number of warm instances.
 *   A limit that only sometimes applies is not a limit.
 * - **Not Upstash.** It would add two more env vars that fail silently, which
 *   is already this repo's most common breakage (CLAUDE.md trap 2).
 *
 * The budgets themselves are server-side in `convex/users.ts` — this module
 * only names a bucket, so a caller cannot ask for a bigger allowance.
 */

import { NextResponse } from "next/server";
import { api } from "@/convex/_generated/api";
import { authedConvexClient } from "@/lib/convex-server";

/** Buckets defined by `RATE_LIMITS` in `convex/users.ts`. */
export type RateLimitKey = "chat" | "research" | "audio";

/**
 * Spend one unit of the caller's budget.
 *
 * Usage, after `requireApiAuth()`:
 *
 * ```ts
 * const limited = await enforceRateLimit("chat");
 * if (limited) return limited;
 * ```
 *
 * Fails closed: if the counter cannot be reached, the request is refused
 * rather than served for free. A cost control that cannot count must not
 * authorise spending.
 *
 * @returns null when the request may proceed, otherwise a ready-to-return 429
 * (or 503 when the counter is unreachable).
 */
export async function enforceRateLimit(
  key: RateLimitKey
): Promise<NextResponse | null> {
  const client = await authedConvexClient();
  if (!client) {
    return NextResponse.json(
      { error: "Rate limiting unavailable" },
      { status: 503 }
    );
  }

  // The mutation throws for an unauthenticated or not-yet-provisioned caller
  // (the webhook race in AUDIT.md §3.1). This runs before the handler's own
  // try/catch, so an escaping error would surface as an unhandled 500.
  let retryAfterSeconds: number;
  try {
    ({ retryAfterSeconds } = await client.mutation(api.users.consumeRateLimit, {
      key,
    }));
  } catch {
    return NextResponse.json(
      { error: "Rate limiting unavailable" },
      { status: 503 }
    );
  }

  if (retryAfterSeconds > 0) {
    return NextResponse.json(
      { error: "Rate limit exceeded. Try again later." },
      { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } }
    );
  }

  return null;
}
