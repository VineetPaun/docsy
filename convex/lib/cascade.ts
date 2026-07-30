/**
 * Complete, server-side cascade deletion (AUDIT.md §4.1).
 *
 * Data lives in three systems that do not stay consistent on their own:
 * Convex rows, Convex file storage, and Qdrant vectors. Every delete path
 * routes through here so none of them can forget one — `deleteDocument`,
 * `deleteNotebook` and the `user.deleted` webhook all called their own partial
 * version before, and each forgot something different.
 *
 * Vector deletion cannot happen inline: Convex mutations have no network
 * access. It is scheduled as `internal.documents.purgeVectors` instead, which
 * runs in the same transaction's commit path — if the mutation rolls back, the
 * purge is never scheduled.
 */

import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

/**
 * Delete a stored file, tolerating one that is already gone.
 *
 * `storageId` is typed `v.string()` in the schema rather than
 * `v.id("_storage")`, so a stale or malformed value is possible. Left
 * unguarded it would throw and roll the whole mutation back, making the row
 * permanently undeletable — the opposite of the leak this fixes.
 */
async function deleteFileIfPresent(ctx: MutationCtx, storageId?: string) {
  if (!storageId) return;

  try {
    await ctx.storage.delete(storageId as Id<"_storage">);
  } catch {
    // Already deleted, or never a valid id. Either way there is nothing left
    // to leak and the row deletion should still proceed.
  }
}

/**
 * Delete one document: its storage file, its row, and its vectors.
 *
 * Use this for a single-document delete. When clearing a whole notebook,
 * `purgeNotebook` issues one vector delete for the notebook instead of one per
 * document.
 */
export async function purgeDocument(ctx: MutationCtx, doc: Doc<"documents">) {
  await deleteFileIfPresent(ctx, doc.storageId);
  await ctx.db.delete(doc._id);

  await ctx.scheduler.runAfter(0, internal.documents.purgeVectors, {
    documentId: doc._id,
  });
}

/**
 * Delete everything belonging to a notebook, including the notebook row.
 *
 * Covers documents, messages and audio overviews — messages and
 * audioOverviews were previously orphaned by every notebook delete, with no
 * way to reach them afterwards since both are only queryable by notebook.
 */
export async function purgeNotebook(
  ctx: MutationCtx,
  notebookId: Id<"notebooks">
) {
  const documents = await ctx.db
    .query("documents")
    .withIndex("by_notebook", (q) => q.eq("notebookId", notebookId))
    .collect();

  for (const doc of documents) {
    await deleteFileIfPresent(ctx, doc.storageId);
    await ctx.db.delete(doc._id);
  }

  const audioOverviews = await ctx.db
    .query("audioOverviews")
    .withIndex("by_notebook", (q) => q.eq("notebookId", notebookId))
    .collect();

  for (const overview of audioOverviews) {
    await deleteFileIfPresent(ctx, overview.audioStorageId);
    await ctx.db.delete(overview._id);
  }

  const messages = await ctx.db
    .query("messages")
    .withIndex("by_notebook", (q) => q.eq("notebookId", notebookId))
    .collect();

  for (const message of messages) {
    await ctx.db.delete(message._id);
  }

  await ctx.db.delete(notebookId);

  // One filter delete for the whole notebook rather than one per document.
  await ctx.scheduler.runAfter(0, internal.documents.purgeVectors, {
    notebookId,
  });
}
