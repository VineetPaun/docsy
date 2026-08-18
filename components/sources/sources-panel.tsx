"use client";

/**
 * Sources panel — layout and composition only.
 *
 * This file was 1,211 lines and 13 `useState` hooks, owning upload, extraction,
 * web search, URL import, audio overviews, selection, delete confirmation and
 * preview at once (AUDIT.md §6.2). Each of those now lives next to this file;
 * what remains here is the arrangement and the two dialogs that span sections.
 */

import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DocumentPreview } from "@/components/document-preview";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { AudioOverviewPanel } from "./audio-overview-panel";
import { RenameSourceDialog } from "./rename-source-dialog";
import { SourceList } from "./source-list";
import { UrlImportPanel } from "./url-import-panel";
import { WebSearchPanel } from "./web-search-panel";
import { useDocumentUpload } from "./hooks/use-document-upload";
import type { SourceDocument } from "./types";

interface SourcesPanelProps {
  notebookId: string;
  documents: SourceDocument[] | undefined;
  onDeleteDocument: (documentId: string) => void;
  // Selection lives in the page, not here — the checkboxes drive both bulk
  // delete and which sources chat retrieves from (AUDIT.md §4.5).
  selectedDocs: Set<string>;
  setSelectedDocs: React.Dispatch<React.SetStateAction<Set<string>>>;
}

export function SourcesPanel({
  notebookId,
  documents,
  onDeleteDocument,
  selectedDocs,
  setSelectedDocs,
}: SourcesPanelProps) {
  const [isDragging, setIsDragging] = React.useState(false);
  const [showUrlInput, setShowUrlInput] = React.useState(false);
  const [isImportingUrl, setIsImportingUrl] = React.useState(false);
  const [previewDoc, setPreviewDoc] = React.useState<SourceDocument | null>(
    null
  );
  const [renameDoc, setRenameDoc] = React.useState<SourceDocument | null>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<{
    type: "single" | "multiple";
    docId?: string;
  } | null>(null);

  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const { handleFiles, isUploading, uploadProgress } =
    useDocumentUpload(notebookId);

  const busy = isUploading || isImportingUrl;

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files.length > 0) handleFiles(e.dataTransfer.files);
  };

  const toggleDocSelection = (docId: string) => {
    setSelectedDocs((prev) => {
      const next = new Set(prev);
      if (next.has(docId)) next.delete(docId);
      else next.add(docId);
      return next;
    });
  };

  const handleConfirmDelete = () => {
    if (deleteTarget?.type === "multiple") {
      for (const docId of selectedDocs) {
        onDeleteDocument(docId);
      }
      toast.success(`Deleted ${selectedDocs.size} source(s)`);
      setSelectedDocs(new Set());
    } else if (deleteTarget?.type === "single" && deleteTarget.docId) {
      onDeleteDocument(deleteTarget.docId);
      toast.success("Source deleted");
    }
    setDeleteTarget(null);
  };

  return (
    <div
      className="flex h-full flex-col"
      onDrop={handleDrop}
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        setIsDragging(false);
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border/40 px-3 py-3 sm:px-4">
        <h2 className="font-semibold">Sources</h2>
      </div>

      {/* Add sources */}
      <div className="border-b border-border/40 p-3">
        <div className="flex gap-2">
          <Button
            variant="outline"
            className="flex-1 justify-center gap-2"
            onClick={() => fileInputRef.current?.click()}
            disabled={busy}
          >
            {isUploading ? (
              <>
                <span
                  role="status"
                  aria-label="Uploading sources"
                  className="size-4 animate-spin rounded-full border-2 border-primary border-t-transparent"
                />
                <span className="text-sm">
                  {uploadProgress || "Uploading..."}
                </span>
              </>
            ) : (
              <>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="size-4"
                  aria-hidden="true"
                >
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
                Upload
              </>
            )}
          </Button>
          <Button
            variant={showUrlInput ? "secondary" : "outline"}
            className="gap-2"
            onClick={() => setShowUrlInput(!showUrlInput)}
            disabled={busy}
            aria-expanded={showUrlInput}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="size-4"
              aria-hidden="true"
            >
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
            </svg>
            Link
          </Button>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.docx,.doc,.txt,.md"
          multiple
          className="hidden"
          onChange={(e) => e.target.files && handleFiles(e.target.files)}
        />

        <UrlImportPanel
          notebookId={notebookId}
          open={showUrlInput}
          onImported={() => setShowUrlInput(false)}
          onBusyChange={setIsImportingUrl}
        />
      </div>

      {/* Web search */}
      <div className="border-b border-border/40 p-3">
        <WebSearchPanel notebookId={notebookId} />
      </div>

      {/* Audio overview */}
      <AudioOverviewPanel
        notebookId={notebookId}
        hasSources={Boolean(documents && documents.length > 0)}
      />

      {/* Sources */}
      <div className="flex-1 overflow-y-auto">
        {isDragging && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-primary/10 backdrop-blur-sm">
            <div className="rounded-lg border-2 border-dashed border-primary bg-background p-8 text-center">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="mx-auto size-10 text-primary"
                aria-hidden="true"
              >
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
              <p className="mt-2 font-medium">Drop files here</p>
            </div>
          </div>
        )}

        <SourceList
          documents={documents}
          selectedDocs={selectedDocs}
          onToggle={toggleDocSelection}
          onSelectAll={() =>
            documents && setSelectedDocs(new Set(documents.map((d) => d._id)))
          }
          onDeselectAll={() => setSelectedDocs(new Set())}
          onPreview={setPreviewDoc}
          onRename={setRenameDoc}
          onDeleteOne={(docId) => setDeleteTarget({ type: "single", docId })}
          onDeleteSelected={() =>
            selectedDocs.size > 0 && setDeleteTarget({ type: "multiple" })
          }
        />
      </div>

      <DocumentPreview
        document={previewDoc}
        onClose={() => setPreviewDoc(null)}
      />

      <RenameSourceDialog
        source={renameDoc}
        onClose={() => setRenameDoc(null)}
      />

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete Source{deleteTarget?.type === "multiple" ? "s" : ""}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.type === "multiple"
                ? `Are you sure you want to delete ${selectedDocs.size} source(s)? This action cannot be undone.`
                : "Are you sure you want to delete this source? This action cannot be undone."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
