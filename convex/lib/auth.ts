import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

// Every Convex function is a public HTTP endpoint. The caller's identity must
// therefore come from the verified JWT (`ctx.auth`), never from an argument —
// a client-supplied user id lets any caller act as any user.

type Ctx = QueryCtx | MutationCtx;

/**
 * Resolve the signed-in user, or null when the request is anonymous or the
 * `users` row has not been provisioned yet.
 *
 * Use this in queries: a read that returns nothing is the correct answer for
 * a caller with no data, and it avoids error flashes while Clerk is still
 * hydrating on first paint.
 */
export async function getUser(ctx: Ctx): Promise<Doc<"users"> | null> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;

  return await ctx.db
    .query("users")
    .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
    .first();
}

/**
 * Resolve the signed-in user or throw.
 *
 * Use this in mutations: a write by an unidentified caller must fail loudly,
 * never be silently dropped.
 */
export async function requireUser(ctx: Ctx): Promise<Doc<"users">> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new ConvexError("Unauthenticated");
  }

  const user = await ctx.db
    .query("users")
    .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
    .first();

  if (!user) {
    throw new ConvexError("User not provisioned");
  }

  return user;
}

/**
 * Resolve a notebook the caller owns, or throw. Pass the user you already
 * loaded so a single request does not look it up twice.
 */
export async function requireOwnedNotebook(
  ctx: Ctx,
  user: Doc<"users">,
  notebookId: Id<"notebooks">
): Promise<Doc<"notebooks">> {
  const notebook = await ctx.db.get(notebookId);

  // Deliberately the same error for "absent" and "someone else's" — telling
  // the caller which one it was leaks whether the id exists.
  if (!notebook || notebook.userId !== user._id) {
    throw new ConvexError("Notebook not found");
  }

  return notebook;
}

/** Resolve a document the caller owns, or throw. */
export async function requireOwnedDocument(
  ctx: Ctx,
  user: Doc<"users">,
  documentId: Id<"documents">
): Promise<Doc<"documents">> {
  const document = await ctx.db.get(documentId);

  if (!document || document.userId !== user._id) {
    throw new ConvexError("Document not found");
  }

  return document;
}
