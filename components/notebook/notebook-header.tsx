"use client";

/**
 * Notebook header: back to the dashboard, the editable title, account controls.
 *
 * Split out of the notebook page (AUDIT.md §6.2).
 */

import * as React from "react";
import Link from "next/link";
import { UserButton } from "@clerk/nextjs";
import { ThemeToggle } from "@/components/theme-toggle";

interface NotebookHeaderProps {
  /** `undefined` while the notebook query is still loading. */
  title: string | undefined;
  onRename: (title: string) => Promise<void>;
}

export function NotebookHeader({ title, onRename }: NotebookHeaderProps) {
  const [isEditing, setIsEditing] = React.useState(false);
  const [draft, setDraft] = React.useState("");
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (title) setDraft(title);
  }, [title]);

  React.useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const commit = async () => {
    if (!draft.trim() || draft.trim() === title) {
      setIsEditing(false);
      return;
    }

    await onRename(draft.trim());
    setIsEditing(false);
  };

  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-border/40 bg-background px-3 sm:px-4">
      {/* min-w-0 lets the title truncate instead of shoving the controls off a
          narrow screen. */}
      <div className="flex min-w-0 items-center gap-2 sm:gap-4">
        <Link
          href="/dashboard"
          className="flex items-center gap-2 transition-opacity hover:opacity-80"
        >
          <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="size-5"
              aria-hidden="true"
            >
              <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
              <polyline points="14,2 14,8 20,8" />
              <path d="M8 13h2" />
              <path d="M8 17h2" />
              <path d="M14 13h2" />
              <path d="M14 17h2" />
            </svg>
          </div>
          {/* The mark alone carries it on phones; the wordmark is the first
              thing worth spending width on. */}
          <span className="hidden font-semibold tracking-tight sm:inline">
            docsy
          </span>
        </Link>

        <span className="h-6 w-px shrink-0 bg-border/60" />

        {title === undefined ? (
          <div
            role="status"
            aria-label="Loading the notebook"
            className="h-6 w-40 animate-pulse rounded bg-muted"
          />
        ) : isEditing ? (
          <input
            ref={inputRef}
            type="text"
            value={draft}
            aria-label="Notebook title"
            onChange={(event) => setDraft(event.target.value)}
            onBlur={commit}
            onKeyDown={(event) => {
              if (event.key === "Enter") commit();
              if (event.key === "Escape") {
                setDraft(title);
                setIsEditing(false);
              }
            }}
            className="min-w-0 border-b-2 border-primary bg-transparent text-base font-medium outline-none sm:text-lg"
          />
        ) : (
          <button
            onClick={() => setIsEditing(true)}
            aria-label={`Rename ${title}`}
            className="truncate text-base font-medium hover:text-muted-foreground sm:text-lg"
          >
            {title}
          </button>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-1 sm:gap-2">
        <ThemeToggle />
        <UserButton />
      </div>
    </header>
  );
}
