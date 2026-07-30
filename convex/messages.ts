import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getUser, requireOwnedNotebook, requireUser } from "./lib/auth";

// Get all messages for a notebook
export const getMessages = query({
  args: { notebookId: v.id("notebooks") },
  handler: async (ctx, args) => {
    const user = await getUser(ctx);
    if (!user) {
      return [];
    }

    // Verify user owns this notebook
    const notebook = await ctx.db.get(args.notebookId);
    if (!notebook || notebook.userId !== user._id) {
      return [];
    }

    const messages = await ctx.db
      .query("messages")
      .withIndex("by_notebook", (q) => q.eq("notebookId", args.notebookId))
      .collect();

    // Sort by timestamp ascending (oldest first)
    return messages.sort((a, b) => a.timestamp - b.timestamp);
  },
});

// Add a new message
export const addMessage = mutation({
  args: {
    notebookId: v.id("notebooks"),
    role: v.string(),
    content: v.string(),
    timestamp: v.number(),
    sources: v.optional(v.array(v.string())),
    citations: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    await requireOwnedNotebook(ctx, user, args.notebookId);

    const messageId = await ctx.db.insert("messages", {
      notebookId: args.notebookId,
      userId: user._id,
      role: args.role,
      content: args.content,
      timestamp: args.timestamp,
      sources: args.sources,
      citations: args.citations,
    });

    return messageId;
  },
});

// Clear all messages in a notebook
export const clearMessages = mutation({
  args: { notebookId: v.id("notebooks") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    await requireOwnedNotebook(ctx, user, args.notebookId);

    const messages = await ctx.db
      .query("messages")
      .withIndex("by_notebook", (q) => q.eq("notebookId", args.notebookId))
      .collect();

    for (const message of messages) {
      await ctx.db.delete(message._id);
    }
  },
});
