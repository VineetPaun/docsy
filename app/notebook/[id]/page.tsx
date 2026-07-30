"use client";

import { useUser, UserButton } from "@clerk/nextjs";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { SourcesPanel } from "@/components/sources-panel";
import { NotebookChat, type Citation } from "@/components/notebook-chat";
import {
  DocumentPreview,
  type HighlightRange,
} from "@/components/document-preview";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
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

type MobileView = "sources" | "chat";

export default function NotebookPage() {
  const params = useParams();
  const notebookId = params.id as string;
  const { user, isLoaded } = useUser();
  // Which panel a phone shows. Ignored from `md` up, where both are visible.
  const [mobileView, setMobileView] = React.useState<MobileView>("chat");
  // Which sources are checked. Owned here because the panel renders the
  // checkboxes and the chat sends the ids to /api/chat. Empty = all sources.
  const [selectedDocs, setSelectedDocs] = React.useState<Set<string>>(
    new Set(),
  );
  const [isEditingTitle, setIsEditingTitle] = React.useState(false);
  const [editedTitle, setEditedTitle] = React.useState("");
  const titleInputRef = React.useRef<HTMLInputElement>(null);

  // Citation preview state
  const [previewDocument, setPreviewDocument] = React.useState<Document | null>(
    null,
  );
  const [highlightRange, setHighlightRange] = React.useState<
    HighlightRange | undefined
  >(undefined);

  // Convex resolves the caller from the Clerk token, so these only need to
  // wait for `user` to confirm a session exists before firing.
  const notebook = useQuery(
    api.notebooks.getNotebook,
    user ? { notebookId: notebookId as never } : "skip",
  ) as Notebook | null | undefined;

  const documents = useQuery(
    api.documents.getDocuments,
    user && notebook ? { notebookId: notebookId as never } : "skip",
  ) as Document[] | undefined;

  const deleteDocument = useMutation(api.documents.deleteDocument);
  const updateNotebook = useMutation(api.notebooks.updateNotebook);

  const handleDeleteDocument = async (documentId: string) => {
    if (!user) return;
    try {
      // Storage file and Qdrant vectors are cascaded server-side by the
      // mutation — the client no longer cleans up after itself.
      await deleteDocument({
        documentId: documentId as never,
      });
    } catch {
      toast.error("Failed to delete source");
    }
  };

  const handleUpdateTitle = async () => {
    if (!user || !notebook || !editedTitle.trim()) return;
    try {
      await updateNotebook({
        notebookId: notebook._id as never,
        title: editedTitle.trim(),
      });
      setIsEditingTitle(false);
    } catch {
      toast.error("Failed to update title");
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
    [documents],
  );

  // Close preview handler
  const handleClosePreview = React.useCallback(() => {
    setPreviewDocument(null);
    setHighlightRange(undefined);
  }, []);

  if (!isLoaded) {
    return (
      <div className="flex h-dvh items-center justify-center bg-background">
        <div role="status" className="flex items-center gap-2">
          <svg
            aria-hidden="true"
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
      <div className="flex h-dvh items-center justify-center bg-background">
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
      <div className="flex h-dvh items-center justify-center bg-background">
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
      <div className="flex h-dvh flex-col bg-background">
        {/* Compact Header */}
        <header className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-border/40 bg-background px-3 sm:px-4">
          {/* min-w-0 lets the title truncate instead of shoving the controls
              off a narrow screen. */}
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
                >
                  <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
                  <polyline points="14,2 14,8 20,8" />
                  <path d="M8 13h2" />
                  <path d="M8 17h2" />
                  <path d="M14 13h2" />
                  <path d="M14 17h2" />
                </svg>
              </div>
              {/* The mark alone carries it on phones; the wordmark is the
                  first thing worth spending width on. */}
              <span className="hidden font-semibold tracking-tight sm:inline">
                docsy
              </span>
            </Link>

            <span className="h-6 w-px shrink-0 bg-border/60" />

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
                className="min-w-0 border-b-2 border-primary bg-transparent text-base font-medium outline-none sm:text-lg"
              />
            ) : (
              <button
                onClick={() => setIsEditingTitle(true)}
                className="truncate text-base font-medium hover:text-muted-foreground sm:text-lg"
              >
                {notebook.title}
              </button>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-1 sm:gap-2">
            <ThemeToggle />
            <UserButton />
          </div>
        </header>

        {/*
          Sources and chat: stacked behind a tab switcher on phones, side by
          side from `md` up. The two `!` utilities are deliberate — the Tabs
          root ships `data-horizontal:flex-col` and `gap-2`, and an attribute
          selector out-specifies a plain `md:flex-row`.
        */}
        <Tabs
          value={mobileView}
          onValueChange={(value) => setMobileView(value as MobileView)}
          className="flex min-h-0 flex-1 gap-0! overflow-hidden md:flex-row!"
        >
          {/*
            Phones only. Both panels stay mounted (`forceMount` below), so
            switching tabs never discards a half-typed question.
          */}
          <TabsList className="mx-3 mt-3 h-9 shrink-0 md:hidden">
            <TabsTrigger value="sources" className="text-sm">
              Sources
              {documents?.length ? ` (${documents.length})` : ""}
            </TabsTrigger>
            <TabsTrigger value="chat" className="text-sm">
              Chat
            </TabsTrigger>
          </TabsList>

          <TabsContent
            value="sources"
            forceMount
            className={cn(
              "min-h-0 overflow-hidden md:block md:w-[40%] md:min-w-[320px] md:max-w-[480px] md:flex-none md:border-r md:border-border/40",
              mobileView === "sources" ? "block" : "hidden"
            )}
          >
            <SourcesPanel
              notebookId={notebookId}
              documents={documents}
              onDeleteDocument={handleDeleteDocument}
              selectedDocs={selectedDocs}
              setSelectedDocs={setSelectedDocs}
            />
          </TabsContent>

          <TabsContent
            value="chat"
            forceMount
            className={cn(
              "min-h-0 overflow-hidden md:block md:flex-1",
              mobileView === "chat" ? "block" : "hidden"
            )}
          >
            <NotebookChat
              documents={documents}
              notebookId={notebookId}
              notebookTitle={notebook?.title ?? "Notebook"}
              selectedDocs={selectedDocs}
              onCitationClick={handleCitationClick}
            />
          </TabsContent>
        </Tabs>

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
