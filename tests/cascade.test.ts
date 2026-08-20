/**
 * Cascade deletion (AUDIT.md §4.1, §10).
 *
 * Convex functions themselves need `convex-test`, which is vitest-only — this
 * repo runs `bun test` with no runner config and adding a second runner for one
 * file is not worth it. What *is* testable is the logic those functions
 * delegate to, and `convex/lib/cascade.ts` is the piece that matters: it is the
 * single path by which rows, files, vectors and the storage quota are freed, and
 * everything it forgets is orphaned silently.
 *
 * The context is a hand-rolled double shaped like Convex's `MutationCtx`.
 *
 * Run: `bun test`
 */

import { expect, test } from "bun:test";
import { purgeDocument, purgeNotebook } from "../convex/lib/cascade";

interface Tables {
  documents: Record<string, unknown>[];
  audioOverviews: Record<string, unknown>[];
  messages: Record<string, unknown>[];
}

/** Records everything a purge did, so the assertions can read it back. */
function fakeCtx(tables: Partial<Tables> = {}, storageBytes = 10_000) {
  const rows: Tables = {
    documents: tables.documents ?? [],
    audioOverviews: tables.audioOverviews ?? [],
    messages: tables.messages ?? [],
  };

  const deleted: string[] = [];
  const filesDeleted: string[] = [];
  const scheduled: { args: Record<string, unknown> }[] = [];
  const user = { _id: "user1", storageBytes };

  const ctx = {
    db: {
      get: async (id: string) => (id === "user1" ? user : null),
      patch: async (id: string, patch: Record<string, unknown>) => {
        if (id === "user1") Object.assign(user, patch);
      },
      delete: async (id: string) => {
        deleted.push(id);
      },
      query: (table: keyof Tables) => ({
        withIndex: () => ({
          collect: async () => rows[table],
        }),
      }),
    },
    storage: {
      delete: async (id: string) => {
        filesDeleted.push(id);
      },
    },
    scheduler: {
      runAfter: async (
        _delay: number,
        _fn: unknown,
        args: Record<string, unknown>
      ) => {
        scheduled.push({ args });
      },
    },
  };

  return { ctx, deleted, filesDeleted, scheduled, user };
}

const doc = (overrides: Record<string, unknown> = {}) => ({
  _id: "doc1",
  userId: "user1",
  notebookId: "nb1",
  storageId: "file1",
  bytes: 4_000,
  ...overrides,
});

test("deleting a document frees its row, its file, its vectors and its bytes", async () => {
  const { ctx, deleted, filesDeleted, scheduled, user } = fakeCtx();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await purgeDocument(ctx as any, doc() as any);

  expect(filesDeleted).toEqual(["file1"]);
  expect(deleted).toEqual(["doc1"]);
  expect(scheduled[0].args).toEqual({ documentId: "doc1" });
  // The quota has to come back down, or deleting never buys headroom.
  expect(user.storageBytes).toBe(6_000);
});

test("a document with no recorded size does not hand back free storage", async () => {
  // Rows written before `bytes` existed subtract nothing, and the clamp stops
  // the total going negative.
  const { ctx, user } = fakeCtx({}, 1_000);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await purgeDocument(ctx as any, doc({ bytes: undefined }) as any);

  expect(user.storageBytes).toBe(1_000);
});

test("a source with no stored file still deletes cleanly", async () => {
  // URL and YouTube sources have no storage id; an unguarded delete would throw
  // and roll back the whole mutation, making the row undeletable.
  const { ctx, deleted, filesDeleted } = fakeCtx();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await purgeDocument(ctx as any, doc({ storageId: undefined }) as any);

  expect(filesDeleted).toEqual([]);
  expect(deleted).toEqual(["doc1"]);
});

test("deleting a notebook takes its documents, audio, messages and vectors", async () => {
  const { ctx, deleted, filesDeleted, scheduled, user } = fakeCtx({
    documents: [doc(), doc({ _id: "doc2", storageId: "file2", bytes: 1_000 })],
    audioOverviews: [{ _id: "audio1", audioStorageId: "mp3" }],
    messages: [{ _id: "msg1" }, { _id: "msg2" }],
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await purgeNotebook(ctx as any, "nb1" as any);

  // Messages and audio overviews are only reachable by notebook, so anything
  // missed here is unreachable forever.
  expect(deleted).toEqual([
    "doc1",
    "doc2",
    "audio1",
    "msg1",
    "msg2",
    "nb1",
  ]);
  expect(filesDeleted).toEqual(["file1", "file2", "mp3"]);

  // One filter delete for the notebook, not one per document.
  expect(scheduled).toHaveLength(1);
  expect(scheduled[0].args).toEqual({ notebookId: "nb1" });

  expect(user.storageBytes).toBe(5_000);
});
