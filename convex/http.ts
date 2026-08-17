/**
 * Clerk webhook endpoint (AUDIT.md §3.1).
 *
 * User provisioning used to run from the browser (`components/user-sync.tsx`
 * → `upsertUser`), which meant `email` / `firstName` / `lastName` / `imageUrl`
 * were whatever the client chose to send, and nothing at all handled account
 * deletion. Clerk is the source of truth for a profile, so Clerk tells us.
 *
 * The URL is `<your-convex-deployment>.convex.site/clerk-webhook` — note
 * `.site`, not `.cloud`. Register it in the Clerk Dashboard for the
 * `user.created`, `user.updated` and `user.deleted` events, then:
 *
 *   bunx convex env set CLERK_WEBHOOK_SECRET whsec_...
 *
 * ⚠️ With no registered webhook, nothing creates `users` rows: `requireUser`
 * throws "User not provisioned" for every mutation and the app is unusable
 * for new signups. This endpoint is not optional.
 */

import { httpRouter } from "convex/server";
import { Webhook } from "svix";
import { internal } from "./_generated/api";
import { httpAction } from "./_generated/server";

/** Only the fields we consume. Clerk sends a great deal more. */
type ClerkUserEvent = {
  type: string;
  data: {
    id: string;
    email_addresses?: Array<{ id: string; email_address: string }>;
    primary_email_address_id?: string | null;
    first_name?: string | null;
    last_name?: string | null;
    image_url?: string | null;
  };
};

const handleClerkWebhook = httpAction(async (ctx, request) => {
  const secret = process.env.CLERK_WEBHOOK_SECRET;

  // Fail loudly rather than accepting unverified payloads: an unverified
  // endpoint is the same hole as the client-side upsert it replaced.
  if (!secret) {
    return new Response("CLERK_WEBHOOK_SECRET is not set", { status: 500 });
  }

  // The raw body is what was signed, so it must not be parsed first.
  const payload = await request.text();
  const svixId = request.headers.get("svix-id") ?? "";

  let event: ClerkUserEvent;
  try {
    event = new Webhook(secret).verify(payload, {
      "svix-id": svixId,
      "svix-timestamp": request.headers.get("svix-timestamp") ?? "",
      "svix-signature": request.headers.get("svix-signature") ?? "",
    }) as ClerkUserEvent;
  } catch {
    return new Response("Invalid signature", { status: 400 });
  }

  // Apply each delivery once. Retries of the newest event are harmless, but a
  // replayed *older* `user.updated` would write a stale profile over a newer
  // one (AUDIT.md §10). 200 so Svix stops retrying a duplicate.
  const claimed = await ctx.runMutation(internal.users.claimWebhookEvent, {
    svixId,
  });

  if (!claimed) {
    return new Response(null, { status: 200 });
  }

  switch (event.type) {
    case "user.created":
    case "user.updated": {
      const emails = event.data.email_addresses ?? [];
      const primary =
        emails.find((e) => e.id === event.data.primary_email_address_id) ??
        emails[0];

      await ctx.runMutation(internal.users.upsertFromClerk, {
        clerkId: event.data.id,
        email: primary?.email_address ?? "",
        firstName: event.data.first_name ?? undefined,
        lastName: event.data.last_name ?? undefined,
        imageUrl: event.data.image_url ?? undefined,
      });
      break;
    }

    case "user.deleted":
      await ctx.runMutation(internal.users.deleteUser, {
        clerkId: event.data.id,
      });
      break;

    // Anything else is acknowledged, not retried. Clerk resends on non-2xx.
    default:
      break;
  }

  return new Response(null, { status: 200 });
});

const http = httpRouter();

http.route({
  path: "/clerk-webhook",
  method: "POST",
  handler: handleClerkWebhook,
});

export default http;
