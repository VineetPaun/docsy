/* eslint-disable @typescript-eslint/no-explicit-any */
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// Get audio overview for a notebook
export const getAudioOverview = query({
  args: { notebookId: v.id("notebooks"), clerkId: v.string() },
  handler: async (ctx: any, args: any) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q: any) => q.eq("clerkId", args.clerkId))
      .first();

    if (!user) {
      return null;
    }

    // Verify notebook belongs to user
    const notebook = await ctx.db.get(args.notebookId);
    if (!notebook || notebook.userId !== user._id) {
      return null;
    }

    // Get the latest audio overview for this notebook
    const audioOverviews = await ctx.db
      .query("audioOverviews")
      .withIndex("by_notebook", (q: any) => q.eq("notebookId", args.notebookId))
      .collect();

    // Return the most recent one
    return (
      audioOverviews.sort((a: any, b: any) => b.createdAt - a.createdAt)[0] ||
      null
    );
  },
});

// Create or update audio overview
export const createAudioOverview = mutation({
  args: {
    notebookId: v.id("notebooks"),
    clerkId: v.string(),
    status: v.string(),
    scriptText: v.optional(v.string()),
    audioStorageId: v.optional(v.string()),
    duration: v.optional(v.number()),
    errorMessage: v.optional(v.string()),
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

    // Check if there's an existing overview for this notebook
    const existingOverviews = await ctx.db
      .query("audioOverviews")
      .withIndex("by_notebook", (q: any) => q.eq("notebookId", args.notebookId))
      .collect();

    // Delete old overviews (keep only the new one)
    for (const existing of existingOverviews) {
      await ctx.db.delete(existing._id);
    }

    // Create new overview
    const overviewId = await ctx.db.insert("audioOverviews", {
      notebookId: args.notebookId,
      userId: user._id,
      status: args.status,
      scriptText: args.scriptText,
      audioStorageId: args.audioStorageId,
      duration: args.duration,
      errorMessage: args.errorMessage,
      createdAt: Date.now(),
      completedAt: args.status === "ready" ? Date.now() : undefined,
    });

    return overviewId;
  },
});

// Update audio overview status
export const updateAudioOverview = mutation({
  args: {
    overviewId: v.id("audioOverviews"),
    clerkId: v.string(),
    status: v.optional(v.string()),
    scriptText: v.optional(v.string()),
    audioStorageId: v.optional(v.string()),
    duration: v.optional(v.number()),
    errorMessage: v.optional(v.string()),
  },
  handler: async (ctx: any, args: any) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q: any) => q.eq("clerkId", args.clerkId))
      .first();

    if (!user) {
      throw new Error("User not found");
    }

    const overview = await ctx.db.get(args.overviewId);
    if (!overview || overview.userId !== user._id) {
      throw new Error("Audio overview not found");
    }

    const updates: Record<string, unknown> = {};
    if (args.status !== undefined) updates.status = args.status;
    if (args.scriptText !== undefined) updates.scriptText = args.scriptText;
    if (args.audioStorageId !== undefined)
      updates.audioStorageId = args.audioStorageId;
    if (args.duration !== undefined) updates.duration = args.duration;
    if (args.errorMessage !== undefined)
      updates.errorMessage = args.errorMessage;
    if (args.status === "ready") updates.completedAt = Date.now();

    await ctx.db.patch(args.overviewId, updates);
  },
});

// Delete audio overview
export const deleteAudioOverview = mutation({
  args: { overviewId: v.id("audioOverviews"), clerkId: v.string() },
  handler: async (ctx: any, args: any) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q: any) => q.eq("clerkId", args.clerkId))
      .first();

    if (!user) {
      throw new Error("User not found");
    }

    const overview = await ctx.db.get(args.overviewId);
    if (!overview || overview.userId !== user._id) {
      throw new Error("Audio overview not found");
    }

    await ctx.db.delete(args.overviewId);
  },
});
