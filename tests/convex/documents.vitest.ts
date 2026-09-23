/**
 * `convex/documents.ts` — the source lifecycle, as the deployment runs it.
 *
 * Every function here is a public HTTP endpoint, so the checks under test are
 * the ones a hostile caller would go at first: identity from the JWT rather
 * than an argument (CLAUDE.md trap 1), ownership on every id taken from the
 * request, the caps a client cannot skip, and the storage accounting that has
 * to stay balanced or the quota drifts until it locks an account out.
 */

import { describe, expect, test } from "vitest";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { asUser, seedFile, seedNotebook, seedUser, testConvex } from "./setup";

/** Matches `SNIPPET_CHARS` in `convex/documents.ts`. */
const SNIPPET_CHARS = 2_000;

describe("createDocument", () => {
  test("refuses an anonymous caller", async () => {
    const t = testConvex();
    const userId = await seedUser(t, "owner");
    const notebookId = await seedNotebook(t, userId);

    // No identity at all: the mutation must throw, not write silently.
    await expect(
      t.mutation(api.documents.createDocument, {
        notebookId,
        name: "a.txt",
        type: "txt",
      })
    ).rejects.toThrow("Unauthenticated");
  });

  test("refuses a signed-in caller with no users row", async () => {
    const t = testConvex();
    const ownerId = await seedUser(t, "owner");
    const notebookId = await seedNotebook(t, ownerId);

    // The exact state a missing Clerk webhook leaves every new signup in.
    await expect(
      asUser(t, "never_provisioned").mutation(api.documents.createDocument, {
        notebookId,
        name: "a.txt",
        type: "txt",
      })
    ).rejects.toThrow("User not provisioned");
  });

  test("refuses a notebook belonging to someone else", async () => {
    const t = testConvex();
    const ownerId = await seedUser(t, "owner");
    await seedUser(t, "intruder");
    const notebookId = await seedNotebook(t, ownerId);

    // This is the bug the auth rewrite closed: with a user id taken from the
    // arguments, this call succeeded.
    await expect(
      asUser(t, "intruder").mutation(api.documents.createDocument, {
        notebookId,
        name: "planted.txt",
        type: "txt",
      })
    ).rejects.toThrow("Notebook not found");

    const rows = await t.run((ctx) => ctx.db.query("documents").collect());
    expect(rows).toHaveLength(0);
  });

  test("truncates the row's text to a snippet", async () => {
    const t = testConvex();
    const userId = await seedUser(t, "owner");
    const notebookId = await seedNotebook(t, userId);

    // A caller that ignores the client-side slice still cannot push a
    // megabyte into the row — Convex caps a document at 1 MB (AUDIT.md §8).
    const documentId = await asUser(t, "owner").mutation(
      api.documents.createDocument,
      {
        notebookId,
        name: "long.txt",
        type: "txt",
        content: "x".repeat(SNIPPET_CHARS * 5),
        contentLength: SNIPPET_CHARS * 5,
      }
    );

    const row = await t.run((ctx) => ctx.db.get(documentId));
    expect(row?.content).toHaveLength(SNIPPET_CHARS);
    expect(row?.contentLength).toBe(SNIPPET_CHARS * 5);
  });

  test("counts both stored blobs against the quota", async () => {
    const t = testConvex();
    const userId = await seedUser(t, "owner");
    const notebookId = await seedNotebook(t, userId);

    const storageId = await seedFile(t, "f".repeat(300));
    const contentStorageId = await seedFile(t, "t".repeat(700));

    await asUser(t, "owner").mutation(api.documents.createDocument, {
      notebookId,
      name: "both.pdf",
      type: "pdf",
      content: "snippet",
      storageId,
      contentStorageId,
      contentLength: 700,
    });

    // The uploaded file plus the extracted text, both measured from `_storage`
    // rather than from anything the caller said. The snippet is not added on
    // top: those bytes are already inside the text blob.
    const user = await t.run((ctx) => ctx.db.get(userId));
    expect(user?.storageBytes).toBe(1_000);
  });

  test("ignores a caller's claim about its own size", async () => {
    const t = testConvex();
    const userId = await seedUser(t, "owner");
    const notebookId = await seedNotebook(t, userId);
    const storageId = await seedFile(t, "f".repeat(500));

    await asUser(t, "owner").mutation(api.documents.createDocument, {
      notebookId,
      name: "liar.pdf",
      type: "pdf",
      storageId,
      // A client-declared size is a client-declared quota (CLAUDE.md trap 5f).
      contentLength: 1,
    });

    const user = await t.run((ctx) => ctx.db.get(userId));
    expect(user?.storageBytes).toBe(500);
  });

  test("refuses a write that would exceed the storage ceiling", async () => {
    const t = testConvex();
    // One byte of headroom left.
    const userId = await seedUser(t, "owner", 1_073_741_823);
    const notebookId = await seedNotebook(t, userId);

    await expect(
      asUser(t, "owner").mutation(api.documents.createDocument, {
        notebookId,
        name: "toobig.txt",
        type: "txt",
        content: "ten chars!",
      })
    ).rejects.toThrow("storage limit");

    const user = await t.run((ctx) => ctx.db.get(userId));
    expect(user?.storageBytes).toBe(1_073_741_823);
  });

  test("refuses the 51st source in a notebook", async () => {
    const t = testConvex();
    const userId = await seedUser(t, "owner");
    const notebookId = await seedNotebook(t, userId);

    await t.run(async (ctx) => {
      for (let i = 0; i < 50; i++) {
        await ctx.db.insert("documents", {
          notebookId,
          userId,
          name: `seed-${i}.txt`,
          type: "txt",
          createdAt: Date.now(),
        });
      }
    });

    // The UI's own file-count check is cosmetic; this is the one a client
    // cannot skip.
    await expect(
      asUser(t, "owner").mutation(api.documents.createDocument, {
        notebookId,
        name: "one-too-many.txt",
        type: "txt",
      })
    ).rejects.toThrow("maximum");
  });
});

