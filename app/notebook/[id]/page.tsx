"use client";

import { useUser, UserButton } from "@clerk/nextjs";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { UserSync } from "@/components/user-sync";
import { SourcesPanel } from "@/components/sources-panel";
import { NotebookChat } from "@/components/notebook-chat";
import * as React from "react";

interface Document {
  _id: string;
  name: string;
  type: string;
  content?: string;
  storageId?: string;
  createdAt: number;
}

interface Notebook {
  _id: string;
  title: string;
  description?: string;
}

export default function NotebookPage() {
  const params = useParams();
  const notebookId = params.id as string;
  const { user, isLoaded } = useUser();
  const [isEditingTitle, setIsEditingTitle] = React.useState(false);
  const [editedTitle, setEditedTitle] = React.useState("");
  const titleInputRef = React.useRef<HTMLInputElement>(null);

  const notebook = useQuery(
    api.notebooks.getNotebook,
    user ? { notebookId: notebookId as never, clerkId: user.id } : "skip"
  ) as Notebook | null | undefined;

  const documents = useQuery(
    api.documents.getDocuments,
    user && notebook ? { notebookId: notebookId as never, clerkId: user.id } : "skip"
  ) as Document[] | undefined;

  const deleteDocument = useMutation(api.documents.deleteDocument);
  const updateNotebook = useMutation(api.notebooks.updateNotebook);

  const handleDeleteDocument = async (documentId: string) => {
    if (!user) return;
    try {
      await deleteDocument({ documentId: documentId as never, clerkId: user.id });
      // Also delete embeddings from Qdrant
      try {
        await fetch(`/api/embeddings?documentId=${documentId}`, {
          method: "DELETE",
        });
      } catch (embedError) {
        console.error("Failed to delete embeddings (non-fatal):", embedError);
      }
    } catch (error) {
      console.error("Failed to delete document:", error);
    }
  };

  const handleUpdateTitle = async () => {
    if (!user || !notebook || !editedTitle.trim()) return;
    try {
      await updateNotebook({
        notebookId: notebook._id as never,
        clerkId: user.id,
        title: editedTitle.trim(),
      });
      setIsEditingTitle(false);
    } catch (error) {
      console.error("Failed to update title:", error);
    }
  };

  React.useEffect(() => {
    if (notebook) {
      setEditedTitle(notebook.title);
    }
  }, [notebook]);

  React.useEffect(() => {
    if (isEditingTitle && titleInputRef.current) {
      titleInputRef.current.focus();
      titleInputRef.current.select();
    }
  }, [isEditingTitle]);

  if (!isLoaded) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="flex items-center gap-2">
          <svg className="size-5 animate-spin text-muted-foreground" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <span className="text-muted-foreground">Loading...</span>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="text-center">
          <h1 className="text-2xl font-bold">Access Denied</h1>
          <p className="mt-2 text-muted-foreground">Please sign in to access this notebook.</p>
          <Button asChild className="mt-4">
            <Link href="/sign-in">Sign In</Link>
          </Button>
        </div>
      </div>
    );
  }

  if (notebook === null) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="text-center">
          <h1 className="text-2xl font-bold">Notebook Not Found</h1>
          <p className="mt-2 text-muted-foreground">This notebook doesn&apos;t exist or you don&apos;t have access.</p>
          <Button asChild className="mt-4">
            <Link href="/dashboard">Back to Dashboard</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <>
      <UserSync />
      <div className="flex h-screen flex-col bg-background">
        {/* Compact Header */}
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-border/40 bg-background px-4">
          <div className="flex items-center gap-3">
            <Link
              href="/dashboard"
              className="flex size-8 items-center justify-center rounded-full hover:bg-muted"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-5">
                <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                <polyline points="9 22 9 12 15 12 15 22" />
              </svg>
            </Link>
            
            {notebook === undefined ? (
              <div className="h-6 w-40 animate-pulse rounded bg-muted" />
            ) : isEditingTitle ? (
              <input
                ref={titleInputRef}
                type="text"
                value={editedTitle}
                onChange={(e) => setEditedTitle(e.target.value)}
                onBlur={handleUpdateTitle}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleUpdateTitle();
                  if (e.key === "Escape") {
                    setEditedTitle(notebook.title);
                    setIsEditingTitle(false);
                  }
                }}
                className="bg-transparent text-lg font-medium outline-none border-b-2 border-primary"
              />
            ) : (
              <button
                onClick={() => setIsEditingTitle(true)}
                className="text-lg font-medium hover:text-muted-foreground"
              >
                {notebook.title}
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <ThemeToggle />
            <UserButton />
          </div>
        </header>

        {/* Main Content - Two Panel Layout */}
        <div className="flex flex-1 overflow-hidden">
          {/* Left Panel - Sources (40%) */}
          <div className="w-[40%] min-w-[320px] max-w-[480px] border-r border-border/40">
            <SourcesPanel
              notebookId={notebookId}
              clerkId={user.id}
              documents={documents}
              onDeleteDocument={handleDeleteDocument}
            />
          </div>

          {/* Right Panel - Chat (60%) */}
          <div className="flex-1">
            <NotebookChat
              documents={documents}
              notebookId={notebookId}
              notebookTitle={notebook?.title ?? "Notebook"}
            />
          </div>
        </div>
      </div>
    </>
  );
}
