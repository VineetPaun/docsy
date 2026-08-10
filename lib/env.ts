/**
 * Startup environment check (AUDIT.md §10).
 *
 * The complaint this closes: a missing key used to surface as a confusing
 * runtime failure — every request 401ing, or a route throwing at 2am — rather
 * than as a named error when the server started.
 *
 * ponytail: a list of names and a throw, not `@t3-oss/env-nextjs` + zod. There
 * is nothing to coerce or refine here; every value is a string that is either
 * present or not. Add the schema library if a variable ever needs parsing.
 *
 * Deliberately **not** everything in `.env.example`. Two things are optional by
 * design and must stay that way:
 *
 *   • `NEXT_PUBLIC_CONVEX_URL` — `lib/mock-data.ts` exists so the dashboard
 *     renders without a Convex deployment
 *   • the feature keys (`OPENROUTER_API_KEY`, `GOOGLE_API_KEY`, `QDRANT_URL`,
 *     `ELEVENLABS_API_KEY`, `TAVILY_API_KEY` / `SERPER_API_KEY`) — the routes
 *     that need them already return a 503 naming the missing variable, which is
 *     a better error than refusing to boot
 *
 * ⚠️ The four variables on the *Convex deployment* are invisible from here —
 * Next cannot read another service's environment. `AUDIT.md` §3.1 has the
 * symptom table for those; they stay a manual pre-flight check.
 */

/** Without these, no request can be served at all. */
const REQUIRED = [
  // proxy.ts runs clerkMiddleware on every non-public route; without the pair,
  // every request fails in a way that reads as "auth is broken".
  "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
  "CLERK_SECRET_KEY",
] as const;

/**
 * Names from `REQUIRED` that are absent or blank in `env`.
 *
 * Whitespace counts as absent: a `KEY=` line in `.env.local` is a variable
 * someone meant to fill in.
 */
export function missingRequiredEnv(
  env: Record<string, string | undefined>
): string[] {
  return REQUIRED.filter((name) => !env[name]?.trim());
}

/**
 * Throw if anything required is missing, naming every one of them.
 *
 * Reports all at once rather than the first — fixing them one server restart at
 * a time is the failure mode this replaces.
 */
export function assertRequiredEnv(
  env: Record<string, string | undefined> = process.env
): void {
  const missing = missingRequiredEnv(env);
  if (missing.length === 0) return;

  throw new Error(
    `Missing required environment variable${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}. ` +
      `Copy .env.example to .env.local and fill ${missing.length > 1 ? "them" : "it"} in.`
  );
}
