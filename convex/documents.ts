/* eslint-disable @typescript-eslint/no-explicit-any */
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// Get all documents in a notebook
export const getDocuments = query({
  args: { notebookId: v.id("notebooks"), clerkId: v.string() },
  handler: async (ctx: any, args: any) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q: any) => q.eq("clerkId", args.clerkId))
      .first();

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
      .withIndex("by_notebook", (q: any) => q.eq("notebookId", args.notebookId))
      .collect();

    // Sort by most recently created
    return documents.sort((a: any, b: any) => b.createdAt - a.createdAt);
  },
});

// Get a single document
export const getDocument = query({
  args: { documentId: v.id("documents"), clerkId: v.string() },
  handler: async (ctx: any, args: any) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q: any) => q.eq("clerkId", args.clerkId))
      .first();

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
    clerkId: v.string(),
    name: v.string(),
    type: v.string(),
    content: v.optional(v.string()),
    storageId: v.optional(v.string()),
    sourceType: v.optional(v.string()),
    sourceUrl: v.optional(v.string()),
    thumbnailUrl: v.optional(v.string()),
    metadata: v.optional(v.string()),
  },
  handler: async (ctx: any, args: any) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q: any) => q.eq("clerkId", args.clerkId))
      .first();

    if (!user) {
      throw new Error("User not found");
    }

    // Verify notebook belongs to user
    const notebook = await ctx.db.get(args.notebookId);
    if (!notebook || notebook.userId !== user._id) {
      throw new Error("Notebook not found");
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
    clerkId: v.string(),
    content: v.string(),
  },
  handler: async (ctx: any, args: any) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q: any) => q.eq("clerkId", args.clerkId))
      .first();

    if (!user) {
      throw new Error("User not found");
    }

    const document = await ctx.db.get(args.documentId);

    if (!document || document.userId !== user._id) {
      throw new Error("Document not found");
    }

    await ctx.db.patch(args.documentId, { content: args.content });
  },
});

// Delete a document
export const deleteDocument = mutation({
  args: { documentId: v.id("documents"), clerkId: v.string() },
  handler: async (ctx: any, args: any) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q: any) => q.eq("clerkId", args.clerkId))
      .first();

    if (!user) {
      throw new Error("User not found");
    }

    const document = await ctx.db.get(args.documentId);

    if (!document || document.userId !== user._id) {
      throw new Error("Document not found");
    }

    // Get notebook to update its timestamp
    const notebook = await ctx.db.get(document.notebookId);

    await ctx.db.delete(args.documentId);

    // Update notebook's updatedAt
    if (notebook) {
      await ctx.db.patch(document.notebookId, { updatedAt: Date.now() });
    }
  },
});

// Get document count for a notebook
export const getDocumentCount = query({
  args: { notebookId: v.id("notebooks"), clerkId: v.string() },
  handler: async (ctx: any, args: any) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q: any) => q.eq("clerkId", args.clerkId))
      .first();

    if (!user) {
      return 0;
    }

    const documents = await ctx.db
      .query("documents")
      .withIndex("by_notebook", (q: any) => q.eq("notebookId", args.notebookId))
      .collect();

    return documents.length;
  },
});

// Generate upload URL for file storage
export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx: any) => {
    return await ctx.storage.generateUploadUrl();
  },
});

// Get storage URL for a file
export const getStorageUrl = query({
  args: { storageId: v.id("_storage") },
  handler: async (ctx: any, args: any) => {
    return await ctx.storage.getUrl(args.storageId);
  },
});
