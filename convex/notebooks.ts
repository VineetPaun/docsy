import { ConvexError, v } from "convex/values";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import { getUser, requireOwnedNotebook, requireUser } from "./lib/auth";
import { purgeNotebook } from "./lib/cascade";

// Documents cap at 50 per notebook (documents.ts), which bounds one notebook
// and nothing else: unlimited notebooks × 50 sources is still unbounded paid
// storage, embeddings and retrieval. AUDIT.md §3.5.
//
// ponytail: a count cap, not a summed-bytes quota. Bytes need a schema column
// maintained on every upload and delete; add that if an account ever gets close
// enough to this ceiling for the difference to cost real money.
const MAX_NOTEBOOKS_PER_USER = 25;

// Get all notebooks for the signed-in user
export const getNotebooks = query({
  args: {},
  handler: async (ctx) => {
    const user = await getUser(ctx);
    if (!user) {
      return [];
    }

    // Ordered by the index, not collected and sorted in JS (AUDIT.md §8).
    return await ctx.db
      .query("notebooks")
      .withIndex("by_user_updated", (q) => q.eq("userId", user._id))
      .order("desc")
      .collect();
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

    // Enforced here rather than in the UI: this mutation is a public HTTP
    // endpoint, so a client-side check is decoration.
    const existing = await ctx.db
      .query("notebooks")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .take(MAX_NOTEBOOKS_PER_USER);

    if (existing.length >= MAX_NOTEBOOKS_PER_USER) {
      throw new ConvexError(
        `You already have ${MAX_NOTEBOOKS_PER_USER} notebooks, the maximum. Delete one to create another.`
      );
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
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    // No canvas args: the editor was removed in 4d9decb, so nothing writes
    // canvasContent / canvasHtml any more. The schema still declares them
    // because a row that carries a field the schema has dropped fails the
    // push — see clearCanvasFields at the bottom of this file, which is the
    // migrate step of getting rid of them.
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

/**
 * Step 2 of dropping the dead canvas fields: clear them from every row.
 *
 * The canvas editor was removed in `4d9decb`. Nothing has written
 * `canvasContent` / `canvasHtml` / `canvasLastEditedAt` since, but they cannot
 * simply be deleted from the schema: Convex validates the rows at rest against
 * the new schema on push, and a row still carrying a field the schema no
 * longer declares fails the whole push. Widen, migrate, narrow — and the
 * schema was already wide, so this is the migrate step.
 *
 * `internalMutation`, so no browser can reach it. Run it from the CLI:
 *
 *   bunx convex run notebooks:clearCanvasFields
 *
 * Re-run until it reports `cleared: 0`, then delete the three fields from
 * `convex/schema.ts` and push. Delete this function once that push lands.
 *
 * ponytail: a bounded batch, not `@convex-dev/migrations`. A whole component
 * to drop three fields off a table capped at 25 rows per account is more
 * moving parts than the problem has. The ceiling is that the scan reads the
 * `notebooks` table looking for matches, so this stops being the right tool
 * somewhere in the tens of thousands of rows — use the component then.
 */
const CANVAS_BATCH = 200;

export const clearCanvasFields = internalMutation({
  args: {},
  handler: async (ctx) => {
    // `filter`, not an index: there is no index on a field that is about to
    // stop existing, and adding one to delete it is backwards.
    const dirty = await ctx.db
      .query("notebooks")
      .filter((q) =>
        q.or(
          q.neq(q.field("canvasContent"), undefined),
          q.neq(q.field("canvasHtml"), undefined),
          q.neq(q.field("canvasLastEditedAt"), undefined)
        )
      )
      .take(CANVAS_BATCH);

    for (const notebook of dirty) {
      // `undefined` removes the field rather than storing a null.
      await ctx.db.patch(notebook._id, {
        canvasContent: undefined,
        canvasHtml: undefined,
        canvasLastEditedAt: undefined,
      });
    }

    return {
      cleared: dirty.length,
      // A full batch means there may be more; run it again.
      done: dirty.length < CANVAS_BATCH,
    };
  },
});

/**
 * Is it safe to drop the canvas fields from the schema yet?
 *
 *   bunx convex run notebooks:canvasFieldsRemaining
 *
 * `{ remaining: 0 }` means the narrowing push will validate. Anything else
 * means run `clearCanvasFields` again first.
 */
export const canvasFieldsRemaining = internalQuery({
  args: {},
  handler: async (ctx) => {
    const dirty = await ctx.db
      .query("notebooks")
      .filter((q) =>
        q.or(
          q.neq(q.field("canvasContent"), undefined),
          q.neq(q.field("canvasHtml"), undefined),
          q.neq(q.field("canvasLastEditedAt"), undefined)
        )
      )
      .take(CANVAS_BATCH);

    return { remaining: dirty.length, atLeast: dirty.length === CANVAS_BATCH };
  },
});
