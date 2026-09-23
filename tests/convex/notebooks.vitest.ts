/**
 * `convex/notebooks.ts` — ownership, the per-account cap, and the cascade.
 *
 * The cascade is the part worth running rather than reading: deleting a
 * notebook has to take its documents, messages, audio overviews, stored files
 * and vectors with it. Every one of those was orphaned by some earlier
 * partial version of this delete, and an orphan is invisible until a deleted
 * document comes back as a chat citation.
 */

import { describe, expect, test } from "vitest";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { internal } from "../../convex/_generated/api";
import { asUser, seedFile, seedNotebook, seedUser, testConvex } from "./setup";

describe("createNotebook", () => {
  test("refuses an anonymous caller", async () => {
    const t = testConvex();

    await expect(
      t.mutation(api.notebooks.createNotebook, { title: "Mine" })
    ).rejects.toThrow("Unauthenticated");
  });

  test("refuses the 26th notebook", async () => {
    const t = testConvex();
    const userId = await seedUser(t, "owner");

    await t.run(async (ctx) => {
      for (let i = 0; i < 25; i++) {
        await ctx.db.insert("notebooks", {
          userId,
          title: `nb-${i}`,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
      }
    });

    await expect(
      asUser(t, "owner").mutation(api.notebooks.createNotebook, {
        title: "one too many",
      })
    ).rejects.toThrow("maximum");
  });

  test("counts only the caller's own notebooks towards the cap", async () => {
    const t = testConvex();
    const otherId = await seedUser(t, "other");
    await seedUser(t, "owner");

    await t.run(async (ctx) => {
      for (let i = 0; i < 25; i++) {
        await ctx.db.insert("notebooks", {
          userId: otherId,
          title: `theirs-${i}`,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
      }
    });

    // A cap scoped to the wrong user locks everyone out once one account is
    // full.
    await expect(
      asUser(t, "owner").mutation(api.notebooks.createNotebook, {
        title: "mine",
      })
    ).resolves.toBeTruthy();
  });
});

describe("getNotebook", () => {
  test("returns null for someone else's notebook", async () => {
    const t = testConvex();
    const ownerId = await seedUser(t, "owner");
    await seedUser(t, "intruder");
    const notebookId = await seedNotebook(t, ownerId, "Private");

    // `lib/convex-server.ts` treats a null here as "not yours" and 403s every
    // guarded API route on it, so this is the hinge for the whole HTTP layer.
    const seen = await asUser(t, "intruder").query(api.notebooks.getNotebook, {
      notebookId,
    });
    expect(seen).toBeNull();

    const mine = await asUser(t, "owner").query(api.notebooks.getNotebook, {
      notebookId,
    });
    expect(mine?.title).toBe("Private");
  });
});

describe("updateNotebook", () => {
  test("refuses someone else's notebook", async () => {
    const t = testConvex();
    const ownerId = await seedUser(t, "owner");
    await seedUser(t, "intruder");
    const notebookId = await seedNotebook(t, ownerId, "Private");

    await expect(
      asUser(t, "intruder").mutation(api.notebooks.updateNotebook, {
        notebookId,
        title: "Defaced",
      })
    ).rejects.toThrow("Notebook not found");

    expect((await t.run((ctx) => ctx.db.get(notebookId)))?.title).toBe(
      "Private"
    );
  });
});

describe("deleteNotebook", () => {
  test("takes documents, messages, overviews, files and bytes with it", async () => {
    const t = testConvex();
    const userId = await seedUser(t, "owner");
    const notebookId = await seedNotebook(t, userId);
    const keptNotebookId = await seedNotebook(t, userId, "Untouched");

    const sourceFile = await seedFile(t, "f".repeat(100));
    const textFile = await seedFile(t, "t".repeat(200));
    const audioFile = await seedFile(t, "a".repeat(50));

    await asUser(t, "owner").mutation(api.documents.createDocument, {
      notebookId,
      name: "doomed.pdf",
      type: "pdf",
      storageId: sourceFile,
      contentStorageId: textFile,
      contentLength: 200,
    });

    const keptDocumentId = await asUser(t, "owner").mutation(
      api.documents.createDocument,
      { notebookId: keptNotebookId, name: "safe.txt", type: "txt" }
    );

    await t.run(async (ctx) => {
      await ctx.db.insert("messages", {
        notebookId,
        userId,
        role: "user",
        content: "hello",
        timestamp: Date.now(),
      });
      await ctx.db.insert("audioOverviews", {
        notebookId,
        userId,
        status: "ready",
        audioStorageId: audioFile,
        createdAt: Date.now(),
      });
    });

    await asUser(t, "owner").mutation(api.notebooks.deleteNotebook, {
      notebookId,
    });

    await t.run(async (ctx) => {
      expect(await ctx.db.get(notebookId)).toBeNull();
      expect(await ctx.db.query("documents").collect()).toHaveLength(1);
      // Messages and audio overviews are only queryable by notebook, so
      // orphaning them means they can never be reached or deleted again.
      expect(await ctx.db.query("messages").collect()).toHaveLength(0);
      expect(await ctx.db.query("audioOverviews").collect()).toHaveLength(0);

      for (const id of [sourceFile, textFile, audioFile]) {
        expect(await ctx.db.system.get(id as Id<"_storage">)).toBeNull();
      }

      // The other notebook is untouched.
      expect(await ctx.db.get(keptDocumentId)).not.toBeNull();
    });

    const user = await t.run((ctx) => ctx.db.get(userId));
    expect(user?.storageBytes).toBe(0);
  });

  test("refuses someone else's notebook", async () => {
    const t = testConvex();
    const ownerId = await seedUser(t, "owner");
    await seedUser(t, "intruder");
    const notebookId = await seedNotebook(t, ownerId);

    await expect(
      asUser(t, "intruder").mutation(api.notebooks.deleteNotebook, {
        notebookId,
      })
    ).rejects.toThrow("Notebook not found");

    expect(await t.run((ctx) => ctx.db.get(notebookId))).not.toBeNull();
  });
});

describe("clearCanvasFields", () => {
  test("clears the dead canvas fields and leaves everything else", async () => {
    const t = testConvex();
    const userId = await seedUser(t, "owner");

    const stale = await t.run((ctx) =>
      ctx.db.insert("notebooks", {
        userId,
        title: "Has canvas data",
        description: "kept",
        createdAt: 1,
        updatedAt: 2,
        canvasContent: '{"doc":"..."}',
        canvasHtml: "<p>hi</p>",
        canvasLastEditedAt: 3,
      })
    );
    const clean = await seedNotebook(t, userId, "No canvas data");

    const first = await t.mutation(internal.notebooks.clearCanvasFields, {});
    expect(first).toEqual({ cleared: 1, done: true });

    const row = await t.run((ctx) => ctx.db.get(stale));
    // Absent, not null: a row carrying a field the schema no longer declares
    // fails the narrowing push, which is the whole point of this migration.
    expect(row).not.toHaveProperty("canvasContent");
    expect(row).not.toHaveProperty("canvasHtml");
    expect(row).not.toHaveProperty("canvasLastEditedAt");

    // Everything the notebook is actually for survives.
    expect(row?.title).toBe("Has canvas data");
    expect(row?.description).toBe("kept");
    expect(row?.createdAt).toBe(1);
    expect(row?.updatedAt).toBe(2);
    expect(await t.run((ctx) => ctx.db.get(clean))).not.toBeNull();
  });

  test("is safe to run twice and reports when the schema can be narrowed", async () => {
    const t = testConvex();
    const userId = await seedUser(t, "owner");
    await t.run((ctx) =>
      ctx.db.insert("notebooks", {
        userId,
        title: "Has canvas data",
        createdAt: 1,
        updatedAt: 2,
        canvasHtml: "<p>hi</p>",
      })
    );

    await t.mutation(internal.notebooks.clearCanvasFields, {});

    // The operator re-runs until this is 0; a second pass must be a no-op.
    const second = await t.mutation(internal.notebooks.clearCanvasFields, {});
    expect(second).toEqual({ cleared: 0, done: true });

    expect(await t.query(internal.notebooks.canvasFieldsRemaining, {})).toEqual(
      { remaining: 0, atLeast: false }
    );
  });
});
