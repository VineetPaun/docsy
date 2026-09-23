/**
 * Shared harness for the Convex function tests.
 *
 * `convex-test` runs the real registered functions against an in-memory
 * database built from the real schema, so the argument validators, the indexes
 * and `ctx.auth` all behave as they do on the deployment.
 *
 * The one thing it cannot do for us is provision a user: `convex/http.ts` is
 * the only writer of `users` rows, and it runs off a Svix-verified Clerk
 * webhook. Tests insert the row directly instead, which is also what makes the
 * "signed in but not provisioned" case testable.
 */

import { convexTest } from "convex-test";
import schema from "../../convex/schema";
import type { Id } from "../../convex/_generated/dataModel";

/**
 * Every module in `convex/`, as Vite's glob.
 *
 * convex-test needs the module graph to resolve `api.*`; without this it can
 * only find functions it was handed explicitly.
 */
const modules = import.meta.glob("../../convex/**/*.ts");

export type TestConvex = ReturnType<typeof convexTest>;

export function testConvex(): TestConvex {
  return convexTest(schema, modules);
}

/** A signed-in caller. The subject is what `getUser` matches on `clerkId`. */
export const asUser = (t: TestConvex, clerkId: string) =>
  t.withIdentity({ subject: clerkId });

/**
 * Insert a `users` row the way the Clerk webhook would.
 *
 * @returns the Convex id, which is what every other row references.
 */
export async function seedUser(
  t: TestConvex,
  clerkId: string,
  storageBytes = 0
): Promise<Id<"users">> {
  return t.run(async (ctx) =>
    ctx.db.insert("users", {
      clerkId,
      email: `${clerkId}@example.test`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      storageBytes,
    })
  );
}

/** A notebook owned by `userId`, inserted without going through a mutation. */
export async function seedNotebook(
  t: TestConvex,
  userId: Id<"users">,
  title = "Notebook"
): Promise<Id<"notebooks">> {
  return t.run(async (ctx) =>
    ctx.db.insert("notebooks", {
      userId,
      title,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })
  );
}

/** Store a blob and return its id, for the paths that take a `storageId`. */
export async function seedFile(t: TestConvex, body: string): Promise<string> {
  return t.run(async (ctx) => {
    const id = await ctx.storage.store(new Blob([body]));
    return id as string;
  });
}
