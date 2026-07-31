import { NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/api-auth";
import { fetchModelCatalogue } from "@/lib/openrouter";

/**
 * The model picker's catalogue (AUDIT.md §5.6).
 *
 * Exists because the list is no longer a compile-time constant the client can
 * import — it comes from OpenRouter, and only the server should be talking to
 * OpenRouter. `fetchModelCatalogue()` caches for an hour and never throws, so
 * this route is cheap and always answers.
 */
export async function GET() {
  const { errorResponse } = await requireApiAuth();
  if (errorResponse) return errorResponse;

  return NextResponse.json({ models: await fetchModelCatalogue() });
}
