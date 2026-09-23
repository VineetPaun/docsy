"use client";

/**
 * Re-embed one stored source into the current Qdrant collection.
 *
 * Two jobs share this path: retrying a source whose indexing failed, and
 * moving a source indexed before the hybrid-search collection bump
 * (`docsy_documents_v3`, `lib/qdrant.ts`) into the collection chat now reads.
 * A source in the old collection is invisible to retrieval, so without this the
 * only fix was delete-and-re-add.
 *
 * The text comes from Convex, never from the file again: the full extracted
 * text is in storage (or inline on rows written before that split), so there is
 * nothing to re-extract. `/api/embeddings` deletes the document's old chunks
 * before writing, so a reindex never duplicates.
 */

import * as React from "react";
import { useConvex, useMutation } from "convex/react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { indexDocument } from "@/lib/source-upload";
import type { SourceDocument } from "../types";

export function useReindexSource(notebookId: string) {
  const convex = useConvex();
  const setIndexStatus = useMutation(api.documents.setIndexStatus);
  // Ids in flight, so the row can show a spinner and refuse a double click.
  const [pending, setPending] = React.useState<ReadonlySet<string>>(new Set());

  const reindex = React.useCallback(
    async (doc: SourceDocument) => {
      setPending((prev) => new Set(prev).add(doc._id));

      try {
        const documentId = doc._id as Id<"documents">;

        // Null for a row written before the text moved to storage — its
        // `content` is still the whole text.
        const url = doc.contentStorageId
          ? await convex.query(api.documents.getContentUrl, { documentId })
          : null;

        let content = doc.content ?? "";
        if (url) {
          const response = await fetch(url);
          // Indexing the 2,000-char snippet would silently drop the rest of
          // the source from retrieval, which is worse than failing loudly.
          if (!response.ok) throw new Error("Could not load the source text");
          content = await response.text();
        }

        const status = await indexDocument({
          documentId: doc._id,
          notebookId,
          content,
          documentName: doc.name,
        });

        await setIndexStatus({ documentId, status });

        if (status === "indexed") toast.success(`Reindexed ${doc.name}`);
        else if (status === "skipped")
          toast.error(`${doc.name} has too little text to index`);
        else toast.error(`Could not reindex ${doc.name}. Try again.`);
      } catch {
        toast.error(`Could not reindex ${doc.name}. Try again.`);
      } finally {
        setPending((prev) => {
          const next = new Set(prev);
          next.delete(doc._id);
          return next;
        });
      }
    },
    [convex, notebookId, setIndexStatus]
  );

  return { reindex, pending };
}
