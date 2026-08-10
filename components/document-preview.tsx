"use client";

import * as React from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Cancel01Icon } from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

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
  const highlightRef = React.useRef<HTMLElement>(null);

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
    // Radix owns the modal semantics now: focus is trapped while it is open and
    // restored to whatever opened it, and Escape and the backdrop close it
    // without handlers of our own (AUDIT.md §9.4).
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        showCloseButton={false}
        className="flex h-[92dvh] max-w-[calc(100%-1rem)] flex-col gap-0 rounded-xl p-0 text-sm sm:h-[85dvh] sm:max-w-4xl"
      >
        {/* Header */}
        <DialogHeader className="flex-row items-center justify-between gap-2 border-b border-border/40 px-4 py-3 sm:px-6 sm:py-4">
          <div className="flex min-w-0 items-center gap-3">
            {getFileIcon(document.type)}
            <div className="min-w-0">
              <DialogTitle className="truncate text-base font-semibold">
                {document.name}
              </DialogTitle>
              <DialogDescription className="text-xs">
                Added {formatDate(document.createdAt)}
                {highlightRange?.pageNumber && (
                  <span className="ml-2 text-primary">
                    • Viewing Page {highlightRange.pageNumber}
                  </span>
                )}
              </DialogDescription>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {highlightRange && (
              <span className="hidden rounded-full bg-yellow-100 dark:bg-yellow-900/30 px-2.5 py-0.5 text-xs font-medium text-yellow-700 dark:text-yellow-300 sm:inline">
                Source highlighted
              </span>
            )}
            <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium uppercase">
              {document.type}
            </span>
            <DialogClose asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Close the preview"
              >
                <HugeiconsIcon
                  icon={Cancel01Icon}
                  strokeWidth={2}
                  className="size-5"
                />
              </Button>
            </DialogClose>
          </div>
        </DialogHeader>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
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
        <DialogFooter className="flex-row items-center justify-between border-t border-border/40 px-4 py-3 sm:px-6">
          <p className="text-xs text-muted-foreground">
            {document.content
              ? `${document.content.length.toLocaleString()} characters`
              : "No content"}
          </p>
          <DialogClose asChild>
            <Button>Close</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
