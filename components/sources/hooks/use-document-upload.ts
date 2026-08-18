"use client";

/**
 * The upload pipeline: extract → store → create row → index.
 *
 * Lifted out of `sources-panel.tsx`, which owned this alongside web search, URL
 * import, audio overviews and the source list (AUDIT.md §6.2).
 *
 * Files now run three at a time rather than one after another (§8). The order of
 * steps inside a file is unchanged and load-bearing: extraction first, so a file
 * the server cannot read is never uploaded, never stored and never counted
 * against the quota.
 */

import * as React from "react";
import { useMutation } from "convex/react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import { convexErrorMessage } from "@/lib/convex-error";
import { mapWithConcurrency } from "@/lib/concurrency";
import {
  documentTypeFor,
  extractTextFromFile,
  indexDocument,
  isAcceptedFile,
} from "@/lib/source-upload";

/**
 * Upload UX bound only. The enforceable limit is
 * `MAX_DOCUMENTS_PER_NOTEBOOK` in `convex/documents.ts` — anything here is a
 * suggestion the client can ignore.
 */
const MAX_FILES_PER_UPLOAD = 20;

/**
 * How many files are in flight at once.
 *
 * Three, not unbounded: each one is a PDF extraction plus an embedding run, and
 * `/api/chat` shares the same rate limit budget. Raise it only with evidence the
 * server is bored.
 */
const UPLOAD_CONCURRENCY = 3;

export function useDocumentUpload(notebookId: string) {
  const [isUploading, setIsUploading] = React.useState(false);
  const [uploadProgress, setUploadProgress] = React.useState("");

  const createDocument = useMutation(api.documents.createDocument);
  const generateUploadUrl = useMutation(api.documents.generateUploadUrl);
  const setIndexStatus = useMutation(api.documents.setIndexStatus);

  const uploadOne = React.useCallback(
    async (file: File) => {
      // Before the upload, so a file the server cannot identify is never
      // stored at all.
      const content = await extractTextFromFile(file);

      const uploadUrl = await generateUploadUrl();
      const result = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file,
      });

      if (!result.ok) throw new Error(`Failed to upload ${file.name}`);

      const { storageId } = await result.json();

      const documentId = await createDocument({
        notebookId: notebookId as never,
        name: file.name,
        type: documentTypeFor(file),
        content,
        storageId,
      });

      // No placeholder-string checks needed: extraction failure is a 422 that
      // throws above, so reaching here means real text (AUDIT.md §4.10).
      const status = await indexDocument({
        documentId,
        notebookId,
        content,
        documentName: file.name,
      });

      // Recorded so the list can say a source is not searchable, instead of the
      // user discovering it through an answer that never cites it.
      await setIndexStatus({
        documentId: documentId as never,
        status,
      }).catch(() => {
        // The badge is nice to have; the source is already stored.
      });

      return status;
    },
    [createDocument, generateUploadUrl, notebookId, setIndexStatus]
  );

  const handleFiles = React.useCallback(
    async (files: FileList) => {
      const validFiles = Array.from(files).filter(isAcceptedFile);

      if (validFiles.length === 0) {
        toast.error("Please upload PDF, DOCX, or TXT files only.");
        return;
      }

      // A 200-file drop would fire 200 uploads and 200 embedding runs. The real
      // ceiling is `MAX_DOCUMENTS_PER_NOTEBOOK`, which the client cannot
      // bypass; this is the friendly version of it.
      if (validFiles.length > MAX_FILES_PER_UPLOAD) {
        toast.error(
          `Please upload at most ${MAX_FILES_PER_UPLOAD} files at once.`
        );
        return;
      }

      setIsUploading(true);

      // Per-file progress made no sense once files overlap, so the counter
      // reports finished-of-total instead of naming whichever file is current.
      let finished = 0;
      let succeeded = 0;
      let unindexed = 0;

      const report = () =>
        setUploadProgress(`Processing ${finished}/${validFiles.length}`);

      report();

      // Per-file error handling: one unreadable file used to abort the whole
      // batch, discarding files that had already been processed. The pool never
      // sees a rejection for the same reason.
      await mapWithConcurrency(validFiles, UPLOAD_CONCURRENCY, async (file) => {
        try {
          const status = await uploadOne(file);
          succeeded++;
          if (status === "failed") unindexed++;
        } catch (error) {
          // The 50-source cap and the storage quota are ConvexErrors, whose
          // readable text lives on `.data` rather than on `.message`.
          const reason = convexErrorMessage(
            error,
            error instanceof Error ? error.message : "Please try again."
          );
          toast.error(`${file.name}: ${reason}`);
        } finally {
          finished++;
          report();
        }
      });

      setUploadProgress("");
      setIsUploading(false);

      if (succeeded > 0) {
        toast.success(`Uploaded ${succeeded} file(s) successfully`);
      }

      if (unindexed > 0) {
        toast.warning(
          `${unindexed} source(s) were stored but could not be indexed, so chat cannot cite them yet.`
        );
      }
    },
    [uploadOne]
  );

  return { handleFiles, isUploading, uploadProgress };
}
