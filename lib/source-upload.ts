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

/**
 * How much of a source's text the Convex row keeps.
 *
 * Must match `SNIPPET_CHARS` in `convex/documents.ts`, which re-slices whatever
 * arrives — this copy exists so the client never ships the megabyte it knows
 * will be discarded.
 */
export const SOURCE_SNIPPET_CHARS = 2_000;

/** What `createDocument` needs in order to record a source's text. */
export interface StoredSourceText {
  /** Preview snippet kept on the row. */
  content: string;
  /** Storage id of the full text, absent if it could not be stored. */
  contentStorageId?: string;
  /** Length of the full text, so the row knows the real size. */
  contentLength: number;
}

/**
 * Put a source's extracted text in Convex file storage and return what the row
 * should record.
 *
 * A Convex document is capped at 1 MB and the extracted text of a long PDF
 * exceeds that on its own, so storing it inline made large sources fail at
 * `createDocument` with an opaque error (AUDIT.md §8). Mutations cannot write
 * to storage, so the upload happens here and the row is handed the id.
 *
 * Never throws: a source whose text blob fails to upload still stores its
 * snippet and still indexes, which is strictly better than losing the upload.
 * Readers fall back to `content`, exactly as they do for rows written before
 * the split.
 *
 * @param generateUploadUrl the `api.documents.generateUploadUrl` mutation
 */
export async function storeSourceText(
  generateUploadUrl: () => Promise<string>,
  text: string
): Promise<StoredSourceText> {
  const base = {
    content: text.slice(0, SOURCE_SNIPPET_CHARS),
    contentLength: text.length,
  };

  // Nothing to move out of the row, and an empty blob is still a stored file.
  if (text.length <= SOURCE_SNIPPET_CHARS) {
    return base;
  }

  try {
    const uploadUrl = await generateUploadUrl();
    const response = await fetch(uploadUrl, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: new Blob([text], { type: "text/plain" }),
    });

    if (!response.ok) return base;

    const { storageId } = await response.json();
    return { ...base, contentStorageId: storageId };
  } catch {
    return base;
  }
}
