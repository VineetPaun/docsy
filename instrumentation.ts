import { assertRequiredEnv } from "@/lib/env";
import * as Sentry from "@sentry/nextjs";

/**
 * Runs once when the Next server starts, before it serves anything.
 *
 * Two jobs: the environment check — a missing Clerk key should stop the server
 * with a named error rather than turning every request into a confusing auth
 * failure — and error tracking, which this app had none of (AUDIT.md §10).
 *
 * Sentry stays inert without `SENTRY_DSN`, so local development and anyone
 * running this without an account are unaffected. `withSentryConfig` is
 * deliberately not wrapped around `next.config.ts`: it exists for source-map
 * upload and ad-blocker tunnelling, both of which need an org, a project and an
 * auth token. Add it when there is a real Sentry project to upload to.
 */
export function register() {
  assertRequiredEnv();

  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;

  Sentry.init({
    dsn,
    // Errors are the point here. Traces are a separate cost decision, and
    // Helicone already covers LLM latency (lib/openrouter.ts).
    tracesSampleRate: 0,
    environment: process.env.NODE_ENV,
    // Source text and questions travel through this app; never let the SDK
    // attach request bodies, cookies or headers to an event.
    sendDefaultPii: false,
  });
}

/**
 * Next calls this for every uncaught error in a route handler, server component
 * or middleware — the failures that previously reached nobody, because the
 * handlers deliberately return generic messages and log nothing (§6.5).
 */
export const onRequestError = Sentry.captureRequestError;
