"use client";

import * as React from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { DocumentPreview } from "@/components/document-preview";

interface Document {
  _id: string;
  name: string;
  type: string;
  content?: string;
  storageId?: string;
  createdAt: number;
}

interface SourcesPanelProps {
  notebookId: string;
  clerkId: string;
  documents: Document[] | undefined;
  onDeleteDocument: (documentId: string) => void;
}

const ACCEPTED_TYPES = {
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    "docx",
  "application/msword": "doc",
  "text/plain": "txt",
  "text/markdown": "md",
};

export function SourcesPanel({
  notebookId,
  clerkId,
  documents,
  onDeleteDocument,
}: SourcesPanelProps) {
  const [isDragging, setIsDragging] = React.useState(false);
  const [isUploading, setIsUploading] = React.useState(false);
  const [uploadProgress, setUploadProgress] = React.useState("");
  const [selectedDocs, setSelectedDocs] = React.useState<Set<string>>(
    new Set()
  );
  const [previewDoc, setPreviewDoc] = React.useState<Document | null>(null);

  // Web search state
  const [searchQuery, setSearchQuery] = React.useState("");
  const [isSearching, setIsSearching] = React.useState(false);
  const [searchResults, setSearchResults] = React.useState<any[]>([]);
  const [showSearchResults, setShowSearchResults] = React.useState(false);

  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const createDocument = useMutation(api.documents.createDocument);
  const generateUploadUrl = useMutation(api.documents.generateUploadUrl);
  const updateDocumentContent = useMutation(
    api.documents.updateDocumentContent
  );

  // Function to reprocess a document that has no content
  const handleReprocessDocument = async (documentId: string) => {
    const doc = documents?.find((d) => d._id === documentId);
    if (!doc || !doc.storageId) {
      console.error("[sources-panel] Cannot reprocess - no storageId");
      return;
    }

    console.log(`[sources-panel] Reprocessing document: ${doc.name}`);

    try {
      // Fetch the file from Convex storage
      // We need to get the storage URL first
      const storageUrl = `/api/convex-storage?storageId=${doc.storageId}`;

      // For now, alert the user to re-upload
      alert(
        `To reprocess "${doc.name}", please delete it and upload again. The new upload will extract content properly.`
      );
    } catch (error) {
      console.error("[sources-panel] Reprocess error:", error);
      alert("Failed to reprocess document");
    }
  };

  const extractTextFromFile = async (file: File): Promise<string> => {
    const type = ACCEPTED_TYPES[file.type as keyof typeof ACCEPTED_TYPES];

    // For text files, read directly
    if (type === "txt" || type === "md") {
      const text = await file.text();
      console.log(
        `[sources-panel] Extracted ${text.length} chars from text file: ${file.name}`
      );
      return text;
    }

    // For PDF and DOCX, use the server-side processing API
    try {
      console.log(
        `[sources-panel] Sending ${file.name} (${file.type}) to process-document API`
      );
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/process-document", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(
          `[sources-panel] process-document API error: ${response.status}`,
          errorText
        );
        throw new Error("Failed to process document");
      }

      const data = await response.json();
      console.log(
        `[sources-panel] Received ${data.content?.length || 0} chars from process-document API for: ${file.name}`
      );
      console.log(
        `[sources-panel] Content preview: "${data.content?.substring(0, 100)}..."`
      );
      return data.content;
    } catch (error) {
      console.error("[sources-panel] Document processing error:", error);
      return `[Failed to extract content from ${file.name}]`;
    }
  };

  const handleWebSearch = async () => {
    if (!searchQuery.trim()) return;

    setIsSearching(true);
    setShowSearchResults(true);
    setSearchResults([]);

    try {
      console.log(`[sources-panel] Searching web for: "${searchQuery}"`);
      const response = await fetch("/api/web-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: searchQuery }),
      });

      const data = await response.json();

      if (data.success && data.results) {
        setSearchResults(data.results);
      } else {
        console.error("Web search failed:", data.error || data.message);
        alert(`Search failed: ${data.message || "Unknown error"}`);
      }
    } catch (error) {
      console.error("Web search error:", error);
      alert("Failed to perform web search");
    } finally {
      setIsSearching(false);
    }
  };

  const handleAddWebResult = async (result: any) => {
    try {
      console.log(`[sources-panel] Adding web result: ${result.title}`);

      // Create content with metadata
      const content = `Source: ${result.url}\nTitle: ${result.title}\nDate: ${new Date().toISOString()}\n\n${result.snippet || ""}`;

      const doc = await createDocument({
        notebookId: notebookId as never,
        clerkId,
        name: result.title || "Web Result",
        type: "txt", // Treat as text file
        content,
        // No storageId for web results
      });

      console.log(`[sources-panel] Web document created: ${doc}`);

      // Generate embeddings
      if (content && content.length > 50) {
        console.log(`[sources-panel] Generating embeddings for web result`);
        try {
          await fetch("/api/embeddings", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              documentId: doc,
              notebookId,
              content,
              documentName: result.title,
            }),
          });
        } catch (error) {
          console.error("Embedding error for web result:", error);
        }
      }

      // Remove from search results to indicate added
      setSearchResults((prev) => prev.filter((r) => r.url !== result.url));
    } catch (error) {
      console.error("Failed to add web source:", error);
      alert("Failed to add web source");
    }
  };

  const handleFiles = async (files: FileList) => {
    const validFiles = Array.from(files).filter(
      (file) => file.type in ACCEPTED_TYPES
    );
    if (validFiles.length === 0) {
      alert("Please upload PDF, DOCX, or TXT files only.");
      return;
    }

    setIsUploading(true);
    try {
      for (let i = 0; i < validFiles.length; i++) {
        const file = validFiles[i];
        setUploadProgress(
          `Processing ${i + 1}/${validFiles.length}: ${file.name}`
        );
        const type = ACCEPTED_TYPES[file.type as keyof typeof ACCEPTED_TYPES];

        // Extract text content (with server-side processing for PDF/DOCX)
        const content = await extractTextFromFile(file);

        setUploadProgress(
          `Uploading ${i + 1}/${validFiles.length}: ${file.name}`
        );
        const uploadUrl = await generateUploadUrl();
        const result = await fetch(uploadUrl, {
          method: "POST",
          headers: { "Content-Type": file.type },
          body: file,
        });
        if (!result.ok) throw new Error(`Failed to upload ${file.name}`);
        const { storageId } = await result.json();
        const doc = await createDocument({
          notebookId: notebookId as never,
          clerkId,
          name: file.name,
          type,
          content,
          storageId,
        });

        console.log(
          `[sources-panel] Document created with ID: ${doc}, content stored: ${content?.length || 0} chars`
        );

        // Generate embeddings for the document (in background)
        if (
          content &&
          content.length > 50 &&
          !content.startsWith("[Failed") &&
          !content.startsWith("[PDF content could not")
        ) {
          setUploadProgress(
            `Indexing ${i + 1}/${validFiles.length}: ${file.name}`
          );
          console.log(
            `[sources-panel] Starting embeddings generation for: ${file.name}`
          );
          try {
            const embedResponse = await fetch("/api/embeddings", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                documentId: doc,
                notebookId,
                content,
                documentName: file.name,
              }),
            });
            const embedResult = await embedResponse.json();
            console.log(`[sources-panel] Embeddings result:`, embedResult);
          } catch (embedError) {
            console.error(
              "[sources-panel] Embedding error (non-fatal):",
              embedError
            );
            // Continue even if embedding fails
          }
        } else {
          console.warn(
            `[sources-panel] Skipping embeddings - content invalid or too short for: ${file.name}`
          );
        }
      }
      setUploadProgress("");
    } catch (error) {
      console.error("Upload error:", error);
      alert("Failed to upload some files. Please try again.");
    } finally {
      setIsUploading(false);
    }
  };

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

  const selectAll = () => {
    if (documents) {
      setSelectedDocs(new Set(documents.map((d) => d._id)));
    }
  };

  const deselectAll = () => {
    setSelectedDocs(new Set());
  };

  const handleDeleteSelected = async () => {
    if (selectedDocs.size === 0) return;

    if (
      confirm(`Are you sure you want to delete ${selectedDocs.size} source(s)?`)
    ) {
      // We'll iterate and delete.
      // Note: In a real app we might want a bulk delete API endpoint.
      for (const docId of selectedDocs) {
        onDeleteDocument(docId);
      }
      setSelectedDocs(new Set());
    }
  };

  const getFileIcon = (type: string, size: "sm" | "md" = "sm") => {
    const sizeClass = size === "sm" ? "size-4" : "size-5";
    const colors: Record<string, string> = {
      pdf: "text-red-500",
      docx: "text-blue-500",
      doc: "text-blue-500",
      txt: "text-gray-500",
      md: "text-gray-500",
    };
    const color = colors[type.toLowerCase()] || "text-muted-foreground";

    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={`${sizeClass} ${color}`}
      >
        <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
        <polyline points="14,2 14,8 20,8" />
      </svg>
    );
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
      <div className="flex items-center justify-between border-b border-border/40 px-4 py-3">
        <h2 className="font-semibold">Sources</h2>
        <button className="rounded p-1 hover:bg-muted">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="size-4"
          >
            <rect width="7" height="7" x="3" y="3" rx="1" />
            <rect width="7" height="7" x="14" y="3" rx="1" />
            <rect width="7" height="7" x="14" y="14" rx="1" />
            <rect width="7" height="7" x="3" y="14" rx="1" />
          </svg>
        </button>
      </div>

      {/* Add Sources Button */}
      <div className="border-b border-border/40 p-3">
        <Button
          variant="outline"
          className="w-full justify-center gap-2"
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading}
        >
          {isUploading ? (
            <>
              <svg
                className="size-4 animate-spin"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
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
              >
                <path d="M12 5v14" />
                <path d="M5 12h14" />
              </svg>
              Add sources
            </>
          )}
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.docx,.doc,.txt,.md"
          multiple
          className="hidden"
          onChange={(e) => e.target.files && handleFiles(e.target.files)}
        />
      </div>

      {/* Web Search Section */}
      <div className="border-b border-border/40 p-3">
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="size-4 text-muted-foreground"
            >
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.3-4.3" />
            </svg>
            <input
              type="text"
              placeholder="Search the web for new sources"
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleWebSearch()}
              disabled={isSearching}
            />
            {isSearching && (
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            )}
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                onClick={handleWebSearch}
                disabled={isSearching || !searchQuery.trim()}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="mr-1.5 size-3"
                >
                  <circle cx="12" cy="12" r="10" />
                  <path d="M2 12h20" />
                  <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                </svg>
                Search Web
              </Button>
            </div>

            {showSearchResults && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => {
                  setShowSearchResults(false);
                  setSearchResults([]);
                  setSearchQuery("");
                }}
              >
                Clear
              </Button>
            )}
          </div>

          {/* Search Results */}
          {showSearchResults && (
            <div className="mt-2 space-y-2 max-h-[300px] overflow-y-auto pr-1">
              {searchResults.length === 0 && !isSearching ? (
                <p className="text-center text-xs text-muted-foreground py-2">
                  No results found.
                </p>
              ) : (
                searchResults.map((result, i) => (
                  <div
                    key={i}
                    className="rounded-md border border-border bg-background p-2 text-sm shadow-sm"
                  >
                    <div
                      className="mb-1 font-medium line-clamp-1"
                      title={result.title}
                    >
                      {result.title}
                    </div>
                    <div className="mb-2 line-clamp-2 text-xs text-muted-foreground">
                      {result.snippet}
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className="text-[10px] text-muted-foreground truncate max-w-[120px]"
                        title={result.url}
                      >
                        {result.source || new URL(result.url).hostname}
                      </span>
                      <Button
                        size="sm"
                        variant="secondary"
                        className="h-6 px-2 text-xs"
                        onClick={() => handleAddWebResult(result)}
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className="mr-1 size-3"
                        >
                          <path d="M5 12h14" />
                          <path d="M12 5v14" />
                        </svg>
                        Add
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>

      {/* Sources List */}
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
              >
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
              <p className="mt-2 font-medium">Drop files here</p>
            </div>
          </div>
        )}

        {documents === undefined ? (
          <div className="p-4 space-y-2">
            {[...Array(3)].map((_, i) => (
              <div
                key={i}
                className="flex items-center gap-3 rounded-lg bg-muted/30 p-3 animate-pulse"
              >
                <div className="size-4 rounded bg-muted" />
                <div className="h-4 flex-1 rounded bg-muted" />
              </div>
            ))}
          </div>
        ) : documents.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-8 text-center">
            <div className="flex size-12 items-center justify-center rounded-full bg-muted">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="size-6 text-muted-foreground"
              >
                <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
                <polyline points="14,2 14,8 20,8" />
              </svg>
            </div>
            <h3 className="mt-4 font-medium">Saved sources will appear here</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Click Add source above to add PDFs, websites, text, videos, or
              audio files.
            </p>
          </div>
        ) : (
          <div className="p-2">
            {/* Selection controls */}
            <div className="mb-2 flex items-center justify-between px-2 text-xs text-muted-foreground">
              <span>
                {selectedDocs.size} of {documents.length} selected
              </span>
              <div className="flex gap-2">
                {selectedDocs.size > 0 && (
                  <button
                    onClick={handleDeleteSelected}
                    className="flex items-center text-destructive hover:text-destructive/80 hover:underline"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="mr-1 size-3"
                    >
                      <path d="M3 6h18" />
                      <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                      <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                    </svg>
                    Delete ({selectedDocs.size})
                  </button>
                )}
                <div className="h-4 w-px bg-border/50 mx-1" />
                {selectedDocs.size === documents.length ? (
                  <button
                    onClick={deselectAll}
                    className="hover:text-foreground"
                  >
                    Deselect all
                  </button>
                ) : (
                  <button onClick={selectAll} className="hover:text-foreground">
                    Select all
                  </button>
                )}
              </div>
            </div>

            {/* Document list */}
            <div className="space-y-1">
              {documents.map((doc) => (
                <div
                  key={doc._id}
                  className={`group flex items-center gap-3 rounded-lg px-3 py-2 transition-colors hover:bg-muted/50 ${
                    selectedDocs.has(doc._id) ? "bg-muted/50" : ""
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selectedDocs.has(doc._id)}
                    onChange={() => toggleDocSelection(doc._id)}
                    className="size-4 rounded border-border"
                  />
                  {getFileIcon(doc.type)}
                  <button
                    onClick={() => setPreviewDoc(doc)}
                    className="flex-1 min-w-0 text-left"
                  >
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-medium hover:underline">
                        {doc.name}
                      </p>
                      {doc.content && doc.content.length > 50 ? (
                        <span className="shrink-0 rounded bg-green-500/10 px-1.5 py-0.5 text-[10px] font-medium text-green-600 dark:text-green-400">
                          {Math.round(doc.content.length / 1000)}k
                        </span>
                      ) : (
                        <span className="shrink-0 rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400">
                          No text
                        </span>
                      )}
                    </div>
                  </button>
                  <button
                    onClick={() => {
                      if (confirm("Delete this source?")) {
                        onDeleteDocument(doc._id);
                      }
                    }}
                    className="rounded p-1 opacity-0 transition-opacity hover:bg-destructive/10 group-hover:opacity-100"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="size-3.5 text-destructive"
                    >
                      <path d="M3 6h18" />
                      <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                      <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Document Preview Modal */}
      <DocumentPreview
        document={previewDoc}
        onClose={() => setPreviewDoc(null)}
        onReprocess={handleReprocessDocument}
      />
    </div>
  );
}
