"use client";

import { useUser, UserButton } from "@clerk/nextjs";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ThemeToggle } from "@/components/theme-toggle";
import { UserSync } from "@/components/user-sync";
import { useConvexAvailable } from "@/components/providers/convex-provider";
import { mockNotebooks } from "@/hooks/use-convex-status";
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
import { toast } from "sonner";
import * as React from "react";

interface Notebook {
  _id: string;
  title: string;
  description?: string;
  createdAt: number;
  updatedAt: number;
}

export default function DashboardPage() {
  const { user, isLoaded } = useUser();
  const isConvexAvailable = useConvexAvailable();

  // Only use Convex hooks when available
  const convexNotebooks = useQuery(
    api.notebooks.getNotebooks,
    isConvexAvailable && user ? { clerkId: user.id } : "skip"
  ) as Notebook[] | undefined;

  const createNotebookMutation = useMutation(api.notebooks.createNotebook);
  const deleteNotebookMutation = useMutation(api.notebooks.deleteNotebook);

  // Use mock data when Convex is not available
  const [localNotebooks, setLocalNotebooks] = React.useState<Notebook[]>([]);
  const notebooks = isConvexAvailable ? convexNotebooks : localNotebooks;

  React.useEffect(() => {
    if (!isConvexAvailable) {
      setLocalNotebooks(mockNotebooks as Notebook[]);
    }
  }, [isConvexAvailable]);

  const [isCreating, setIsCreating] = React.useState(false);
  const [newTitle, setNewTitle] = React.useState("");
  const [deleteDialogOpen, setDeleteDialogOpen] = React.useState(false);
  const [notebookToDelete, setNotebookToDelete] = React.useState<string | null>(
    null
  );

  const handleCreateNotebook = async () => {
    if (!user || !newTitle.trim()) return;

    if (isConvexAvailable) {
      try {
        await createNotebookMutation({
          clerkId: user.id,
          title: newTitle.trim(),
        });
        setNewTitle("");
        setIsCreating(false);
      } catch (error) {
        console.error("Failed to create notebook:", error);
      }
    } else {
      // Mock create
      const newNotebook: Notebook = {
        _id: `mock-${Date.now()}`,
        title: newTitle.trim(),
        description: undefined,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      setLocalNotebooks((prev) => [newNotebook, ...prev]);
      setNewTitle("");
      setIsCreating(false);
    }
  };

  const handleDeleteNotebook = async (notebookId: string) => {
    if (!user) return;

    if (isConvexAvailable) {
      try {
        await deleteNotebookMutation({
          clerkId: user.id,
          notebookId: notebookId as never,
        });
        toast.success("Notebook deleted");
      } catch (error) {
        console.error("Failed to delete notebook:", error);
        toast.error("Failed to delete notebook");
      }
    } else {
      // Mock delete
      setLocalNotebooks((prev) => prev.filter((n) => n._id !== notebookId));
      toast.success("Notebook deleted");
    }
  };

  const handleConfirmDelete = () => {
    if (notebookToDelete) {
      handleDeleteNotebook(notebookToDelete);
    }
    setDeleteDialogOpen(false);
    setNotebookToDelete(null);
  };

  if (!isLoaded) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="flex items-center gap-2">
          <svg
            className="size-5 animate-spin text-muted-foreground"
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
          <span className="text-muted-foreground">Loading...</span>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold">Access Denied</h1>
          <p className="mt-2 text-muted-foreground">
            Please sign in to access the dashboard.
          </p>
          <Button asChild className="mt-4">
            <Link href="/sign-in">Sign In</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <>
      <UserSync />
      <div className="min-h-screen bg-background">
        {/* Header */}
        <header className="sticky top-0 z-50 border-b border-border/40 bg-background/80 backdrop-blur-xl">
          <div className="container mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
            <Link href="/" className="flex items-center gap-2">
              <div className="flex size-8 items-center justify-center rounded-lg bg-foreground">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="size-5 text-background"
                >
                  <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
                  <polyline points="14,2 14,8 20,8" />
                  <path d="M8 13h2" />
                  <path d="M8 17h2" />
                  <path d="M14 13h2" />
                  <path d="M14 17h2" />
                </svg>
              </div>
              <span className="text-xl font-semibold tracking-tight">
                docsy
              </span>
            </Link>

            <div className="flex items-center gap-4">
              <ThemeToggle />
              <UserButton />
            </div>
          </div>
        </header>

        {/* Demo mode banner */}
        {!isConvexAvailable && (
          <div className="border-b border-yellow-500/20 bg-yellow-500/10 px-4 py-2 text-center text-sm text-yellow-700 dark:text-yellow-400">
            Demo Mode: Convex is not configured. Data is stored locally and will
            be lost on refresh.
          </div>
        )}

        {/* Main content */}
        <main className="container mx-auto max-w-6xl px-4 py-8">
          <div className="mb-8 flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold">Your Notebooks</h1>
              <p className="mt-1 text-muted-foreground">
                Create and manage your document collections
              </p>
            </div>
            <Button onClick={() => setIsCreating(true)}>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="mr-2 size-4"
              >
                <path d="M12 5v14" />
                <path d="M5 12h14" />
              </svg>
              New Notebook
            </Button>
          </div>

          {/* Create notebook form */}
          {isCreating && (
            <Card className="mb-6">
              <CardContent className="pt-6">
                <div className="flex gap-4">
                  <input
                    type="text"
                    placeholder="Notebook title..."
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleCreateNotebook();
                      if (e.key === "Escape") setIsCreating(false);
                    }}
                    autoFocus
                  />
                  <Button
                    onClick={handleCreateNotebook}
                    disabled={!newTitle.trim()}
                  >
                    Create
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setIsCreating(false)}
                  >
                    Cancel
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Notebooks grid */}
          {notebooks === undefined ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {[...Array(3)].map((_, i) => (
                <Card key={i} className="animate-pulse">
                  <CardHeader>
                    <div className="h-5 w-32 rounded bg-muted" />
                  </CardHeader>
                  <CardContent>
                    <div className="h-4 w-24 rounded bg-muted" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : notebooks.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-16">
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
                  </svg>
                </div>
                <h3 className="mt-4 text-lg font-semibold">No notebooks yet</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Create your first notebook to get started
                </p>
                <Button className="mt-4" onClick={() => setIsCreating(true)}>
                  Create Notebook
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {notebooks.map((notebook) => (
                <Card
                  key={notebook._id}
                  className="group relative transition-shadow hover:shadow-md"
                >
                  <Link href={`/notebook/${notebook._id}`}>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className="size-5 text-muted-foreground"
                        >
                          <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
                          <polyline points="14,2 14,8 20,8" />
                        </svg>
                        {notebook.title}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-muted-foreground">
                        {notebook.description || "No description"}
                      </p>
                      <p className="mt-2 text-xs text-muted-foreground">
                        Updated{" "}
                        {new Date(notebook.updatedAt).toLocaleDateString()}
                      </p>
                    </CardContent>
                  </Link>
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setNotebookToDelete(notebook._id);
                      setDeleteDialogOpen(true);
                    }}
                    className="absolute right-3 top-3 rounded-md p-1 opacity-0 transition-opacity hover:bg-destructive/10 group-hover:opacity-100"
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
                    >
                      <path d="M3 6h18" />
                      <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                      <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                    </svg>
                  </button>
                </Card>
              ))}
            </div>
          )}
        </main>
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Notebook</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this notebook? This will
              permanently remove the notebook and all its sources. This action
              cannot be undone.
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
    </>
  );
}
