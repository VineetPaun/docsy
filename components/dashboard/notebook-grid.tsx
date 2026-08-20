"use client";

/**
 * The notebook grid, plus its loading and empty states.
 *
 * Split out of `app/dashboard/page.tsx` (AUDIT.md §6.2).
 */

import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { Notebook } from "./hooks/use-notebooks";

function NotebookIcon({ className }: { className: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
      <polyline points="14,2 14,8 20,8" />
    </svg>
  );
}

interface NotebookGridProps {
  notebooks: Notebook[] | undefined;
  onCreate: () => void;
  onDelete: (notebookId: string) => void;
}

export function NotebookGrid({
  notebooks,
  onCreate,
  onDelete,
}: NotebookGridProps) {
  if (notebooks === undefined) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[...Array(3)].map((_, i) => (
          <Card
            key={i}
            role="status"
            aria-label="Loading notebooks"
            className="animate-pulse"
          >
            <CardHeader>
              <div className="h-5 w-32 rounded bg-muted" />
            </CardHeader>
            <CardContent>
              <div className="h-4 w-24 rounded bg-muted" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (notebooks.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center justify-center px-4 py-16 text-center">
          <div className="flex size-16 items-center justify-center rounded-full bg-muted">
            <NotebookIcon className="size-8 text-muted-foreground" />
          </div>
          <h3 className="mt-4 text-lg font-semibold">No notebooks yet</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            A notebook holds your sources and the conversation about them.
          </p>
          <Button className="mt-4" onClick={onCreate}>
            Create Notebook
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {notebooks.map((notebook) => (
        <Card
          key={notebook._id}
          className="group relative transition-shadow hover:shadow-md"
        >
          {/* pr-10 on the header keeps a long title clear of the delete button. */}
          <Link href={`/notebook/${notebook._id}`} className="block">
            <CardHeader className="pr-12">
              <CardTitle className="flex min-w-0 items-center gap-2">
                <NotebookIcon className="size-5 shrink-0 text-muted-foreground" />
                <span className="truncate">{notebook.title}</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="line-clamp-2 text-sm text-muted-foreground">
                {notebook.description || "No description"}
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                Updated {new Date(notebook.updatedAt).toLocaleDateString()}
              </p>
            </CardContent>
          </Link>

          {/*
            Visible on touch, hover-revealed from `md` up: an `opacity-0`
            control that only appears on :hover cannot be reached on a phone
            (AUDIT.md §9.1).
          */}
          <button
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onDelete(notebook._id);
            }}
            aria-label={`Delete ${notebook.title}`}
            className="absolute right-3 top-3 rounded-md p-1 hover:bg-destructive/10 md:opacity-0 md:transition-opacity md:group-hover:opacity-100 md:focus-visible:opacity-100"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="size-4 text-destructive"
              aria-hidden="true"
            >
              <path d="M3 6h18" />
              <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
              <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
            </svg>
          </button>
        </Card>
      ))}
    </div>
  );
}
