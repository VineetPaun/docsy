/**
 * `convex/users.ts` — the rate limiter, webhook replay, and account deletion.
 *
 * `lib/rate-limit.test.ts` already covers `decideRateLimit`'s arithmetic. What
 * it cannot cover is the part that was the actual vulnerability: the budget
 * is chosen *inside* the mutation, from a table the caller cannot reach. An
 * earlier shape took `limit` and `windowMs` as arguments, so `windowMs: 0`
 * reset the window from a browser console.
 */

import { describe, expect, test } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { asUser, seedFile, seedNotebook, seedUser, testConvex } from "./setup";

/** `audio` is the tightest budget: 5 an hour, ~$0.30 of ElevenLabs a call. */
const AUDIO_LIMIT = 5;

describe("consumeRateLimit", () => {
  test("refuses an anonymous caller", async () => {
    const t = testConvex();

    // An unauthenticated spender would get an unmetered budget of its own.
    await expect(
      t.mutation(api.users.consumeRateLimit, { key: "audio" })
    ).rejects.toThrow("Unauthenticated");
  });

  test("rejects the call after the budget is spent", async () => {
    const t = testConvex();
    await seedUser(t, "owner");
    const caller = asUser(t, "owner");

    for (let i = 0; i < AUDIO_LIMIT; i++) {
      const allowed = await caller.mutation(api.users.consumeRateLimit, {
        key: "audio",
      });
      expect(allowed.retryAfterSeconds).toBe(0);
    }

    const rejected = await caller.mutation(api.users.consumeRateLimit, {
      key: "audio",
    });
    // A `Retry-After` the caller can act on, not a bare failure.
    expect(rejected.retryAfterSeconds).toBeGreaterThan(0);
  });

  test("meters each route separately", async () => {
    const t = testConvex();
    await seedUser(t, "owner");
    const caller = asUser(t, "owner");

    for (let i = 0; i < AUDIO_LIMIT; i++) {
      await caller.mutation(api.users.consumeRateLimit, { key: "audio" });
    }

    // Exhausting the audio budget must not lock the user out of chat.
    const chat = await caller.mutation(api.users.consumeRateLimit, {
      key: "chat",
    });
    expect(chat.retryAfterSeconds).toBe(0);
  });

  test("meters each user separately", async () => {
    const t = testConvex();
    await seedUser(t, "heavy");
    await seedUser(t, "light");

    for (let i = 0; i < AUDIO_LIMIT; i++) {
      await asUser(t, "heavy").mutation(api.users.consumeRateLimit, {
        key: "audio",
      });
    }

    const other = await asUser(t, "light").mutation(
      api.users.consumeRateLimit,
      { key: "audio" }
    );
    expect(other.retryAfterSeconds).toBe(0);
  });

  test("opens a fresh window once the old one expires", async () => {
    const t = testConvex();
    const userId = await seedUser(t, "owner");
    const caller = asUser(t, "owner");

    for (let i = 0; i < AUDIO_LIMIT; i++) {
      await caller.mutation(api.users.consumeRateLimit, { key: "audio" });
    }

    // Age the counter rather than the clock: the window length is server-side
    // and a caller has no way to shorten it.
    await t.run(async (ctx) => {
      const row = await ctx.db.query("rateLimits").first();
      await ctx.db.patch(row!._id, {
        windowStart: Date.now() - 2 * 60 * 60 * 1000,
      });
    });

    const afterWindow = await caller.mutation(api.users.consumeRateLimit, {
      key: "audio",
    });
    expect(afterWindow.retryAfterSeconds).toBe(0);

    const row = await t.run((ctx) => ctx.db.query("rateLimits").first());
    expect(row?.count).toBe(1);
    expect(row?.userId).toBe(userId);
  });
});

