/**
 * Client-side source ingestion helpers, shared by both dropzones.
 *
 * `extractTextFromFile` lived twice — once in `sources-panel.tsx`, once in
 * `landing/document-dropzone.tsx` — as near-identical copies, so a fix to one
 * silently left the other broken (CLAUDE.md trap 5d). One copy now.
 *
 * Browser-only: both functions call app routes, so nothing here runs on the
 * server.
 */

/** MIME types the pickers advertise, mapped to the `type` stored on the row. */
export const ACCEPTED_TYPES = {
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    "docx",
  "application/msword": "doc",
  "text/plain": "txt",
  "text/markdown": "md",
} as const;

export type AcceptedMimeType = keyof typeof ACCEPTED_TYPES;

/** Text shorter than this is not worth an embedding call. */
export const MIN_INDEXABLE_CHARS = 50;

export const isAcceptedFile = (file: File): boolean =>
  file.type in ACCEPTED_TYPES;

export const documentTypeFor = (file: File): string =>
  ACCEPTED_TYPES[file.type as AcceptedMimeType];

/**
 * Extract a file's text via the server.
 *
 * **Every** type goes through `/api/process-document`, including plain text the
 * browser could read locally: that route is where the magic-byte sniff happens,
 * so reading a `.txt` here would skip the only real type check (AUDIT.md §3.5).
 *
 * Throws on rejection — an unreadable or unidentifiable file must not be
 * stored, and the server's message says why (unsupported type, scanned PDF, no
 * readable text).
 */
export async function extractTextFromFile(file: File): Promise<string> {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch("/api/process-document", {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    const { error } = await response.json().catch(() => ({ error: "" }));
    throw new Error(error || `Could not read ${file.name}`);
  }

  const data = await response.json();
  return data.content ?? "";
}

/** What happened to a source's vectors, mirrored onto the row for the badge. */
export type IndexStatus = "indexed" | "skipped" | "failed";

/**
 * Embed a stored source's text.
 *
 * Never throws: a source with no vectors is still a source the user can read,
 * so a failed index must not undo a successful upload. The returned status is
 * what the list badge shows — a silently unindexed source contributes to no
 * answer, which used to be indistinguishable from a well-indexed one
 * (AUDIT.md §9.6).
 */
export async function indexDocument(args: {
  documentId: string;
  notebookId: string;
  content: string;
  documentName: string;
}): Promise<IndexStatus> {
  if (args.content.length < MIN_INDEXABLE_CHARS) {
    return "skipped";
  }

  try {
    const response = await fetch("/api/embeddings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(args),
    });

    return response.ok ? "indexed" : "failed";
  } catch {
    return "failed";
  }
}
