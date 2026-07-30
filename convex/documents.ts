import { ConvexError, v } from "convex/values";
import { internalAction, mutation, query } from "./_generated/server";
import {
  getUser,
  requireOwnedDocument,
  requireOwnedNotebook,
  requireUser,
} from "./lib/auth";
import { purgeDocument } from "./lib/cascade";

// Must match COLLECTION_NAME in lib/qdrant.ts.
const VECTOR_COLLECTION = "docsy_documents";

// Storage, embedding and retrieval all cost per source. Without a ceiling one
// account can drive unbounded spend on a notebook nobody reads.
const MAX_DOCUMENTS_PER_NOTEBOOK = 50;

// Get all documents in a notebook
export const getDocuments = query({
  args: { notebookId: v.id("notebooks") },
  handler: async (ctx, args) => {
    const user = await getUser(ctx);
    if (!user) {
      return [];
    }

    // Verify notebook belongs to user
    const notebook = await ctx.db.get(args.notebookId);
    if (!notebook || notebook.userId !== user._id) {
      return [];
    }

    const documents = await ctx.db
      .query("documents")
      .withIndex("by_notebook", (q) => q.eq("notebookId", args.notebookId))
      .collect();

    // Sort by most recently created
    return documents.sort((a, b) => b.createdAt - a.createdAt);
  },
});

// Get a single document
export const getDocument = query({
  args: { documentId: v.id("documents") },
  handler: async (ctx, args) => {
    const user = await getUser(ctx);
    if (!user) {
      return null;
    }

    const document = await ctx.db.get(args.documentId);

    if (!document || document.userId !== user._id) {
      return null;
    }

    return document;
  },
});

// Create a new document
export const createDocument = mutation({
  args: {
    notebookId: v.id("notebooks"),
    name: v.string(),
    type: v.string(),
    content: v.optional(v.string()),
    storageId: v.optional(v.string()),
    sourceType: v.optional(v.string()),
    sourceUrl: v.optional(v.string()),
    thumbnailUrl: v.optional(v.string()),
    metadata: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    await requireOwnedNotebook(ctx, user, args.notebookId);

    // The only cap a client cannot skip. The file-count check in the upload UI
    // is cosmetic — this mutation is a public HTTP endpoint. AUDIT.md §3.5.
    const existing = await ctx.db
      .query("documents")
      .withIndex("by_notebook", (q) => q.eq("notebookId", args.notebookId))
      .collect();

    if (existing.length >= MAX_DOCUMENTS_PER_NOTEBOOK) {
      throw new ConvexError(
        `This notebook already has ${MAX_DOCUMENTS_PER_NOTEBOOK} sources, the maximum.`
      );
    }

    const documentId = await ctx.db.insert("documents", {
      notebookId: args.notebookId,
      userId: user._id,
      name: args.name,
      type: args.type,
      content: args.content,
      storageId: args.storageId,
      sourceType: args.sourceType || "file",
      sourceUrl: args.sourceUrl,
      thumbnailUrl: args.thumbnailUrl,
      metadata: args.metadata,
      createdAt: Date.now(),
    });

    // Update notebook's updatedAt
    await ctx.db.patch(args.notebookId, { updatedAt: Date.now() });

    return documentId;
  },
});

// Update document content (after processing)
export const updateDocumentContent = mutation({
  args: {
    documentId: v.id("documents"),
    content: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    await requireOwnedDocument(ctx, user, args.documentId);

    await ctx.db.patch(args.documentId, { content: args.content });
  },
});

// Delete a document
export const deleteDocument = mutation({
  args: { documentId: v.id("documents") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const document = await requireOwnedDocument(ctx, user, args.documentId);

    const notebook = await ctx.db.get(document.notebookId);

    // Row, storage file and vectors together.
    await purgeDocument(ctx, document);

    // Update notebook's updatedAt
    if (notebook) {
      await ctx.db.patch(document.notebookId, { updatedAt: Date.now() });
    }
  },
});

