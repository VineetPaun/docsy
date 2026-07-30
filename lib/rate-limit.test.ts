/**
 * Fixed-window rate limiting (AUDIT.md §3.4).
 *
 * This guards paid routes — ElevenLabs at ~$0.30/call — so the window
 * arithmetic gets a test even though the surrounding mutation does not.
 *
 * Run: `bun test`
 */

import { expect, test } from "bun:test";
import { decideRateLimit } from "../convex/lib/rate-limit-window";

const MINUTE = 60_000;
const WINDOW = 60 * MINUTE;
const LIMIT = 3;
const NOW = 1_700_000_000_000;

test("first call in a window starts a fresh one", () => {
  expect(decideRateLimit(null, NOW, LIMIT, WINDOW)).toEqual({
    action: "reset",
  });
});

test("counts up while under the limit", () => {
  expect(
    decideRateLimit({ windowStart: NOW, count: 1 }, NOW + 1000, LIMIT, WINDOW)
  ).toEqual({ action: "increment", count: 2 });
});

test("rejects on the call that would exceed the limit", () => {
  const decision = decideRateLimit(
    { windowStart: NOW, count: LIMIT },
    NOW + 10 * MINUTE,
    LIMIT,
    WINDOW
  );

  expect(decision.action).toBe("reject");
  // 50 minutes of the window left.
  expect(decision).toEqual({ action: "reject", retryAfterSeconds: 50 * 60 });
});

test("Retry-After is never zero at the very end of the window", () => {
  // 1ms left rounds up, not down — `Retry-After: 0` invites an instant retry.
  expect(
    decideRateLimit(
      { windowStart: NOW, count: LIMIT },
      NOW + WINDOW - 1,
      LIMIT,
      WINDOW
    )
  ).toEqual({ action: "reject", retryAfterSeconds: 1 });
});

test("an expired window resets rather than staying blocked", () => {
  // Exactly one window later: the old count must not lock the user out.
  expect(
    decideRateLimit(
      { windowStart: NOW, count: LIMIT },
      NOW + WINDOW,
      LIMIT,
      WINDOW
    )
  ).toEqual({ action: "reset" });
});
