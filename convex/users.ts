import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import { getUser, requireUser } from "./lib/auth";
import { purgeNotebook } from "./lib/cascade";
// camelCase filename is required: Convex rejects module paths containing hyphens.
import { decideRateLimit } from "./lib/rateLimitWindow";

/**
 * Per-user budgets for the routes that spend money, in requests per window.
 *
 * **Kept server-side on purpose.** An earlier shape took `limit` and
 * `windowMs` as arguments, which let any caller reset their own window by
 * passing `windowMs: 0` — the whole limit, bypassed from a browser console.
 *
 * Tune these; they are a guess, not a measured budget. `audio` is the
 * expensive one (~$0.30/call to ElevenLabs).
 */
const HOUR = 60 * 60 * 1000;
const RATE_LIMITS = {
  chat: { limit: 60, windowMs: HOUR },
  research: { limit: 10, windowMs: HOUR },
  audio: { limit: 5, windowMs: HOUR },
} as const;

/**
 * How long a delivery id is remembered, and how many stale ones one call
 * clears. Svix stops retrying long before 24h, so anything older than that
 * cannot be a retry of live traffic.
 */
const WEBHOOK_EVENT_TTL_MS = 24 * HOUR;
const WEBHOOK_PRUNE_BATCH = 50;

/**
 * Claim a Svix delivery id, returning false if this event was already applied.
 *
 * `upsertFromClerk` and `deleteUser` are individually idempotent, so a retry of
 * the *latest* event is harmless. What this stops is a replayed **older**
 * event — Svix redelivering a `user.updated` from an hour ago — overwriting the
 * profile with stale values (AUDIT.md §10).
 *
 * Pruning happens here rather than on a cron: this table is only ever written
 * from this function, so the write path is the one place guaranteed to run.
 */
export const claimWebhookEvent = internalMutation({
  args: { svixId: v.string() },
  handler: async (ctx, args) => {
    const seen = await ctx.db
      .query("webhookEvents")
      .withIndex("by_svix_id", (q) => q.eq("svixId", args.svixId))
      .first();

    if (seen) {
      return false;
    }

    const now = Date.now();
    await ctx.db.insert("webhookEvents", { svixId: args.svixId, seenAt: now });

    // Bounded batch, so a long-neglected table drains over several deliveries
    // instead of blowing one mutation's read limit.
    const stale = await ctx.db
      .query("webhookEvents")
      .withIndex("by_seen_at", (q) =>
        q.lt("seenAt", now - WEBHOOK_EVENT_TTL_MS)
      )
      .take(WEBHOOK_PRUNE_BATCH);

    for (const row of stale) {
      await ctx.db.delete(row._id);
    }

    return true;
  },
});

/**
 * Provision or refresh a user row from a Clerk `user.created` /
 * `user.updated` webhook.
 *
 * `internalMutation`, so it is unreachable from a browser. It takes a
 * `clerkId` argument — normally forbidden here (see `convex/lib/auth.ts`) —
 * because the caller is `convex/http.ts`, which has already verified the Svix
 * signature. There is no session to derive an identity from.
 *
 * This is the only writer of profile fields. The browser cannot influence
 * them, which is the point: the previous client-side upsert took `email` and
 * the names on trust.
 */
export const upsertFromClerk = internalMutation({
  args: {
    clerkId: v.string(),
    email: v.string(),
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const clerkId = args.clerkId;

    const existingUser = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", clerkId))
      .first();

    if (existingUser) {
      // Update existing user
      await ctx.db.patch(existingUser._id, {
        email: args.email,
        firstName: args.firstName,
        lastName: args.lastName,
        imageUrl: args.imageUrl,
        updatedAt: Date.now(),
      });
      return existingUser._id;
    }

    // Create new user
    return await ctx.db.insert("users", {
      clerkId,
      email: args.email,
      firstName: args.firstName,
      lastName: args.lastName,
      imageUrl: args.imageUrl,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  },
});

/**
 * Spend one unit of the caller's budget for a route, atomically.
 *
 * Fixed window, not a sliding one: a caller can burst up to `limit` at the end
 * of one window and again at the start of the next. That is the accepted
 * ceiling — a sliding window needs a log of timestamps per user. Move to one
 * if the burst turns out to matter.
 *
 * Lives here rather than in a `rateLimits.ts` for the reason in CLAUDE.md
 * trap 5c: a new `convex/` module does not typecheck until codegen runs.
 *
 * @returns `retryAfterSeconds` > 0 when the request must be rejected.
 */
export const consumeRateLimit = mutation({
  args: {
    key: v.union(v.literal("chat"), v.literal("research"), v.literal("audio")),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const { limit, windowMs } = RATE_LIMITS[args.key];

    const existing = await ctx.db
      .query("rateLimits")
      .withIndex("by_user_key", (q) =>
        q.eq("userId", user._id).eq("key", args.key)
      )
      .first();

    const now = Date.now();
    const decision = decideRateLimit(existing, now, limit, windowMs);

    if (decision.action === "reject") {
      return { retryAfterSeconds: decision.retryAfterSeconds };
    }

    if (existing) {
      await ctx.db.patch(
        existing._id,
        decision.action === "increment"
          ? { count: decision.count }
          : { windowStart: now, count: 1 }
      );
    } else {
      await ctx.db.insert("rateLimits", {
        userId: user._id,
        key: args.key,
        windowStart: now,
        count: 1,
      });
    }

    return { retryAfterSeconds: 0 };
  },
});

// Get the signed-in user's own row. Returns null when anonymous or not yet
// provisioned. (`getUserByClerkId` was a byte-identical duplicate of this and
// has been removed.)
export const getCurrentUser = query({
  args: {},
  handler: async (ctx) => {
    return await getUser(ctx);
  },
});

/**
 * Delete a user and everything they own.
 *
 * `internalMutation`, so it is not reachable from a browser at all — the
 * previous public version let anyone wipe any account by passing its
 * `clerkId`. Called by the `user.deleted` webhook in `convex/http.ts`.
 *
 * A missing user is not an error: Clerk retries deliveries, so this has to be
 * safe to run twice.
 */
export const deleteUser = internalMutation({
  args: { clerkId: v.string() },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .first();

    if (!user) {
      return;
    }

    const notebooks = await ctx.db
      .query("notebooks")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();

    for (const notebook of notebooks) {
      await purgeNotebook(ctx, notebook._id);
    }

    // Rate-limit counters are keyed by user, so they would outlive the account.
    const counters = await ctx.db
      .query("rateLimits")
      .withIndex("by_user_key", (q) => q.eq("userId", user._id))
      .collect();

    for (const counter of counters) {
      await ctx.db.delete(counter._id);
    }

    await ctx.db.delete(user._id);
  },
});
