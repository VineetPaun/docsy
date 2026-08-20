"use client";

/**
 * The notebook workspace: sources beside chat, or behind a tab switcher.
 *
 * Split out of `app/notebook/[id]/page.tsx`, which is now a Server Component
 * that authenticates before any of this ships (AUDIT.md §6.2, §6.7).
 *
 * Two layouts rather than one, because they are genuinely different components:
 * a draggable split from `md` up (§9.3), tabs below it. Crossing the breakpoint
 * remounts both panels, which is the accepted cost — rotating a phone mid-answer
 * is rare, and the alternative is a panel group being measured while hidden.
 */

import * as React from "react";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import { SourcesPanel } from "@/components/sources/sources-panel";
import { NotebookChat, type Citation } from "@/components/chat/notebook-chat";
import {
  DocumentPreview,
  type HighlightRange,
} from "@/components/document-preview";
import { useDefaultLayout } from "react-resizable-panels";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { useIsDesktop } from "@/lib/use-media-query";
import { convexErrorMessage } from "@/lib/convex-error";
import { NotebookHeader } from "./notebook-header";
import type { SourceDocument } from "@/components/sources/types";

interface Notebook {
  _id: string;
  title: string;
  description?: string;
}

type MobileView = "sources" | "chat";

export function NotebookWorkspace({ notebookId }: { notebookId: string }) {
  const isDesktop = useIsDesktop();

  // Remembers the split someone dragged, so it survives a reload (§9.3).
  const { defaultLayout, onLayoutChanged } = useDefaultLayout({
    id: "docsy-notebook-split",
    onlySaveAfterUserInteractions: true,
  });

  // Which panel a phone shows. Ignored from `md` up, where both are visible.
  const [mobileView, setMobileView] = React.useState<MobileView>("chat");

  // Which sources are checked. Owned here because the panel renders the
  // checkboxes and the chat sends the ids to /api/chat. Empty = all sources.
  const [selectedDocs, setSelectedDocs] = React.useState<Set<string>>(new Set());

  const [previewDocument, setPreviewDocument] =
    React.useState<SourceDocument | null>(null);
  const [highlightRange, setHighlightRange] = React.useState<
    HighlightRange | undefined
  >(undefined);

  // Convex resolves the caller from the Clerk token; the page's server-side
  // `auth.protect()` guarantees there is one by the time this renders.
  const notebook = useQuery(api.notebooks.getNotebook, {
    notebookId: notebookId as never,
  }) as Notebook | null | undefined;

  const documents = useQuery(
    api.documents.getDocuments,
    notebook ? { notebookId: notebookId as never } : "skip"
  ) as SourceDocument[] | undefined;

  const deleteDocument = useMutation(api.documents.deleteDocument);
  const updateNotebook = useMutation(api.notebooks.updateNotebook);

  const handleDeleteDocument = async (documentId: string) => {
    try {
      // Storage file and Qdrant vectors are cascaded server-side by the
      // mutation — the client no longer cleans up after itself.
      await deleteDocument({ documentId: documentId as never });
    } catch (error) {
      toast.error(convexErrorMessage(error, "Failed to delete source"));
    }
  };

  const handleRename = async (title: string) => {
    try {
      await updateNotebook({ notebookId: notebookId as never, title });
    } catch (error) {
      toast.error(convexErrorMessage(error, "Failed to update title"));
    }
  };

  const handleCitationClick = React.useCallback(
    (citation: Citation) => {
      const doc = documents?.find((d) => d._id === citation.documentId);
      if (!doc) return;

      setPreviewDocument(doc);
      setHighlightRange({
        startChar: citation.startChar,
        endChar: citation.endChar,
        pageNumber: citation.pageNumber,
      });
    },
    [documents]
  );

  if (notebook === null) {
    return (
      <div className="flex h-dvh items-center justify-center bg-background">
        <div className="px-4 text-center">
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

  const sourcesPanel = (
    <SourcesPanel
      notebookId={notebookId}
      documents={documents}
      onDeleteDocument={handleDeleteDocument}
      selectedDocs={selectedDocs}
      setSelectedDocs={setSelectedDocs}
    />
  );

  const chatPanel = (
    <NotebookChat
      documents={documents}
      notebookId={notebookId}
      notebookTitle={notebook?.title ?? "Notebook"}
      selectedDocs={selectedDocs}
      onCitationClick={handleCitationClick}
    />
  );

  return (
    <div className="flex h-dvh flex-col bg-background">
      <NotebookHeader title={notebook?.title} onRename={handleRename} />

      {isDesktop ? (
        <ResizablePanelGroup
          orientation="horizontal"
          defaultLayout={defaultLayout}
          onLayoutChanged={onLayoutChanged}
          className="min-h-0 flex-1"
        >
          {/* Percentages as strings, pixels as numbers — the minimum is in
              pixels because a source list narrower than this is unusable
              whatever the window size. */}
          <ResizablePanel defaultSize="40" minSize={320} maxSize="65">
            <div className="h-full overflow-hidden border-r border-border/40">
              {sourcesPanel}
            </div>
          </ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel defaultSize="60" minSize={360}>
            <div className="h-full overflow-hidden">{chatPanel}</div>
          </ResizablePanel>
        </ResizablePanelGroup>
      ) : (
        <Tabs
          value={mobileView}
          onValueChange={(value) => setMobileView(value as MobileView)}
          className="flex min-h-0 flex-1 gap-0! overflow-hidden"
        >
          {/* Both panels stay mounted (`forceMount`), so switching tabs never
              discards a half-typed question. */}
          <TabsList className="mx-3 mt-3 h-9 shrink-0">
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
              "min-h-0 overflow-hidden",
              mobileView === "sources" ? "block" : "hidden"
            )}
          >
            {sourcesPanel}
          </TabsContent>

          <TabsContent
            value="chat"
            forceMount
            className={cn(
              "min-h-0 overflow-hidden",
              mobileView === "chat" ? "block" : "hidden"
            )}
          >
            {chatPanel}
          </TabsContent>
        </Tabs>
      )}

      <DocumentPreview
        document={previewDocument}
        onClose={() => {
          setPreviewDocument(null);
          setHighlightRange(undefined);
        }}
        highlightRange={highlightRange}
      />
    </div>
  );
}
