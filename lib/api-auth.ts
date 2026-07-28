/**
 * Shared authentication guard for Next.js API route handlers.
 *
 * `proxy.ts` already blocks unauthenticated requests at the edge, but every
 * handler calls this too: middleware matchers are easy to mis-edit, and a
 * route that authenticates itself cannot be silently exposed by a config
 * change. See AUDIT.md §3.2.
 */

import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

/**
 * Discriminated union so callers get `userId: string` narrowed automatically
 * after the `errorResponse` early-return.
 */
export type ApiAuthResult =
  | { userId: string; errorResponse: null }
  | { userId: null; errorResponse: NextResponse };

/**
 * Resolve the Clerk session for the current request.
 *
 * Usage in a route handler:
 *
 * ```ts
 * const { userId, errorResponse } = await requireApiAuth();
 * if (errorResponse) return errorResponse;
 * ```
 *
 * @returns the Clerk user id, or a ready-to-return 401 response.
 */
export async function requireApiAuth(): Promise<ApiAuthResult> {
  const { userId } = await auth();

  if (!userId) {
    return {
      userId: null,
      errorResponse: NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      ),
    };
  }

  return { userId, errorResponse: null };
}
