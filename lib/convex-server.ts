/**
 * Ownership guards for API route handlers (AUDIT.md §3.6).
 *
 * `requireApiAuth()` only proves the caller is *some* signed-in user. Routes
 * that take a `notebookId` / `documentId` from the request must also prove the
 * caller owns it, or any signed-in user can read or wipe another user's
 * vectors by passing someone else's id.
 *
 * The Convex queries already scope their result to the identity in the token,
 * so calling them with the caller's own Convex JWT makes a `null` result the
 * ownership answer — no separate authorization logic to keep in sync.
 */

import { auth } from "@clerk/nextjs/server";
import { ConvexHttpClient } from "convex/browser";
import { NextResponse } from "next/server";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";

/**
 * Same response for "not yours" and "does not exist" — distinguishing them
 * tells a caller which ids are real.
 */
const forbidden = () =>
  NextResponse.json({ error: "Forbidden" }, { status: 403 });

/**
 * A Convex client acting as the caller, or null when the environment or the
 * session cannot produce a token.
 *
 * Exported for routes that need to *write* through Convex as the caller — see
 * `/api/audio-overview`, which uploads its MP3 to Convex storage rather than
 * returning it in the response body.
 *
 * Requires a Clerk JWT template named `convex` — the same one
 * `convex/auth.config.ts` pins via `applicationID`. Without it, `getToken`
 * returns null and every guarded route fails closed.
 */
export async function authedConvexClient(): Promise<ConvexHttpClient | null> {
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!convexUrl) return null;

  const { getToken } = await auth();
  const token = await getToken({ template: "convex" });
  if (!token) return null;

  const client = new ConvexHttpClient(convexUrl);
  client.setAuth(token);
  return client;
}

/**
 * @returns null when the caller owns the notebook, otherwise a
 * ready-to-return 403. Fails closed: a misconfigured Convex env denies the
 * request rather than skipping the check.
 */
export async function requireNotebookOwner(
  notebookId: string
): Promise<NextResponse | null> {
  const client = await authedConvexClient();
  if (!client) return forbidden();

  const notebook = await client.query(api.notebooks.getNotebook, {
    notebookId: notebookId as Id<"notebooks">,
  });

  return notebook ? null : forbidden();
}

/**
 * Every source in a notebook, read as the caller.
 *
 * Exists so routes stop taking document text from the request body — the
 * client used to post every document's full `content` with each chat message
 * (AUDIT.md §4.7). Returns `[]` when the caller does not own the notebook, so
 * pair it with {@link requireNotebookOwner} when an unowned id should 403
 * rather than answer emptily.
 */
export async function notebookDocuments(
  notebookId: string
): Promise<Doc<"documents">[]> {
  const client = await authedConvexClient();
  if (!client) return [];

  return client.query(api.documents.getDocuments, {
    notebookId: notebookId as Id<"notebooks">,
  });
}

/** Document equivalent of {@link requireNotebookOwner}. */
export async function requireDocumentOwner(
  documentId: string
): Promise<NextResponse | null> {
  const client = await authedConvexClient();
  if (!client) return forbidden();

  const document = await client.query(api.documents.getDocument, {
    documentId: documentId as Id<"documents">,
  });

  return document ? null : forbidden();
}

/**
 * Every source in a notebook, with its **full** extracted text.
 *
 * The row only carries a snippet since the text moved into file storage
 * (AUDIT.md §8), so anything that needs to read a source properly — the
 * audio-overview script, for one — has to fetch the blob. Rows written before
 * the split have no `contentStorageId` and their text is still inline, which
 * is what the fallback covers.
 *
 * One client and one round of parallel fetches, not a client per document.
 * Returns `[]` when the caller does not own the notebook, same as
 * {@link notebookDocuments}.
 */
export async function notebookSourceTexts(
  notebookId: string
): Promise<{ name: string; content: string }[]> {
  const client = await authedConvexClient();
  if (!client) return [];

  const documents = await client.query(api.documents.getDocuments, {
    notebookId: notebookId as Id<"notebooks">,
  });

  return Promise.all(
    documents.map(async (doc) => {
      if (!doc.contentStorageId) {
        return { name: doc.name, content: doc.content ?? "" };
      }

      // Signed URL rather than the blob itself: a Convex query cannot return
      // file bytes.
      const url = await client.query(api.documents.getContentUrl, {
        documentId: doc._id,
      });

      if (!url) return { name: doc.name, content: doc.content ?? "" };

      try {
        const response = await fetch(url);
        // The snippet is a worse narration than the full text but a much
        // better one than nothing.
        if (!response.ok) return { name: doc.name, content: doc.content ?? "" };
        return { name: doc.name, content: await response.text() };
      } catch {
        return { name: doc.name, content: doc.content ?? "" };
      }
    })
  );
}