describe("getDocuments", () => {
  test("returns nothing for a notebook the caller does not own", async () => {
    const t = testConvex();
    const ownerId = await seedUser(t, "owner");
    await seedUser(t, "intruder");
    const notebookId = await seedNotebook(t, ownerId);

    await asUser(t, "owner").mutation(api.documents.createDocument, {
      notebookId,
      name: "private.txt",
      type: "txt",
      content: "secret",
    });

    // A query leaking another account's sources leaks their text with it.
    const seen = await asUser(t, "intruder").query(api.documents.getDocuments, {
      notebookId,
    });
    expect(seen).toEqual([]);

    const anonymous = await t.query(api.documents.getDocuments, { notebookId });
    expect(anonymous).toEqual([]);
  });

  test("lists newest first", async () => {
    const t = testConvex();
    const userId = await seedUser(t, "owner");
    const notebookId = await seedNotebook(t, userId);

    await t.run(async (ctx) => {
      await ctx.db.insert("documents", {
        notebookId,
        userId,
        name: "older",
        type: "txt",
        createdAt: 1,
      });
      await ctx.db.insert("documents", {
        notebookId,
        userId,
        name: "newer",
        type: "txt",
        createdAt: 2,
      });
    });

    // Ordered by the index, not sorted in JS (AUDIT.md §8) — a wrong index
    // direction is invisible until the list looks backwards.
    const rows = await asUser(t, "owner").query(api.documents.getDocuments, {
      notebookId,
    });
    expect(rows.map((r) => r.name)).toEqual(["newer", "older"]);
  });
});

