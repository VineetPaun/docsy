import { assertRequiredEnv } from "@/lib/env";

/**
 * Runs once when the Next server starts, before it serves anything.
 *
 * The only job here is the environment check — a missing Clerk key should stop
 * the server with a named error rather than turning every request into a
 * confusing auth failure (AUDIT.md §10).
 */
export function register() {
  assertRequiredEnv();
}
