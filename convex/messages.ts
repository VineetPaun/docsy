/* eslint-disable @typescript-eslint/no-explicit-any */
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// Get all messages for a notebook
export const getMessages = query({
  args: { notebookId: v.id("notebooks"), clerkId: v.string() },
  handler: async (ctx: any, args: any) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q: any) => q.eq("clerkId", args.clerkId))
      .first();

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
      .withIndex("by_notebook", (q: any) => q.eq("notebookId", args.notebookId))
      .collect();

    // Sort by timestamp ascending (oldest first)
    return messages.sort((a: any, b: any) => a.timestamp - b.timestamp);
  },
});

// Add a new message
export const addMessage = mutation({
  args: {
    notebookId: v.id("notebooks"),
    clerkId: v.string(),
    role: v.string(),
    content: v.string(),
    timestamp: v.number(),
    sources: v.optional(v.array(v.string())),
    citations: v.optional(v.string()),
  },
  handler: async (ctx: any, args: any) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q: any) => q.eq("clerkId", args.clerkId))
      .first();

    if (!user) {
      throw new Error("User not found");
    }

    // Verify user owns this notebook
    const notebook = await ctx.db.get(args.notebookId);
    if (!notebook || notebook.userId !== user._id) {
      throw new Error("Notebook not found");
    }

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
  args: { notebookId: v.id("notebooks"), clerkId: v.string() },
  handler: async (ctx: any, args: any) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q: any) => q.eq("clerkId", args.clerkId))
      .first();

    if (!user) {
      throw new Error("User not found");
    }

    // Verify user owns this notebook
    const notebook = await ctx.db.get(args.notebookId);
    if (!notebook || notebook.userId !== user._id) {
      throw new Error("Notebook not found");
    }

    const messages = await ctx.db
      .query("messages")
      .withIndex("by_notebook", (q: any) => q.eq("notebookId", args.notebookId))
      .collect();

    for (const message of messages) {
      await ctx.db.delete(message._id);
    }
  },
});