describe("getContentUrl", () => {
  test("hands the text blob only to its owner", async () => {
    const t = testConvex();
    const userId = await seedUser(t, "owner");
    await seedUser(t, "intruder");
    const notebookId = await seedNotebook(t, userId);
    const contentStorageId = await seedFile(t, "the full extracted text");

    const documentId = await asUser(t, "owner").mutation(
      api.documents.createDocument,
      {
        notebookId,
        name: "big.txt",
        type: "txt",
        content: "the full ex",
        contentStorageId,
        contentLength: 23,
      }
    );

    const mine = await asUser(t, "owner").query(api.documents.getContentUrl, {
      documentId,
    });
    expect(mine).toBeTruthy();

    // Same id, different caller: the source text must not come back.
    const theirs = await asUser(t, "intruder").query(
      api.documents.getContentUrl,
      { documentId }
    );
    expect(theirs).toBeNull();
  });

  test("returns null for a row whose text is still inline", async () => {
    const t = testConvex();
    const userId = await seedUser(t, "owner");
    const notebookId = await seedNotebook(t, userId);

    // A row written before the split. Callers fall back to `content`.
    const documentId = await t.run((ctx) =>
      ctx.db.insert("documents", {
        notebookId,
        userId,
        name: "legacy.txt",
        type: "txt",
        content: "all of it, inline",
        createdAt: Date.now(),
      })
    );

    const url = await asUser(t, "owner").query(api.documents.getContentUrl, {
      documentId,
    });
    expect(url).toBeNull();
  });
});

describe("deleteDocument", () => {
  test("frees the row, both blobs and the bytes", async () => {
    const t = testConvex();
    const userId = await seedUser(t, "owner");
    const notebookId = await seedNotebook(t, userId);

    const storageId = await seedFile(t, "f".repeat(300));
    const contentStorageId = await seedFile(t, "t".repeat(700));

    const documentId = await asUser(t, "owner").mutation(
      api.documents.createDocument,
      {
        notebookId,
        name: "both.pdf",
        type: "pdf",
        storageId,
        contentStorageId,
        contentLength: 700,
      }
    );

    await asUser(t, "owner").mutation(api.documents.deleteDocument, {
      documentId,
    });

    const row = await t.run((ctx) => ctx.db.get(documentId));
    expect(row).toBeNull();

    // Leaving either blob behind means paid storage that nothing can reach.
    await t.run(async (ctx) => {
      expect(await ctx.db.system.get(storageId as Id<"_storage">)).toBeNull();
      expect(
        await ctx.db.system.get(contentStorageId as Id<"_storage">)
      ).toBeNull();
    });

    // Deleting has to buy headroom back, or the quota only ever climbs.
    const user = await t.run((ctx) => ctx.db.get(userId));
    expect(user?.storageBytes).toBe(0);
  });

  test("refuses another user's document", async () => {
    const t = testConvex();
    const ownerId = await seedUser(t, "owner");
    await seedUser(t, "intruder");
    const notebookId = await seedNotebook(t, ownerId);

    const documentId = await asUser(t, "owner").mutation(
      api.documents.createDocument,
      { notebookId, name: "mine.txt", type: "txt", content: "hello" }
    );

    await expect(
      asUser(t, "intruder").mutation(api.documents.deleteDocument, {
        documentId,
      })
    ).rejects.toThrow("Document not found");

    expect(await t.run((ctx) => ctx.db.get(documentId))).not.toBeNull();
  });
});

describe("renameDocument", () => {
  test("trims, caps and refuses an empty name", async () => {
    const t = testConvex();
    const userId = await seedUser(t, "owner");
    const notebookId = await seedNotebook(t, userId);
    const documentId = await asUser(t, "owner").mutation(
      api.documents.createDocument,
      { notebookId, name: "scan_0043.pdf", type: "pdf", content: "hello" }
    );

    const caller = asUser(t, "owner");

    await caller.mutation(api.documents.renameDocument, {
      documentId,
      name: "  Quarterly report  ",
    });
    expect((await t.run((ctx) => ctx.db.get(documentId)))?.name).toBe(
      "Quarterly report"
    );

    // Unbounded here would mean an unbounded string listed in the UI and sent
    // to the model on every request.
    await caller.mutation(api.documents.renameDocument, {
      documentId,
      name: "n".repeat(500),
    });
    expect((await t.run((ctx) => ctx.db.get(documentId)))?.name).toHaveLength(
      200
    );

    await expect(
      caller.mutation(api.documents.renameDocument, {
        documentId,
        name: "   ",
      })
    ).rejects.toThrow("A source needs a name");
  });
});
