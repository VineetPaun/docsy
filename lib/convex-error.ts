import { ConvexError } from "convex/values";

/**
 * Pull a user-facing message out of an error thrown by a Convex mutation.
 *
 * Convex wraps a thrown `ConvexError` so that `error.message` reads
 * "[Request ID: …] Server Error Uncaught ConvexError: …" — accurate, and
 * useless in a toast. The payload we actually wrote is on `error.data`.
 *
 * Only `ConvexError` data is surfaced. An ordinary `Error` could carry an
 * internal detail we do not want in the UI, so it falls back to the caller's
 * generic message.
 */
export function convexErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ConvexError && typeof error.data === "string") {
    return error.data;
  }
  return fallback;
}
