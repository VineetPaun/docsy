import { ConvexError, v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import { getUser, requireOwnedNotebook, requireUser } from "./lib/auth";

// Get audio overview for a notebook
export const getAudioOverview = query({
  args: { notebookId: v.id("notebooks") },
  handler: async (ctx, args) => {
    const user = await getUser(ctx);
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
      .withIndex("by_notebook", (q) => q.eq("notebookId", args.notebookId))
      .collect();

    const latest =
      audioOverviews.sort((a, b) => b.createdAt - a.createdAt)[0] || null;

    if (!latest) {
      return null;
    }

    // Resolve the storage id to a signed URL here rather than exposing another
    // query: ownership has already been established above, and the player only
    // ever needs the URL. Previously nothing read `audioStorageId` at all, so
    // audio vanished on refresh (AUDIT.md §4.2).
    return {
      ...latest,
      audioUrl: latest.audioStorageId
        ? await ctx.storage.getUrl(latest.audioStorageId as Id<"_storage">)
        : null,
    };
  },
});

// Create or update audio overview
export const createAudioOverview = mutation({
  args: {
    notebookId: v.id("notebooks"),
    status: v.string(),
    scriptText: v.optional(v.string()),
    audioStorageId: v.optional(v.string()),
    duration: v.optional(v.number()),
    errorMessage: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    await requireOwnedNotebook(ctx, user, args.notebookId);

    // Check if there's an existing overview for this notebook
    const existingOverviews = await ctx.db
      .query("audioOverviews")
      .withIndex("by_notebook", (q) => q.eq("notebookId", args.notebookId))
      .collect();

    // Delete old overviews (keep only the new one), including their audio
    // files — now that audio is actually persisted, dropping the row alone
    // would leak a paid MP3 on every regeneration.
    for (const existing of existingOverviews) {
      if (existing.audioStorageId) {
        try {
          await ctx.storage.delete(existing.audioStorageId as Id<"_storage">);
        } catch {
          // Already gone, or never a valid id — the row still must go.
        }
      }
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
    status: v.optional(v.string()),
    scriptText: v.optional(v.string()),
    audioStorageId: v.optional(v.string()),
    duration: v.optional(v.number()),
    errorMessage: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);

    const overview = await ctx.db.get(args.overviewId);
    if (!overview || overview.userId !== user._id) {
      throw new ConvexError("Audio overview not found");
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
  args: { overviewId: v.id("audioOverviews") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);

    const overview = await ctx.db.get(args.overviewId);
    if (!overview || overview.userId !== user._id) {
      throw new ConvexError("Audio overview not found");
    }

    // The MP3 goes with the row, or it is paid storage nobody can reach.
    if (overview.audioStorageId) {
      try {
        await ctx.storage.delete(overview.audioStorageId as Id<"_storage">);
      } catch {
        // Already gone.
      }
    }

    await ctx.db.delete(args.overviewId);
  },
});
