/**
 * Per-account storage accounting (AUDIT.md §3.5).
 *
 * The count caps — 25 notebooks × 50 sources × 10 MB per file — bound the
 * number of things an account can own, not their size, which left a 12.5 GB
 * worst case per user across paid Convex storage and Qdrant. This is the byte
 * ceiling that closes it.
 *
 * The total lives on the `users` row and is maintained incrementally: summing
 * every document on each upload would read the whole account to write one row.
 * That means the counter can drift if a write path forgets to call these
 * helpers, so every place that creates, rewrites or deletes source content goes
 * through here — `documents.createDocument`,
 * `documents.updateDocumentContent`, and both cascade purge functions.
 *
 * ponytail: no reconciliation job. Drift shows up as an account whose quota is
 * slightly wrong, not as data loss, and a `recomputeStorageBytes` internal
 * mutation is a 10-line fix if it ever matters.
 */

import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

/**
 * Hard ceiling per account, in bytes.
 *
 * 1 GiB: comfortably more than any real notebook set (a 300-page PDF is ~5 MB)
 * and far below the 12.5 GB the count caps alone permitted. Tune it; this is a
 * cost control, not a security boundary.
 */
export const MAX_STORAGE_BYTES_PER_USER = 1_073_741_824;

/** Human-readable size for the error the user actually sees. */
function formatBytes(bytes: number): string {
  if (bytes >= 1_073_741_824) return `${(bytes / 1_073_741_824).toFixed(1)} GB`;
  if (bytes >= 1_048_576) return `${Math.round(bytes / 1_048_576)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/**
 * Size of a source: the uploaded file plus the text extracted from it.
 *
 * Both are stored and both cost money — the file sits in Convex storage and the
 * text is embedded into Qdrant — so both count. `content.length` is UTF-16 code
 * units rather than encoded bytes, which under-counts non-Latin text by up to
 * 3×; near enough for a spend ceiling, and it never over-counts into a false
 * rejection.
 *
 * URL and YouTube sources have no stored file, so they weigh their text only.
 */
export async function measureDocumentBytes(
  ctx: QueryCtx,
  args: { storageId?: string; content?: string }
): Promise<number> {
  const textBytes = args.content?.length ?? 0;

  if (!args.storageId) {
    return textBytes;
  }

  // `_storage` metadata carries the real uploaded size, so the client never
  // gets to declare how big its own file was.
  const file = await ctx.db.system.get(args.storageId as Id<"_storage">);

  return textBytes + (file?.size ?? 0);
}

/**
 * Move an account's stored-bytes total by `delta`.
 *
 * Clamped at zero: a document written before this column existed has no
 * recorded size, so deleting it subtracts nothing, and a negative total would
 * then hand that account a free allowance.
 */
export async function addStorageBytes(
  ctx: MutationCtx,
  userId: Id<"users">,
  delta: number
): Promise<void> {
  if (delta === 0) return;

  const user = await ctx.db.get(userId);
  if (!user) return;

  await ctx.db.patch(userId, {
    storageBytes: Math.max(0, (user.storageBytes ?? 0) + delta),
  });
}

/**
 * Reject a write that would push the account past its ceiling.
 *
 * `ConvexError`, so `lib/convex-error.ts` can unwrap the text into a toast the
 * user can act on rather than a generic failure.
 */
export function assertStorageHeadroom(user: Doc<"users">, delta: number): void {
  const used = user.storageBytes ?? 0;

  if (used + delta > MAX_STORAGE_BYTES_PER_USER) {
    throw new ConvexError(
      `This would exceed your ${formatBytes(MAX_STORAGE_BYTES_PER_USER)} storage limit (${formatBytes(used)} used). Delete a source to free space.`
    );
  }
}

/** Bytes recorded against a document row, 0 for rows predating the column. */
export function documentBytes(doc: Doc<"documents">): number {
  return doc.bytes ?? 0;
}
