import { auth } from "@clerk/nextjs/server";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";

/**
 * Server shell for the dashboard (AUDIT.md §6.7).
 *
 * This page used to be a Client Component that checked `if (!user)` while
 * rendering: the HTML and the JS shipped first, and the check ran afterwards —
 * a loading flash, and a page whose gate lived in the browser. `auth.protect()`
 * runs before anything is sent, so an anonymous request is redirected to
 * sign-in instead of being handed the app.
 *
 * `proxy.ts` guards this route too. Two gates is deliberate: a middleware
 * matcher is one bad edit away from exposing a page, and a page that checks for
 * itself cannot be exposed that way.
 */
export default async function DashboardPage() {
  await auth.protect();

  return <DashboardShell />;
}
