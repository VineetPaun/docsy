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
  content?: string;
  storageId?: string;
  createdAt: number;
  /** "indexed" | "skipped" | "failed", absent on rows predating the field. */
  indexStatus?: string;
}
