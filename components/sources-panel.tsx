"use client";

import * as React from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { DocumentPreview } from "@/components/document-preview";
import AudioPlayer from "@/components/audio-player";
import { toast } from "sonner";
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
  documents: Document[] | undefined;
  onDeleteDocument: (documentId: string) => void;
  // Selection lives in the page, not here — the checkboxes drive both bulk
  // delete and which sources chat retrieves from (AUDIT.md §4.5).
  selectedDocs: Set<string>;
  setSelectedDocs: React.Dispatch<React.SetStateAction<Set<string>>>;
}

// Upload UX bound only. The enforceable limit is MAX_DOCUMENTS_PER_NOTEBOOK in
// convex/documents.ts — anything here is a suggestion the client can ignore.
const MAX_FILES_PER_UPLOAD = 20;

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
  documents,
  onDeleteDocument,
  selectedDocs,
  setSelectedDocs,
}: SourcesPanelProps) {
  const [isDragging, setIsDragging] = React.useState(false);
  const [isUploading, setIsUploading] = React.useState(false);
  const [uploadProgress, setUploadProgress] = React.useState("");
  const [previewDoc, setPreviewDoc] = React.useState<Document | null>(null);

  // Web search state
  const [searchQuery, setSearchQuery] = React.useState("");
  const [isSearching, setIsSearching] = React.useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [searchResults, setSearchResults] = React.useState<any[]>([]);
  const [showSearchResults, setShowSearchResults] = React.useState(false);

  // URL input state
  const [urlInput, setUrlInput] = React.useState("");
  const [isProcessingUrl, setIsProcessingUrl] = React.useState(false);
  const [showUrlInput, setShowUrlInput] = React.useState(false);

  // Audio overview state
  const [isGeneratingAudio, setIsGeneratingAudio] = React.useState(false);
  // Audio itself is not held here — it lives in Convex storage and arrives as a
  // URL on the reactive query. Only the script is mirrored locally, so it shows
  // immediately after generation.
  const [audioScript, setAudioScript] = React.useState<string | undefined>();
  const [showAudioSection, setShowAudioSection] = React.useState(true);

  // Delete confirmation dialog state
  const [deleteDialogOpen, setDeleteDialogOpen] = React.useState(false);
  const [deleteTarget, setDeleteTarget] = React.useState<{
    type: "single" | "multiple";
    docId?: string;
  } | null>(null);

  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const createDocument = useMutation(api.documents.createDocument);
  const generateUploadUrl = useMutation(api.documents.generateUploadUrl);
  const createAudioOverview = useMutation(
    api.audioOverviews.createAudioOverview
  );

  // Query for existing audio overview
  const existingAudioOverview = useQuery(api.audioOverviews.getAudioOverview, {
    notebookId: notebookId as never,
  });
  /**
   * Extract a file's text via the server.
   *
   * Every type goes through `/api/process-document`, including plain text that
   * the browser could read locally: that route is what sniffs the magic bytes,
   * so reading a `.txt` here would skip the only real type check (AUDIT.md
   * §3.5).
   *
   * Throws on rejection — an unreadable or unidentifiable file must not be
   * stored, and the server's message says why (unsupported type, scanned PDF,
   * no readable text).
   */
  const extractTextFromFile = async (file: File): Promise<string> => {
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
    return data.content;
  };

  const handleWebSearch = async () => {
    if (!searchQuery.trim()) return;

    setIsSearching(true);
    setShowSearchResults(true);
    setSearchResults([]);

    try {
      const response = await fetch("/api/web-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: searchQuery }),
      });

      const data = await response.json();

      if (data.success && data.results) {
        setSearchResults(data.results);
      } else {
        toast.error(`Search failed: ${data.error || "Unknown error"}`);
      }
    } catch {
      toast.error("Failed to perform web search");
    } finally {
      setIsSearching(false);
    }
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleAddWebResult = async (result: any) => {
    try {
      // Create content with metadata
      const content = `Source: ${result.url}\nTitle: ${result.title}\nDate: ${new Date().toISOString()}\n\n${result.snippet || ""}`;

      const doc = await createDocument({
        notebookId: notebookId as never,
        name: result.title || "Web Result",
        type: "txt", // Treat as text file
        content,
        // No storageId for web results
      });

      // Generate embeddings
      if (content && content.length > 50) {
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
        } catch {
          // Embedding failure is non-fatal — the source is still stored.
        }
      }

      // Remove from search results to indicate added
      setSearchResults((prev) => prev.filter((r) => r.url !== result.url));
      toast.success("Web source added");
    } catch {
      toast.error("Failed to add web source");
    }
  };

  // Handle adding a URL (webpage or YouTube video)
  const handleAddUrl = async () => {
    if (!urlInput.trim()) return;

    // Validate URL
    let url: URL;
    try {
      url = new URL(urlInput.trim());
    } catch {
      toast.error("Please enter a valid URL");
      return;
    }

    setIsProcessingUrl(true);

    try {
      // Call the process-url API
      const response = await fetch("/api/process-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: urlInput.trim() }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to process URL");
      }

      // Determine the document type based on sourceType
      const isYouTube = data.sourceType === "youtube";
      const docType = isYouTube ? "youtube" : "url";

      // Create the document with the processed content
      const doc = await createDocument({
        notebookId: notebookId as never,
        name: data.title || url.hostname,
        type: docType,
        content: data.content,
        sourceType: data.sourceType,
        sourceUrl: urlInput.trim(),
        thumbnailUrl: data.thumbnailUrl,
        metadata: JSON.stringify({
          author: data.author,
          description: data.description,
          siteName: data.siteName,
          publishedDate: data.publishedDate,
          videoId: data.videoId,
        }),
      });

      // Generate embeddings for the content
      if (data.content && data.content.length > 50) {
        try {
          await fetch("/api/embeddings", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              documentId: doc,
              notebookId,
              content: data.content,
              documentName: data.title,
            }),
          });
        } catch {
          // Embedding failure is non-fatal — the source is still stored.
        }
      }

      // Clear the input and hide
      setUrlInput("");
      setShowUrlInput(false);
      toast.success("URL added successfully");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to add URL");
    } finally {
      setIsProcessingUrl(false);
    }
  };

  // Handle generating audio overview
  const handleGenerateAudioOverview = async () => {
    if (!documents || documents.length === 0) {
      toast.warning(
        "Please add some sources first to generate an audio overview."
      );
      return;
    }

    setIsGeneratingAudio(true);
    setAudioScript(undefined);

    try {
      // Create a "generating" record
      await createAudioOverview({
        notebookId: notebookId as never,
        status: "generating",
      });

      // Only the notebook id goes over the wire — the route reads the source
      // text from Convex itself, and rejects a notebook with nothing to
      // narrate (AUDIT.md §4.7).
      const response = await fetch("/api/audio-overview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          notebookId,
          notebookTitle: "Your Research",
          duration: "short", // 3-5 minutes
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to generate audio overview");
      }

      // Persist the storage id — the reactive query picks it up and resolves it
      // to a playable URL, so nothing here holds the audio in memory.
      await createAudioOverview({
        notebookId: notebookId as never,
        status: data.audio?.available ? "ready" : "script_only",
        scriptText: data.script,
        audioStorageId: data.audio?.storageId,
        duration: data.estimatedDuration,
      });

      setAudioScript(data.script);

      toast.success(
        data.audio?.available
          ? "Audio overview generated!"
          : `Script ready. ${data.audio?.message ?? "Audio unavailable"}.`
      );
    } catch (error) {
      // Update record with error
      await createAudioOverview({
        notebookId: notebookId as never,
        status: "error",
        errorMessage: error instanceof Error ? error.message : "Unknown error",
      });

      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to generate audio overview"
      );
    } finally {
      setIsGeneratingAudio(false);
    }
  };

  // Mirror a persisted script into local state. The audio URL is read straight
  // from the query at render time — it needs no local copy.
  React.useEffect(() => {
    if (existingAudioOverview?.scriptText) {
      setAudioScript(existingAudioOverview.scriptText);
    }
  }, [existingAudioOverview]);

  const handleFiles = async (files: FileList) => {
    const validFiles = Array.from(files).filter(
      (file) => file.type in ACCEPTED_TYPES
    );
    if (validFiles.length === 0) {
      toast.error("Please upload PDF, DOCX, or TXT files only.");
      return;
    }

    // A 200-file drop would fire 200 sequential uploads and 200 embedding runs.
    // The real ceiling is `MAX_DOCUMENTS_PER_NOTEBOOK` in `createDocument`,
    // which the client cannot bypass; this is the friendly version of it.
    if (validFiles.length > MAX_FILES_PER_UPLOAD) {
      toast.error(`Please upload at most ${MAX_FILES_PER_UPLOAD} files at once.`);
      return;
    }

    setIsUploading(true);
    let succeeded = 0;

    // Per-file error handling: one unreadable file used to abort the whole
    // batch, discarding files that had already been processed.
    for (let i = 0; i < validFiles.length; i++) {
      const file = validFiles[i];

      try {
        setUploadProgress(
          `Processing ${i + 1}/${validFiles.length}: ${file.name}`
        );

        // Before the upload, so a file the server cannot identify is never
        // stored at all.
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
          name: file.name,
          type: ACCEPTED_TYPES[file.type as keyof typeof ACCEPTED_TYPES],
          content,
          storageId,
        });

        // Generate embeddings for the document (in background)
        // No placeholder-string checks needed: extraction failure is a 422 that
        // throws above, so reaching here means real text (AUDIT.md §4.10).
        if (content.length > 50) {
          setUploadProgress(
            `Indexing ${i + 1}/${validFiles.length}: ${file.name}`
          );
          try {
            await fetch("/api/embeddings", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                documentId: doc,
                notebookId,
                content,
                documentName: file.name,
              }),
            });
          } catch {
            // Continue even if embedding fails — the document is stored.
          }
        }

        succeeded++;
      } catch (error) {
        const reason =
          error instanceof Error ? error.message : "Please try again.";
        toast.error(`${file.name}: ${reason}`);
      }
    }

    setUploadProgress("");
    setIsUploading(false);

    if (succeeded > 0) {
      toast.success(`Uploaded ${succeeded} file(s) successfully`);
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
    setDeleteTarget({ type: "multiple" });
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = () => {
    if (deleteTarget?.type === "multiple") {
      for (const docId of selectedDocs) {
        onDeleteDocument(docId);
      }
      setSelectedDocs(new Set());
      toast.success(`Deleted ${selectedDocs.size} source(s)`);
    } else if (deleteTarget?.type === "single" && deleteTarget.docId) {
      onDeleteDocument(deleteTarget.docId);
      toast.success("Source deleted");
    }
    setDeleteDialogOpen(false);
    setDeleteTarget(null);
  };

  const handleDeleteSingle = (docId: string) => {
    setDeleteTarget({ type: "single", docId });
    setDeleteDialogOpen(true);
  };

  const getFileIcon = (type: string, size: "sm" | "md" = "sm") => {
    const sizeClass = size === "sm" ? "size-4" : "size-5";
    const colors: Record<string, string> = {
      pdf: "text-red-500",
      docx: "text-blue-500",
      doc: "text-blue-500",
      txt: "text-gray-500",
      md: "text-gray-500",
      url: "text-green-500",
      youtube: "text-red-600",
    };
    const color = colors[type.toLowerCase()] || "text-muted-foreground";

    // YouTube icon
    if (type.toLowerCase() === "youtube") {
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
          <path d="M2.5 17a24.12 24.12 0 0 1 0-10 2 2 0 0 1 1.4-1.4 49.56 49.56 0 0 1 16.2 0A2 2 0 0 1 21.5 7a24.12 24.12 0 0 1 0 10 2 2 0 0 1-1.4 1.4 49.55 49.55 0 0 1-16.2 0A2 2 0 0 1 2.5 17" />
          <path d="m10 15 5-3-5-3z" />
        </svg>
      );
    }

    // URL/Globe icon
    if (type.toLowerCase() === "url") {
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
          <circle cx="12" cy="12" r="10" />
          <path d="M2 12h20" />
          <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
        </svg>
      );
    }

    // Default file icon
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
      <div className="flex items-center justify-between border-b border-border/40 px-3 py-3 sm:px-4">
        {/* The grid button that used to sit here had no onClick and no label —
            a control that did nothing. Deleted rather than named. */}
        <h2 className="font-semibold">Sources</h2>
      </div>

      {/* Add Sources Button */}
      <div className="border-b border-border/40 p-3">
        <div className="flex gap-2">
          <Button
            variant="outline"
            className="flex-1 justify-center gap-2"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading || isProcessingUrl}
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
            disabled={isUploading || isProcessingUrl}
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

        {/* URL Input Section */}
        {showUrlInput && (
          <div className="mt-3 space-y-2">
            <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="size-4 text-muted-foreground shrink-0"
              >
                <circle cx="12" cy="12" r="10" />
                <path d="M2 12h20" />
                <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
              </svg>
              <input
                type="url"
                placeholder="Paste URL (webpage or YouTube)"
                className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAddUrl()}
                disabled={isProcessingUrl}
              />
              {isProcessingUrl && (
                <div
                  role="status"
                  aria-label="Importing the URL"
                  className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent"
                />
              )}
            </div>
            <div className="flex items-center justify-between">
              <p className="text-[10px] text-muted-foreground">
                Supports webpages, articles, and YouTube videos
              </p>
              <Button
                size="sm"
                className="h-7 px-3 text-xs"
                onClick={handleAddUrl}
                disabled={!urlInput.trim() || isProcessingUrl}
              >
                {isProcessingUrl ? "Processing..." : "Add URL"}
              </Button>
            </div>
          </div>
        )}
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
              <div
                role="status"
                aria-label="Searching the web"
                className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent"
              />
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

      {/* Audio Overview Section */}
      <div className="border-b border-border/40 p-3">
        <div className="flex items-center justify-between mb-2">
          <button
            onClick={() => setShowAudioSection(!showAudioSection)}
            className="flex items-center gap-2 text-sm font-medium hover:text-foreground"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="size-4 text-purple-500"
            >
              <path d="M12 6V2H8" />
              <path d="m8 18-4 4V8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2Z" />
              <path d="M2 12h2" />
              <path d="M9 11v2" />
              <path d="M12 11v2" />
              <path d="M15 11v2" />
            </svg>
            Audio Overview
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={`size-3 transition-transform ${showAudioSection ? "rotate-180" : ""}`}
            >
              <path d="m6 9 6 6 6-6" />
            </svg>
          </button>
          <span className="text-[10px] text-muted-foreground bg-gradient-to-r from-purple-500/20 to-blue-500/20 px-2 py-0.5 rounded-full">
            AI Podcast
          </span>
        </div>

        {showAudioSection && (
          <div className="space-y-3">
            {/* Show existing audio or generate button */}
            {existingAudioOverview?.audioUrl ||
            audioScript ||
            existingAudioOverview?.scriptText ? (
              <AudioPlayer
                audioUrl={existingAudioOverview?.audioUrl ?? undefined}
                scriptText={audioScript || existingAudioOverview?.scriptText}
                title="Audio Overview"
                onRegenerate={handleGenerateAudioOverview}
                isGenerating={isGeneratingAudio}
              />
            ) : (
              <div className="bg-gradient-to-br from-purple-900/10 to-blue-900/10 border border-purple-500/20 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 bg-gradient-to-br from-purple-500/20 to-blue-500/20 rounded-lg flex items-center justify-center shrink-0">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="size-5 text-purple-400"
                    >
                      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                      <line x1="12" x2="12" y1="19" y2="22" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="font-medium text-sm">
                      Generate Audio Overview
                    </h4>
                    <p className="text-xs text-muted-foreground mt-1">
                      Create a podcast-style discussion about your sources with
                      two AI hosts.
                    </p>
                  </div>
                </div>
                <Button
                  className="w-full mt-3 bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-600 hover:to-blue-600 text-white"
                  onClick={handleGenerateAudioOverview}
                  disabled={
                    isGeneratingAudio || !documents || documents.length === 0
                  }
                >
                  {isGeneratingAudio ? (
                    <>
                      <svg
                        className="size-4 mr-2 animate-spin"
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
                      Generating...
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
                        className="size-4 mr-2"
                      >
                        <polygon points="6 3 20 12 6 21 6 3" />
                      </svg>
                      Generate Audio Overview
                    </>
                  )}
                </Button>
                {(!documents || documents.length === 0) && (
                  <p className="text-[10px] text-muted-foreground text-center mt-2">
                    Add sources first to generate an overview
                  </p>
                )}
              </div>
            )}
          </div>
        )}
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
                    aria-label={`Include ${doc.name} in answers`}
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
                    onClick={() => handleDeleteSingle(doc._id)}
                    aria-label={`Delete ${doc.name}`}
                    // `focus-visible` as well as `group-hover`, or the control
                    // stays invisible for a keyboard user who has focused it.
                    className="rounded p-1 opacity-0 transition-opacity hover:bg-destructive/10 group-hover:opacity-100 focus-visible:opacity-100"
                  >
                    <svg
                      aria-hidden="true"
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
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
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
