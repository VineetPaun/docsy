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
import { NotebookChat, type Citation } from "@/components/notebook-chat";
import {
  DocumentPreview,
  type HighlightRange,
} from "@/components/document-preview";
import { CanvasEditor } from "@/components/canvas-editor";
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
  canvasContent?: string;
  canvasHtml?: string;
}

// Tab type for the right panel
type RightPanelTab = "chat" | "write";

export default function NotebookPage() {
  const params = useParams();
  const notebookId = params.id as string;
  const { user, isLoaded } = useUser();
  const [isEditingTitle, setIsEditingTitle] = React.useState(false);
  const [editedTitle, setEditedTitle] = React.useState("");
  const titleInputRef = React.useRef<HTMLInputElement>(null);

  // Tab state for Chat vs Write mode
  const [activeTab, setActiveTab] = React.useState<RightPanelTab>("chat");

  // Citation preview state
  const [previewDocument, setPreviewDocument] = React.useState<Document | null>(
    null
  );
  const [highlightRange, setHighlightRange] = React.useState<
    HighlightRange | undefined
  >(undefined);

  const notebook = useQuery(
    api.notebooks.getNotebook,
    user ? { notebookId: notebookId as never, clerkId: user.id } : "skip"
  ) as Notebook | null | undefined;

  const documents = useQuery(
    api.documents.getDocuments,
    user && notebook
      ? { notebookId: notebookId as never, clerkId: user.id }
      : "skip"
  ) as Document[] | undefined;

  const deleteDocument = useMutation(api.documents.deleteDocument);
  const updateNotebook = useMutation(api.notebooks.updateNotebook);

  const handleDeleteDocument = async (documentId: string) => {
    if (!user) return;
    try {
      await deleteDocument({
        documentId: documentId as never,
        clerkId: user.id,
      });
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

  // Handle citation click - open document preview with highlight
  const handleCitationClick = React.useCallback(
    (citation: Citation) => {
      // Find the document by ID
      const doc = documents?.find((d) => d._id === citation.documentId);
      if (doc) {
        setPreviewDocument(doc);
        setHighlightRange({
          startChar: citation.startChar,
          endChar: citation.endChar,
          pageNumber: citation.pageNumber,
        });
      }
    },
    [documents]
  );

  // Close preview handler
  const handleClosePreview = React.useCallback(() => {
    setPreviewDocument(null);
    setHighlightRange(undefined);
  }, []);

  // Handle canvas content changes
  const handleCanvasChange = React.useCallback(
    async (content: string, html: string) => {
      if (!user || !notebook) return;
      try {
        await updateNotebook({
          notebookId: notebook._id as never,
          clerkId: user.id,
          canvasContent: content,
          canvasHtml: html,
        });
      } catch (error) {
        console.error("Failed to save canvas:", error);
      }
    },
    [user, notebook, updateNotebook]
  );

  if (!isLoaded) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
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
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="text-center">
          <h1 className="text-2xl font-bold">Access Denied</h1>
          <p className="mt-2 text-muted-foreground">
            Please sign in to access this notebook.
          </p>
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
          <p className="mt-2 text-muted-foreground">
            This notebook doesn&apos;t exist or you don&apos;t have access.
          </p>
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
          <div className="flex items-center gap-4">
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
                >
                  <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
                  <polyline points="14,2 14,8 20,8" />
                  <path d="M8 13h2" />
                  <path d="M8 17h2" />
                  <path d="M14 13h2" />
                  <path d="M14 17h2" />
                </svg>
              </div>
              <span className="font-semibold tracking-tight">docsy</span>
            </Link>

            <span className="h-6 w-px bg-border/60" />

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
            {/* Mode Tabs */}
            <div className="flex items-center rounded-lg bg-muted p-0.5">
              <button
                onClick={() => setActiveTab("chat")}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  activeTab === "chat"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
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
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
                Chat
              </button>
              <button
                onClick={() => setActiveTab("write")}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  activeTab === "write"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
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
                  <path d="M12 20h9" />
                  <path d="M16.376 3.622a1 1 0 0 1 3.002 3.002L7.368 18.635a2 2 0 0 1-.855.506l-2.872.838a.5.5 0 0 1-.62-.62l.838-2.872a2 2 0 0 1 .506-.855z" />
                </svg>
                Write
              </button>
            </div>
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

          {/* Right Panel - Chat or Write */}
          <div className="flex-1">
            {activeTab === "chat" ? (
              <NotebookChat
                documents={documents}
                notebookId={notebookId}
                notebookTitle={notebook?.title ?? "Notebook"}
                onCitationClick={handleCitationClick}
              />
            ) : (
              <CanvasEditor
                initialContent={notebook?.canvasContent}
                onContentChange={handleCanvasChange}
                notebookTitle={notebook?.title}
              />
            )}
          </div>
        </div>

        {/* Document Preview Modal for Citations */}
        <DocumentPreview
          document={previewDocument}
          onClose={handleClosePreview}
          highlightRange={highlightRange}
        />
      </div>
    </>
  );
}
