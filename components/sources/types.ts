/**
 * The shape of a source as the panel consumes it.
 *
 * A hand-written subset of the Convex `documents` row rather than
 * `Doc<"documents">`: the notebook page passes the same object to the chat and
 * the preview, and those only need these fields.
 */
export interface SourceDocument {
  _id: string;
  name: string;
  type: string;
  /** Preview snippet, or the full text on rows written before AUDIT.md §8. */
  content?: string;
  /** Storage id of the full extracted text, absent on those older rows. */
  contentStorageId?: string;
  /** Length of the full text, so the badge never fetches the blob to size it. */
  contentLength?: number;
  storageId?: string;
  createdAt: number;
  /** "indexed" | "skipped" | "failed", absent on rows predating the field. */
  indexStatus?: string;
}
