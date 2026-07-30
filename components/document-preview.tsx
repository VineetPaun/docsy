"use client";

import * as React from "react";

interface Document {
  _id: string;
  name: string;
  type: string;
  content?: string;
  storageId?: string;
  createdAt: number;
}

export interface HighlightRange {
  startChar: number;
  endChar: number;
  pageNumber?: number;
}

interface DocumentPreviewProps {
  document: Document | null;
  onClose: () => void;
  highlightRange?: HighlightRange;
}

export function DocumentPreview({
  document,
  onClose,
  highlightRange,
}: DocumentPreviewProps) {
  const modalRef = React.useRef<HTMLDivElement>(null);
  const highlightRef = React.useRef<HTMLElement>(null);
  const contentRef = React.useRef<HTMLDivElement>(null);

  // Scroll to highlight when it changes
  React.useEffect(() => {
    if (highlightRange && highlightRef.current) {
      // Small delay to ensure DOM is ready
      setTimeout(() => {
        highlightRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
      }, 100);
    }
  }, [highlightRange, document]);

  // Close on escape key
  React.useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (document) {
      window.addEventListener("keydown", handleEscape);
    }
    return () => window.removeEventListener("keydown", handleEscape);
  }, [document, onClose]);

  // Close on click outside
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };

  if (!document) return null;

  const getFileIcon = (type: string) => {
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
        className={`size-5 ${color}`}
      >
        <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
        <polyline points="14,2 14,8 20,8" />
      </svg>
    );
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-2 backdrop-blur-sm sm:p-4 bg-black/50"
      onClick={handleBackdropClick}
    >
      {/*
        Hand-rolled dialog semantics. Focus is not trapped here — that comes
        with the move to shadcn's `Dialog`, which also deletes the escape and
        backdrop handlers above (AUDIT.md §9.4).
      */}
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="document-preview-title"
        className="relative flex h-[92dvh] w-full max-w-4xl flex-col rounded-xl border border-border bg-background shadow-2xl sm:h-[85dvh] sm:w-[90vw]"
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-2 border-b border-border/40 px-4 py-3 sm:px-6 sm:py-4">
          <div className="flex min-w-0 items-center gap-3">
            {getFileIcon(document.type)}
            <div className="min-w-0">
              <h2
                id="document-preview-title"
                className="truncate font-semibold"
              >
                {document.name}
              </h2>
              <p className="text-xs text-muted-foreground">
                Added {formatDate(document.createdAt)}
                {highlightRange?.pageNumber && (
                  <span className="ml-2 text-primary">
                    • Viewing Page {highlightRange.pageNumber}
                  </span>
                )}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {highlightRange && (
              <span className="rounded-full bg-yellow-100 dark:bg-yellow-900/30 px-2.5 py-0.5 text-xs font-medium text-yellow-700 dark:text-yellow-300">
                Source highlighted
              </span>
            )}
            <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium uppercase">
              {document.type}
            </span>
            <button
              onClick={onClose}
              aria-label="Close the preview"
              className="rounded-lg p-2 hover:bg-muted transition-colors"
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
                className="size-5"
              >
                <path d="M18 6 6 18" />
                <path d="m6 6 12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <div ref={contentRef} className="flex-1 overflow-y-auto p-6">
          {document.content ? (
            <div className="prose prose-sm dark:prose-invert max-w-none">
              <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed">
                {highlightRange ? (
                  <>
                    {document.content.slice(0, highlightRange.startChar)}
                    <mark
                      ref={highlightRef}
                      className="bg-yellow-200 dark:bg-yellow-800/60 px-0.5 rounded animate-pulse"
                      style={{
                        animationDuration: "2s",
                        animationIterationCount: 3,
                      }}
                    >
                      {document.content.slice(
                        highlightRange.startChar,
                        highlightRange.endChar
                      )}
                    </mark>
                    {document.content.slice(highlightRange.endChar)}
                  </>
                ) : (
                  document.content
                )}
              </pre>
            </div>
          ) : (
            <div className="flex h-full flex-col items-center justify-center text-center">
              <div className="flex size-16 items-center justify-center rounded-full bg-muted">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="size-8 text-muted-foreground"
                >
                  <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
                  <polyline points="14,2 14,8 20,8" />
                  <line x1="16" y1="13" x2="8" y2="13" />
                  <line x1="16" y1="17" x2="8" y2="17" />
                  <line x1="10" y1="9" x2="8" y2="9" />
                </svg>
              </div>
              <h3 className="mt-4 font-medium">No content available</h3>
              <p className="mt-1 text-sm text-muted-foreground max-w-sm">
                The content for this document hasn&apos;t been extracted yet or
                the file format isn&apos;t supported for preview.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-border/40 px-6 py-3">
          <p className="text-xs text-muted-foreground">
            {document.content
              ? `${document.content.length.toLocaleString()} characters`
              : "No content"}
          </p>
          <button
            onClick={onClose}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