describe("claimWebhookEvent", () => {
  test("claims a delivery once and refuses the replay", async () => {
    const t = testConvex();

    expect(
      await t.mutation(internal.users.claimWebhookEvent, { svixId: "msg_1" })
    ).toBe(true);

    // Svix redelivers; the second attempt must not re-apply the event.
    expect(
      await t.mutation(internal.users.claimWebhookEvent, { svixId: "msg_1" })
    ).toBe(false);

    // One row per delivery id, not per delivery.
    const rows = await t.run((ctx) => ctx.db.query("webhookEvents").collect());
    expect(rows).toHaveLength(1);
  });

  test("prunes delivery ids older than a day", async () => {
    const t = testConvex();

    await t.run((ctx) =>
      ctx.db.insert("webhookEvents", {
        svixId: "msg_ancient",
        seenAt: Date.now() - 48 * 60 * 60 * 1000,
      })
    );

    await t.mutation(internal.users.claimWebhookEvent, { svixId: "msg_new" });

    // Unbounded growth on a table only this function writes to.
    const ids = (
      await t.run((ctx) => ctx.db.query("webhookEvents").collect())
    ).map((r) => r.svixId);
    expect(ids).toEqual(["msg_new"]);
  });
});

describe("upsertFromClerk", () => {
  test("creates once, then updates the same row", async () => {
    const t = testConvex();

    const first = await t.mutation(internal.users.upsertFromClerk, {
      clerkId: "clerk_1",
      email: "a@example.test",
    });

    const second = await t.mutation(internal.users.upsertFromClerk, {
      clerkId: "clerk_1",
      email: "b@example.test",
      firstName: "Bee",
    });

    // A retried `user.created` must not produce a second account.
    expect(second).toBe(first);

    const rows = await t.run((ctx) => ctx.db.query("users").collect());
    expect(rows).toHaveLength(1);
    expect(rows[0].email).toBe("b@example.test");
    expect(rows[0].firstName).toBe("Bee");
  });

  test("leaves the account's stored bytes alone", async () => {
    const t = testConvex();
    await seedUser(t, "clerk_1", 4_096);

    await t.mutation(internal.users.upsertFromClerk, {
      clerkId: "clerk_1",
      email: "a@example.test",
    });

    // A profile refresh that reset the quota counter would hand the account
    // unlimited free storage, one webhook at a time.
    const row = await t.run((ctx) => ctx.db.query("users").first());
    expect(row?.storageBytes).toBe(4_096);
  });
});

describe("deleteUser", () => {
  test("removes every notebook, source, file and counter", async () => {
    const t = testConvex();
    const userId = await seedUser(t, "leaver");
    const survivorId = await seedUser(t, "survivor");

    const notebookId = await seedNotebook(t, userId);
    const survivorNotebookId = await seedNotebook(t, survivorId);

    const sourceFile = await seedFile(t, "f".repeat(100));

    await asUser(t, "leaver").mutation(api.documents.createDocument, {
      notebookId,
      name: "theirs.pdf",
      type: "pdf",
      storageId: sourceFile,
    });
    await asUser(t, "leaver").mutation(api.users.consumeRateLimit, {
      key: "chat",
    });

    await t.mutation(internal.users.deleteUser, { clerkId: "leaver" });

    await t.run(async (ctx) => {
      expect(await ctx.db.query("users").collect()).toHaveLength(1);
      expect(await ctx.db.get(notebookId)).toBeNull();
      expect(await ctx.db.query("documents").collect()).toHaveLength(0);
      // Counters are keyed by user, so they would outlive the account.
      expect(await ctx.db.query("rateLimits").collect()).toHaveLength(0);
      expect(await ctx.db.system.get(sourceFile as Id<"_storage">)).toBeNull();

      // The other account is untouched.
      expect(await ctx.db.get(survivorNotebookId)).not.toBeNull();
    });
  });

  test("is safe to run twice", async () => {
    const t = testConvex();
    await seedUser(t, "leaver");

    await t.mutation(internal.users.deleteUser, { clerkId: "leaver" });
    // Clerk retries deliveries; a throw here would make the webhook fail
    // forever on an account that is already gone. (Convex returns `undefined`
    // to the client as null.)
    await expect(
      t.mutation(internal.users.deleteUser, { clerkId: "leaver" })
    ).resolves.toBeNull();
  });
});

describe("getCurrentUser", () => {
  test("is null when anonymous or unprovisioned", async () => {
    const t = testConvex();
    await seedUser(t, "owner");

    expect(await t.query(api.users.getCurrentUser, {})).toBeNull();
    // Signed in, but no webhook ever created the row — the state a missing
    // Clerk webhook leaves every new signup in.
    expect(
      await asUser(t, "ghost").query(api.users.getCurrentUser, {})
    ).toBeNull();
    expect(
      (await asUser(t, "owner").query(api.users.getCurrentUser, {}))?.clerkId
    ).toBe("owner");
  });
});
