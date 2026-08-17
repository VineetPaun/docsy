import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getUser, requireOwnedNotebook, requireUser } from "./lib/auth";

/**
 * How much transcript one query returns, newest-first off the index.
 *
 * Chat history is the fastest-growing table in the schema and this query is
 * reactive, so re-reading the whole thing on every new message was the read
 * amplification AUDIT.md §8 called out.
 *
 * ponytail: a flat ceiling, not pagination. A notebook past 200 messages shows
 * its most recent 200; `usePaginatedQuery` is the upgrade if anyone scrolls back
 * that far in practice.
 */
const MAX_TRANSCRIPT_MESSAGES = 200;

// Get the most recent messages for a notebook, oldest first
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

    // Newest first so the index does the limiting, then reversed for display:
    // taking the *oldest* 200 would pin a long conversation to its opening.
    const recent = await ctx.db
      .query("messages")
      .withIndex("by_notebook_time", (q) =>
        q.eq("notebookId", args.notebookId)
      )
      .order("desc")
      .take(MAX_TRANSCRIPT_MESSAGES);

    return recent.reverse();
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
