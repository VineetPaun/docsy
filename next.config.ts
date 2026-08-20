import { withSentryConfig } from "@sentry/nextjs";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // TypeScript 7 ships only the native compiler — no `lib/typescript.js` API —
    // so Next has to type-check by spawning the `tsc` CLI. Without this the build
    // throws "TypeScript 7.0.2 does not provide the compiler API required by Next.js".
    useTypeScriptCli: true,
  },
};

/**
 * Source-map upload is opt-in (AUDIT.md §10).
 *
 * `instrumentation.ts` reports errors with or without this; what the wrapper
 * adds is readable stack traces, by uploading the maps at build time. It needs a
 * real Sentry org, project and auth token, so it stays off until all three are
 * set — wrapping unconditionally makes every build without them noisier and
 * slower for nothing.
 */
const sentryUploadConfigured = Boolean(
  process.env.SENTRY_ORG &&
  process.env.SENTRY_PROJECT &&
  process.env.SENTRY_AUTH_TOKEN
);

export default sentryUploadConfigured
  ? withSentryConfig(nextConfig, {
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      authToken: process.env.SENTRY_AUTH_TOKEN,
      // Quiet locally, loud in CI where the log is the only record.
      silent: !process.env.CI,
      // Maps are uploaded, then deleted from the output: leaving them served
      // publishes this app's source to anyone who opens devtools.
      sourcemaps: { deleteSourcemapsAfterUpload: true },
      disableLogger: true,
    })
  : nextConfig;
