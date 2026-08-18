"use client";

/**
 * The source list: filter, selection, per-source status, rename and delete.
 *
 * Split out of `sources-panel.tsx` (AUDIT.md §6.2), and the home of the §9.6
 * basics it was missing — a source that never made it into the vector store now
 * says so, instead of looking identical to one that did and quietly contributing
 * nothing to every answer.
 */

import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { MIN_INDEXABLE_CHARS } from "@/lib/source-upload";
import { SourceIcon } from "./source-icon";
import type { SourceDocument } from "./types";

/** Above this many sources, scanning the list by eye stops working. */
const FILTER_THRESHOLD = 4;

/**
 * What the badge next to a source says, and why.
 *
 * Order matters: no text at all is worth reporting even if an index attempt was
 * recorded, because that source can never be cited.
 */
function statusBadge(doc: SourceDocument) {
  const length = doc.content?.length ?? 0;

  if (length < MIN_INDEXABLE_CHARS) {
    return {
      label: "No text",
      variant: "destructive" as const,
      title:
        "No readable text was extracted from this source, so chat cannot cite it.",
    };
  }

  if (doc.indexStatus === "failed") {
    return {
      label: "Not indexed",
      variant: "outline" as const,
      title:
        "Stored, but indexing failed — chat cannot cite this source yet. Delete and re-add it to retry.",
    };
  }

  return {
    label: `${Math.round(length / 1000)}k`,
    variant: "secondary" as const,
    title: `${length.toLocaleString()} characters of text${
      doc.indexStatus === "indexed" ? ", indexed for search" : ""
    }`,
  };
}

interface SourceListProps {
  documents: SourceDocument[] | undefined;
  selectedDocs: Set<string>;
  onToggle: (docId: string) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onPreview: (doc: SourceDocument) => void;
  onRename: (doc: SourceDocument) => void;
  onDeleteOne: (docId: string) => void;
  onDeleteSelected: () => void;
}

export function SourceList({
  documents,
  selectedDocs,
  onToggle,
  onSelectAll,
  onDeselectAll,
  onPreview,
  onRename,
  onDeleteOne,
  onDeleteSelected,
}: SourceListProps) {
  const [filter, setFilter] = React.useState("");

  const visible = React.useMemo(() => {
    if (!documents) return [];
    const query = filter.trim().toLowerCase();
    if (!query) return documents;

    return documents.filter((doc) => doc.name.toLowerCase().includes(query));
  }, [documents, filter]);

  if (documents === undefined) {
    return (
      <div className="space-y-2 p-4">
        {[...Array(3)].map((_, i) => (
          <div
            key={i}
            role="status"
            aria-label="Loading sources"
            className="flex animate-pulse items-center gap-3 rounded-lg bg-muted/30 p-3"
          >
            <div className="size-4 rounded bg-muted" />
            <div className="h-4 flex-1 rounded bg-muted" />
          </div>
        ))}
      </div>
    );
  }

  if (documents.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center">
        <div className="flex size-12 items-center justify-center rounded-full bg-muted">
          <SourceIcon type="txt" size="md" />
        </div>
        <h3 className="mt-4 font-medium">Saved sources will appear here</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Upload a PDF, DOCX or text file, paste a link, or search the web to add
          your first source.
        </p>
      </div>
    );
  }

  return (
    <div className="p-2">
      {documents.length > FILTER_THRESHOLD && (
        <div className="mb-2 px-1">
          <Input
            type="search"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder={`Filter ${documents.length} sources`}
            aria-label="Filter sources by name"
            className="h-8 text-sm"
          />
        </div>
      )}

      {/* Selection controls. The count reflects the whole notebook, not the
          filtered view, because selection is what chat retrieves from. */}
      <div className="mb-2 flex items-center justify-between px-2 text-xs text-muted-foreground">
        <span>
          {selectedDocs.size} of {documents.length} selected
        </span>
        <div className="flex gap-2">
          {selectedDocs.size > 0 && (
            <button
              onClick={onDeleteSelected}
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
                aria-hidden="true"
              >
                <path d="M3 6h18" />
                <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
              </svg>
              Delete ({selectedDocs.size})
            </button>
          )}
          <div className="mx-1 h-4 w-px bg-border/50" />
          {selectedDocs.size === documents.length ? (
            <button onClick={onDeselectAll} className="hover:text-foreground">
              Deselect all
            </button>
          ) : (
            <button onClick={onSelectAll} className="hover:text-foreground">
              Select all
            </button>
          )}
        </div>
      </div>

      {visible.length === 0 ? (
        <p className="px-2 py-6 text-center text-sm text-muted-foreground">
          No sources match “{filter}”.
        </p>
      ) : (
        <div className="space-y-1">
          {visible.map((doc) => {
            const badge = statusBadge(doc);

            return (
              <div
                key={doc._id}
                className={`group flex items-center gap-3 rounded-lg px-3 py-2 transition-colors hover:bg-muted/50 ${
                  selectedDocs.has(doc._id) ? "bg-muted/50" : ""
                }`}
              >
                <input
                  type="checkbox"
                  checked={selectedDocs.has(doc._id)}
                  onChange={() => onToggle(doc._id)}
                  aria-label={`Include ${doc.name} in answers`}
                  className="size-4 rounded border-border"
                />
                <SourceIcon type={doc.type} />
                <button
                  onClick={() => onPreview(doc)}
                  className="min-w-0 flex-1 text-left"
                >
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-medium hover:underline">
                      {doc.name}
                    </p>
                    <Badge
                      variant={badge.variant}
                      title={badge.title}
                      className="shrink-0 rounded-sm text-[10px]"
                    >
                      {badge.label}
                    </Badge>
                  </div>
                </button>

                {/*
                  Visible by default on touch, hover-revealed from `md` up: an
                  `opacity-0` control that only appears on :hover is unreachable
                  on a phone. `focus-visible` keeps the keyboard path too.
                */}
                <div className="flex shrink-0 items-center gap-0.5 md:opacity-0 md:transition-opacity md:group-hover:opacity-100 md:group-focus-within:opacity-100">
                  <button
                    onClick={() => onRename(doc)}
                    aria-label={`Rename ${doc.name}`}
                    className="rounded p-1 hover:bg-muted"
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
                      className="size-3.5 text-muted-foreground"
                    >
                      <path d="M12 20h9" />
                      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
                    </svg>
                  </button>
                  <button
                    onClick={() => onDeleteOne(doc._id)}
                    aria-label={`Delete ${doc.name}`}
                    className="rounded p-1 hover:bg-destructive/10"
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
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
