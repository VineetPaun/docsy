/**
 * Next.js 16 middleware (renamed from `middleware.ts` to `proxy.ts`).
 *
 * Previously this called bare `clerkMiddleware()`, which makes auth
 * *available* but protects nothing — every page and all 9 API routes were
 * reachable anonymously. See AUDIT.md §3.2.
 *
 * Everything is now protected by default; only the routes in `isPublicRoute`
 * are open. API routes get a JSON 401 instead of a sign-in redirect so that
 * `fetch()` callers see a usable error.
 */

import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

// Marketing page + the Clerk auth flow. Everything else requires a session.
const isPublicRoute = createRouteMatcher([
  "/",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/forgot-password(.*)",
  "/reset-password(.*)",
  "/sso-callback(.*)",
]);

const isApiRoute = createRouteMatcher(["/api/(.*)"]);

export default clerkMiddleware(async (auth, req) => {
  if (isPublicRoute(req)) return;

  // API routes: answer with 401 JSON rather than redirecting to sign-in.
  if (isApiRoute(req)) {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return;
  }

  // Pages: redirect to sign-in.
  await auth.protect();
});

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
  ],
};
