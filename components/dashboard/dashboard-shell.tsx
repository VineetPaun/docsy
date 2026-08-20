"use client";

/**
 * Dashboard composition (AUDIT.md §6.2).
 *
 * `app/dashboard/page.tsx` is a Server Component that calls `auth.protect()`
 * before this renders, so there is no `if (!user) return "Access Denied"`
 * branch here any more: an anonymous request never reaches this component
 * (§6.7). What is left is layout plus the delete confirmation, which spans the
 * grid and the dialog.
 */

import * as React from "react";
import { Button } from "@/components/ui/button";
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
import { CreateNotebookForm } from "./create-notebook-form";
import { DashboardHeader } from "./dashboard-header";
import { NotebookGrid } from "./notebook-grid";
import { useNotebooks } from "./hooks/use-notebooks";

export function DashboardShell() {
  const { notebooks, isConvexAvailable, createNotebook, deleteNotebook } =
    useNotebooks();

  const [isCreating, setIsCreating] = React.useState(false);
  const [pendingDelete, setPendingDelete] = React.useState<string | null>(null);

  return (
    <>
      {/* `dvh`, not `vh`: iOS Safari's toolbar makes the two differ. */}
      <div className="min-h-dvh bg-background">
        <DashboardHeader />

        {!isConvexAvailable && (
          <div className="border-b border-yellow-500/20 bg-yellow-500/10 px-4 py-2 text-center text-sm text-yellow-700 dark:text-yellow-400">
            Demo Mode: Convex is not configured. Data is stored locally and will
            be lost on refresh.
          </div>
        )}

        <main className="container mx-auto max-w-6xl px-4 py-8">
          {/* Stacked below `sm`; the title and a right-aligned button do not
              fit on a 375px viewport (AUDIT.md §9.1). */}
          <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-2xl font-bold sm:text-3xl">Your Notebooks</h1>
              <p className="mt-1 text-muted-foreground">
                Create and manage your document collections
              </p>
            </div>
            <Button
              onClick={() => setIsCreating(true)}
              className="w-full sm:w-auto"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="mr-2 size-4"
                aria-hidden="true"
              >
                <path d="M12 5v14" />
                <path d="M5 12h14" />
              </svg>
              New Notebook
            </Button>
          </div>

          {isCreating && (
            <CreateNotebookForm
              onCreate={async (title) => {
                const created = await createNotebook(title);
                if (created) setIsCreating(false);
                return created;
              }}
              onCancel={() => setIsCreating(false)}
            />
          )}

          <NotebookGrid
            notebooks={notebooks}
            onCreate={() => setIsCreating(true)}
            onDelete={setPendingDelete}
          />
        </main>
      </div>

      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Notebook</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the notebook, its sources and its
              conversation. It cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingDelete) deleteNotebook(pendingDelete);
                setPendingDelete(null);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
