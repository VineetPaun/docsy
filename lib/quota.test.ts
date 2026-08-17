/**
 * Per-account storage quota (AUDIT.md §3.5).
 *
 * The ceiling is a spend control, and it is maintained incrementally rather
 * than recomputed, so the sizing and the boundary get a test: an off-by-one the
 * wrong way either locks a paying account out or hands it unlimited storage.
 *
 * Run: `bun test`
 */

import { expect, test } from "bun:test";
import type { Doc } from "../convex/_generated/dataModel";
import {
  MAX_STORAGE_BYTES_PER_USER,
  assertStorageHeadroom,
  documentBytes,
  measureDocumentBytes,
} from "../convex/lib/quota";

/** Only the fields the quota reads; the rest of the row is irrelevant here. */
const userWith = (storageBytes?: number) =>
  ({ storageBytes } as unknown as Doc<"users">);

/** Stands in for `ctx.db.system.get`, which returns `_storage` metadata. */
const ctxWithFileSize = (size: number | null) =>
  ({
    db: {
      system: {
        get: async () => (size === null ? null : { size }),
      },
    },
  }) as unknown as Parameters<typeof measureDocumentBytes>[0];

test("a source weighs its stored file plus its extracted text", async () => {
  const bytes = await measureDocumentBytes(ctxWithFileSize(1000), {
    storageId: "kg2abc",
    content: "x".repeat(24),
  });

  expect(bytes).toBe(1024);
});

test("a URL source with no stored file weighs only its text", async () => {
  const bytes = await measureDocumentBytes(ctxWithFileSize(999), {
    content: "x".repeat(50),
  });

  expect(bytes).toBe(50);
});

test("missing storage metadata does not make the source free-standing", async () => {
  // A stale storageId must not throw — it would make the source unstorable.
  const bytes = await measureDocumentBytes(ctxWithFileSize(null), {
    storageId: "gone",
    content: "abc",
  });

  expect(bytes).toBe(3);
});

test("an upload that exactly fills the quota is allowed", () => {
  expect(() =>
    assertStorageHeadroom(userWith(0), MAX_STORAGE_BYTES_PER_USER)
  ).not.toThrow();
});

test("one byte past the quota is refused", () => {
  expect(() =>
    assertStorageHeadroom(userWith(1), MAX_STORAGE_BYTES_PER_USER)
  ).toThrow(/storage limit/);
});

test("an account predating the column starts from zero, not NaN", () => {
  expect(() => assertStorageHeadroom(userWith(undefined), 1)).not.toThrow();
  expect(documentBytes({} as Doc<"documents">)).toBe(0);
});
