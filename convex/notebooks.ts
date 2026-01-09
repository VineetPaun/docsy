/* eslint-disable @typescript-eslint/no-explicit-any */
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// Get all notebooks for a user
export const getNotebooks = query({
  args: { clerkId: v.string() },
  handler: async (ctx: any, args: any) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q: any) => q.eq("clerkId", args.clerkId))
      .first();

    if (!user) {
      return [];
    }

    const notebooks = await ctx.db
      .query("notebooks")
      .withIndex("by_user", (q: any) => q.eq("userId", user._id))
      .collect();

    // Sort by most recently updated
    return notebooks.sort((a: any, b: any) => b.updatedAt - a.updatedAt);
  },
});

// Get a single notebook
export const getNotebook = query({
  args: { notebookId: v.id("notebooks"), clerkId: v.string() },
  handler: async (ctx: any, args: any) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q: any) => q.eq("clerkId", args.clerkId))
      .first();

    if (!user) {
      return null;
    }

    const notebook = await ctx.db.get(args.notebookId);

    if (!notebook || notebook.userId !== user._id) {
      return null;
    }

    return notebook;
  },
});

// Create a new notebook
export const createNotebook = mutation({
  args: {
    clerkId: v.string(),
    title: v.string(),
    description: v.optional(v.string()),
  },
  handler: async (ctx: any, args: any) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q: any) => q.eq("clerkId", args.clerkId))
      .first();

    if (!user) {
      throw new Error("User not found");
    }

    const notebookId = await ctx.db.insert("notebooks", {
      userId: user._id,
      title: args.title,
      description: args.description,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    return notebookId;
  },
});

// Update a notebook
export const updateNotebook = mutation({
  args: {
    notebookId: v.id("notebooks"),
    clerkId: v.string(),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
  },
  handler: async (ctx: any, args: any) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q: any) => q.eq("clerkId", args.clerkId))
      .first();

    if (!user) {
      throw new Error("User not found");
    }

    const notebook = await ctx.db.get(args.notebookId);

    if (!notebook || notebook.userId !== user._id) {
      throw new Error("Notebook not found");
    }

    const updates: Record<string, unknown> = { updatedAt: Date.now() };
    if (args.title !== undefined) updates.title = args.title;
    if (args.description !== undefined) updates.description = args.description;

    await ctx.db.patch(args.notebookId, updates);
  },
});

// Delete a notebook
export const deleteNotebook = mutation({
  args: { notebookId: v.id("notebooks"), clerkId: v.string() },
  handler: async (ctx: any, args: any) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q: any) => q.eq("clerkId", args.clerkId))
      .first();

    if (!user) {
      throw new Error("User not found");
    }

    const notebook = await ctx.db.get(args.notebookId);

    if (!notebook || notebook.userId !== user._id) {
      throw new Error("Notebook not found");
    }

    // Delete all documents in notebook
    const documents = await ctx.db
      .query("documents")
      .withIndex("by_notebook", (q: any) => q.eq("notebookId", args.notebookId))
      .collect();

    for (const doc of documents) {
      await ctx.db.delete(doc._id);
    }

    await ctx.db.delete(args.notebookId);
  },
});

// Get notebook count for a user
export const getNotebookCount = query({
  args: { clerkId: v.string() },
  handler: async (ctx: any, args: any) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q: any) => q.eq("clerkId", args.clerkId))
      .first();

    if (!user) {
      return 0;
    }

    const notebooks = await ctx.db
      .query("notebooks")
      .withIndex("by_user", (q: any) => q.eq("userId", user._id))
      .collect();

    return notebooks.length;
  },
});
