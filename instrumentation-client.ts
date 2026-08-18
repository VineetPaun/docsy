import * as Sentry from "@sentry/nextjs";

/**
 * Browser-side error tracking (AUDIT.md §10).
 *
 * Inert without `NEXT_PUBLIC_SENTRY_DSN`. A separate DSN variable from the
 * server's on purpose: this one is compiled into the client bundle and is
 * public, so it must be a deliberate choice rather than a server secret leaking
 * into the browser by sharing a name.
 */
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: 0,
    // No session replay and no PII: this app's UI is full of the user's own
    // documents, and a replay would ship them to a third party.
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    sendDefaultPii: false,
  });
}
