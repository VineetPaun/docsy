import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getUser, requireOwnedNotebook, requireUser } from "./lib/auth";
import { purgeNotebook } from "./lib/cascade";

// Get all notebooks for the signed-in user
export const getNotebooks = query({
  args: {},
  handler: async (ctx) => {
    const user = await getUser(ctx);
    if (!user) {
      return [];
    }

    const notebooks = await ctx.db
      .query("notebooks")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();

    // Sort by most recently updated
    return notebooks.sort((a, b) => b.updatedAt - a.updatedAt);
  },
});

// Get a single notebook
export const getNotebook = query({
  args: { notebookId: v.id("notebooks") },
  handler: async (ctx, args) => {
    const user = await getUser(ctx);
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
    title: v.string(),
    description: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);

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
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    // No canvas args: the editor was removed in 4d9decb, so nothing writes
    // canvasContent / canvasHtml any more. The schema keeps the fields as
    // optional because dropping a field whose rows still carry a value fails
    // the Convex push — that needs a data migration first (AUDIT.md §4.11).
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    await requireOwnedNotebook(ctx, user, args.notebookId);

    const updates: Record<string, unknown> = { updatedAt: Date.now() };
    if (args.title !== undefined) updates.title = args.title;
    if (args.description !== undefined) updates.description = args.description;

    await ctx.db.patch(args.notebookId, updates);
  },
});

// Delete a notebook
export const deleteNotebook = mutation({
  args: { notebookId: v.id("notebooks") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    await requireOwnedNotebook(ctx, user, args.notebookId);

    // Documents, messages, audio overviews, storage files and vectors.
    await purgeNotebook(ctx, args.notebookId);
  },
});

// Get notebook count for the signed-in user
export const getNotebookCount = query({
  args: {},
  handler: async (ctx) => {
    const user = await getUser(ctx);
    if (!user) {
      return 0;
    }

    const notebooks = await ctx.db
      .query("notebooks")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();

    return notebooks.length;
  },
});
