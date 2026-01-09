/* eslint-disable @typescript-eslint/no-explicit-any */
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// Create or update user from Clerk
export const upsertUser = mutation({
  args: {
    clerkId: v.string(),
    email: v.string(),
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
  },
  handler: async (ctx: any, args: any) => {
    const existingUser = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q: any) => q.eq("clerkId", args.clerkId))
      .first();

    if (existingUser) {
      // Update existing user
      await ctx.db.patch(existingUser._id, {
        email: args.email,
        firstName: args.firstName,
        lastName: args.lastName,
        imageUrl: args.imageUrl,
        updatedAt: Date.now(),
      });
      return existingUser._id;
    } else {
      // Create new user
      const userId = await ctx.db.insert("users", {
        clerkId: args.clerkId,
        email: args.email,
        firstName: args.firstName,
        lastName: args.lastName,
        imageUrl: args.imageUrl,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      return userId;
    }
  },
});

// Get user by Clerk ID
export const getUserByClerkId = query({
  args: { clerkId: v.string() },
  handler: async (ctx: any, args: any) => {
    return await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q: any) => q.eq("clerkId", args.clerkId))
      .first();
  },
});

// Get current user (for authenticated requests)
export const getCurrentUser = query({
  args: { clerkId: v.string() },
  handler: async (ctx: any, args: any) => {
    return await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q: any) => q.eq("clerkId", args.clerkId))
      .first();
  },
});

// Delete user
export const deleteUser = mutation({
  args: { clerkId: v.string() },
  handler: async (ctx: any, args: any) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q: any) => q.eq("clerkId", args.clerkId))
      .first();

    if (user) {
      // Delete all user's notebooks and documents
      const notebooks = await ctx.db
        .query("notebooks")
        .withIndex("by_user", (q: any) => q.eq("userId", user._id))
        .collect();

      for (const notebook of notebooks) {
        // Delete documents in notebook
        const documents = await ctx.db
          .query("documents")
          .withIndex("by_notebook", (q: any) => q.eq("notebookId", notebook._id))
          .collect();

        for (const doc of documents) {
          await ctx.db.delete(doc._id);
        }

        await ctx.db.delete(notebook._id);
      }

      await ctx.db.delete(user._id);
    }
  },
});
