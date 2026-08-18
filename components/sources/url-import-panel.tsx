"use client";

/**
 * Import a webpage or YouTube video as a source.
 *
 * Split out of `sources-panel.tsx` (AUDIT.md §6.2). The fetch itself happens on
 * the server: `/api/process-url` runs the URL through `lib/url-guard.ts`, so a
 * user-supplied address never reaches a bare `fetch` (CLAUDE.md trap 5b).
 */

import * as React from "react";
import { useMutation } from "convex/react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { convexErrorMessage } from "@/lib/convex-error";
import { indexDocument } from "@/lib/source-upload";

interface UrlImportPanelProps {
  notebookId: string;
  /** Open/closed lives in the panel header, which owns the toggle button. */
  open: boolean;
  onImported: () => void;
  onBusyChange: (busy: boolean) => void;
}

export function UrlImportPanel({
  notebookId,
  open,
  onImported,
  onBusyChange,
}: UrlImportPanelProps) {
  const [urlInput, setUrlInput] = React.useState("");
  const [isProcessing, setIsProcessing] = React.useState(false);

  const createDocument = useMutation(api.documents.createDocument);
  const setIndexStatus = useMutation(api.documents.setIndexStatus);

  // The parent disables Upload while a URL is in flight and vice versa.
  React.useEffect(() => onBusyChange(isProcessing), [isProcessing, onBusyChange]);

  const handleAddUrl = async () => {
    if (!urlInput.trim()) return;

    let url: URL;
    try {
      url = new URL(urlInput.trim());
    } catch {
      toast.error("Please enter a valid URL");
      return;
    }

    setIsProcessing(true);

    try {
      const response = await fetch("/api/process-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: urlInput.trim() }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to process URL");
      }

      const isYouTube = data.sourceType === "youtube";

      const documentId = await createDocument({
        notebookId: notebookId as never,
        name: data.title || url.hostname,
        type: isYouTube ? "youtube" : "url",
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

      const status = await indexDocument({
        documentId,
        notebookId,
        content: data.content ?? "",
        documentName: data.title,
      });

      await setIndexStatus({ documentId: documentId as never, status }).catch(
        () => {
          // The badge is nice to have; the source is already stored.
        }
      );

      setUrlInput("");
      onImported();

      if (status === "indexed") {
        toast.success("URL added successfully");
      } else {
        toast.warning(
          "URL added, but it could not be indexed — chat cannot cite it yet."
        );
      }
    } catch (error) {
      // Caps and quotas arrive as ConvexErrors, whose text is on `.data`.
      toast.error(convexErrorMessage(error, "Failed to add URL"));
    } finally {
      setIsProcessing(false);
    }
  };

  if (!open) return null;

  return (
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
          className="size-4 shrink-0 text-muted-foreground"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="10" />
          <path d="M2 12h20" />
          <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
        </svg>
        <input
          type="url"
          placeholder="Paste URL (webpage or YouTube)"
          aria-label="Source URL"
          className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          value={urlInput}
          onChange={(e) => setUrlInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleAddUrl()}
          disabled={isProcessing}
        />
        {isProcessing && (
          <div
            role="status"
            aria-label="Importing the URL"
            className="size-4 animate-spin rounded-full border-2 border-primary border-t-transparent"
          />
        )}
      </div>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] text-muted-foreground">
          Supports webpages, articles, and YouTube videos
        </p>
        <Button
          size="sm"
          className="h-7 shrink-0 px-3 text-xs"
          onClick={handleAddUrl}
          disabled={!urlInput.trim() || isProcessing}
        >
          {isProcessing ? "Processing..." : "Add URL"}
        </Button>
      </div>
    </div>
  );
}
