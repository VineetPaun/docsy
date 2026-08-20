/**
 * One wrapper, one error envelope, for every API route (AUDIT.md §6.5).
 *
 * Each handler used to hand-roll its own auth check, its own try/catch and its
 * own error shape. Nine routes meant nine chances to forget one, and they had
 * already drifted into three different response bodies. The rules live here
 * now:
 *
 * 1. No handler runs without a Clerk session.
 * 2. A paid route spends its rate-limit budget before the handler starts.
 * 3. Failures leave as `{ error }` with a status. Nothing else escapes.
 * 4. Internal detail goes to Sentry, never to the client.
 *
 * Throw `ApiError` for anything the caller should see. Throw anything else and
 * the caller gets a generic 500 while the real error goes to Sentry.
 */

import { NextResponse, type NextRequest } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { requireApiAuth } from "@/lib/api-auth";
import { enforceRateLimit, type RateLimitKey } from "@/lib/rate-limit";

/** An error whose message and status are meant for the caller. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** 400. The request itself is wrong. */
export const badRequest = (message: string) => new ApiError(400, message);

/**
 * 503 naming the variable that is missing.
 *
 * A feature key that is not set is a deployment problem, not a bad request, and
 * naming it is the difference between a five-minute fix and an afternoon. This
 * app used to answer with fabricated content instead (AUDIT.md §6.6).
 */
export const missingEnv = (variable: string, feature: string) =>
  new ApiError(503, `${feature} is unavailable: ${variable} is not configured`);

interface HandlerContext {
  /** The Clerk id of the signed-in caller. */
  userId: string;
}

/**
 * A handler returns either a `Response` it built itself (streams, custom
 * headers) or a plain object to send as JSON with a 200.
 */
type Handler = (
  request: NextRequest,
  context: HandlerContext
) => Promise<Response | Record<string, unknown>>;

interface HandlerOptions {
  /**
   * Budget to charge before the handler runs. Set it on any route that spends
   * money, and charge before the first paid call rather than after.
   */
  rateLimit?: RateLimitKey;
  /** Message the caller gets when something unexpected throws. */
  fallbackMessage?: string;
  /**
   * Promote one error type to a message the caller sees.
   *
   * There is exactly one use for this today: `/api/process-url` turns a
   * `BlockedUrlError` into a 400, because the reason describes the address the
   * caller sent. Return null to leave the error generic.
   */
  expose?: (error: unknown) => ApiError | null;
}

/**
 * Wrap a route handler with auth, rate limiting and the error envelope.
 *
 * ```ts
 * export const POST = withApiHandler(async (request) => {
 *   const { query } = await request.json();
 *   if (!query) throw badRequest("query is required");
 *   return { success: true, results: await search(query) };
 * }, { rateLimit: "chat" });
 * ```
 */
export function withApiHandler(handler: Handler, options: HandlerOptions = {}) {
  const fallback = options.fallbackMessage ?? "Something went wrong";

  return async function route(request: NextRequest): Promise<Response> {
    // `proxy.ts` blocks anonymous requests at the edge already. This runs
    // anyway, because a middleware matcher is one bad edit away from exposing
    // a route, and a route that checks for itself cannot be exposed that way.
    const { userId, errorResponse } = await requireApiAuth();
    if (errorResponse) return errorResponse;

    if (options.rateLimit) {
      const limited = await enforceRateLimit(options.rateLimit);
      if (limited) return limited;
    }

    try {
      const result = await handler(request, { userId });

      return result instanceof Response ? result : NextResponse.json(result);
    } catch (error) {
      const exposed =
        error instanceof ApiError ? error : (options.expose?.(error) ?? null);

      if (exposed) {
        return NextResponse.json(
          { error: exposed.message },
          { status: exposed.status }
        );
      }

      // The client gets nothing useful, so somebody has to. Before Sentry these
      // errors reached no one at all.
      Sentry.captureException(error);

      return NextResponse.json({ error: fallback }, { status: 500 });
    }
  };
}