// Get document count for a notebook
export const getDocumentCount = query({
  args: { notebookId: v.id("notebooks") },
  handler: async (ctx, args) => {
    const user = await getUser(ctx);
    if (!user) {
      return 0;
    }

    // This previously counted any notebook's documents without checking who
    // owned it.
    const notebook = await ctx.db.get(args.notebookId);
    if (!notebook || notebook.userId !== user._id) {
      return 0;
    }

    const documents = await ctx.db
      .query("documents")
      .withIndex("by_notebook", (q) => q.eq("notebookId", args.notebookId))
      .collect();

    return documents.length;
  },
});

// Generate upload URL for file storage
export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    // Takes no arguments, so the identity check is the only thing standing
    // between anonymous callers and unlimited writes into paid storage.
    await requireUser(ctx);

    return await ctx.storage.generateUploadUrl();
  },
});

// Get storage URL for a file
export const getStorageUrl = query({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, args) => {
    const user = await getUser(ctx);
    if (!user) {
      return null;
    }

    // A signed download URL for any storage id was previously one call away.
    // Only hand one out if the caller owns a document that references it.
    const ownDocuments = await ctx.db
      .query("documents")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();

    const owned = ownDocuments.some((doc) => doc.storageId === args.storageId);
    if (!owned) {
      return null;
    }

    return await ctx.storage.getUrl(args.storageId);
  },
});

/**
 * Delete every Qdrant vector belonging to a document or a notebook.
 *
 * Scheduled by `lib/cascade.ts` — Convex mutations have no network access, so
 * vector cleanup cannot happen inline with the row deletion (AUDIT.md §4.1).
 * Orphaned vectors still match a `notebookId` filter, which is why deleted
 * documents used to keep reappearing as chat citations.
 *
 * Plain `fetch` against Qdrant's REST API rather than `@qdrant/js-client-rest`:
 * it is one request, and the SDK is not bundled for the Convex runtime.
 *
 * It lives in this module rather than its own `cleanup.ts` because a new Convex
 * module does not exist in the committed `_generated/api.d.ts` until
 * `bunx convex dev` regenerates it, and this repo must typecheck without a
 * configured deployment.
 *
 * ⚠️ Needs its own env on the Convex deployment — Convex functions do not read
 * `.env.local`:
 *
 *   bunx convex env set QDRANT_URL https://...
 *   bunx convex env set QDRANT_API_KEY ...
 */
export const purgeVectors = internalAction({
  args: {
    documentId: v.optional(v.string()),
    notebookId: v.optional(v.string()),
  },
  handler: async (_ctx, args) => {
    const url = process.env.QDRANT_URL;

    // Throwing puts a named error in the Convex logs. Returning quietly would
    // reproduce the original bug — vectors silently surviving a delete.
    if (!url) {
      throw new Error("QDRANT_URL is not set on the Convex deployment");
    }

    // Both keys are indexed payload fields written by `storeChunks`.
    const key = args.documentId ? "documentId" : "notebookId";
    const value = args.documentId ?? args.notebookId;
    if (!value) {
      throw new Error("purgeVectors needs a documentId or a notebookId");
    }

    const apiKey = process.env.QDRANT_API_KEY;

    const response = await fetch(
      `${url.replace(/\/$/, "")}/collections/${VECTOR_COLLECTION}/points/delete?wait=true`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(apiKey ? { "api-key": apiKey } : {}),
        },
        body: JSON.stringify({
          filter: { must: [{ key, match: { value } }] },
        }),
      }
    );

    // A 404 means the collection was never created — nothing to purge, and not
    // a failure worth surfacing.
    if (!response.ok && response.status !== 404) {
      throw new Error(
        `Qdrant purge failed for ${key}=${value}: ${response.status} ${await response.text()}`
      );
    }
  },
});
