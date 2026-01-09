"use client";

import { useUser, UserButton } from "@clerk/nextjs";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ThemeToggle } from "@/components/theme-toggle";
import { UserSync } from "@/components/user-sync";
import { DocumentUpload } from "@/components/document-upload";
import { ChatInterface } from "@/components/chat-interface";
import * as React from "react";

interface Document {
  _id: string;
  name: string;
  type: string;
  content?: string;
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

  const notebook = useQuery(
    api.notebooks.getNotebook,
    user ? { notebookId: notebookId as never, clerkId: user.id } : "skip"
  ) as Notebook | null | undefined;

  const documents = useQuery(
    api.documents.getDocuments,
    user && notebook ? { notebookId: notebookId as never, clerkId: user.id } : "skip"
  ) as Document[] | undefined;

  const deleteDocument = useMutation(api.documents.deleteDocument);

  const [selectedDocument, setSelectedDocument] = React.useState<Document | null>(null);
  const [showChat, setShowChat] = React.useState(false);

  const handleDeleteDocument = async (documentId: string) => {
    if (!user) return;

    try {
      await deleteDocument({
        documentId,
        clerkId: user.id,
      });
    } catch (error) {
      console.error("Failed to delete document:", error);
    }
  };

  const getFileIcon = (type: string) => {
    switch (type.toLowerCase()) {
      case "pdf":
        return (
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="size-8 text-red-500">
            <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
            <polyline points="14,2 14,8 20,8" />
            <path d="M10 12h4" />
            <path d="M10 16h4" />
          </svg>
        );
      case "docx":
      case "doc":
        return (
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="size-8 text-blue-500">
            <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
            <polyline points="14,2 14,8 20,8" />
            <path d="M8 13h8" />
            <path d="M8 17h8" />
          </svg>
        );
      case "txt":
        return (
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="size-8 text-gray-500">
            <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
            <polyline points="14,2 14,8 20,8" />
          </svg>
        );
      default:
        return (
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="size-8 text-muted-foreground">
            <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
            <polyline points="14,2 14,8 20,8" />
          </svg>
        );
    }
  };

  if (!isLoaded) {
    return (
      <div className="flex min-h-screen items-center justify-center">
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
      <div className="flex min-h-screen items-center justify-center">
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
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold">Notebook Not Found</h1>
          <p className="mt-2 text-muted-foreground">This notebook doesn&apos;t exist or you don&apos;t have access to it.</p>
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
      <div className="flex min-h-screen flex-col bg-background">
        {/* Header */}
        <header className="sticky top-0 z-50 border-b border-border/40 bg-background/80 backdrop-blur-xl">
          <div className="container mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
            <div className="flex items-center gap-4">
              <Link href="/dashboard" className="flex items-center gap-2 text-muted-foreground hover:text-foreground">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-4">
                  <path d="M15 18l-6-6 6-6" />
                </svg>
                Back
              </Link>
              <div className="h-6 w-px bg-border" />
              <Link href="/" className="flex items-center gap-2">
                <div className="flex size-8 items-center justify-center rounded-lg bg-foreground">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-5 text-background">
                    <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
                    <polyline points="14,2 14,8 20,8" />
                    <path d="M8 13h2" />
                    <path d="M8 17h2" />
                    <path d="M14 13h2" />
                    <path d="M14 17h2" />
                  </svg>
                </div>
                <span className="text-xl font-semibold tracking-tight">docsy</span>
              </Link>
            </div>

            <div className="flex items-center gap-4">
              <ThemeToggle />
              <UserButton />
            </div>
          </div>
        </header>

        {/* Main content */}
        <main className="container mx-auto flex max-w-6xl flex-1 flex-col px-4 py-8">
          {notebook === undefined ? (
            <div className="space-y-4">
              <div className="h-8 w-48 animate-pulse rounded bg-muted" />
              <div className="h-4 w-32 animate-pulse rounded bg-muted" />
            </div>
          ) : (
            <>
              <div className="mb-8 flex items-start justify-between">
                <div>
                  <h1 className="text-3xl font-bold">{notebook.title}</h1>
                  {notebook.description && (
                    <p className="mt-1 text-muted-foreground">{notebook.description}</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setShowChat(!showChat)}
                    disabled={!documents || documents.length === 0}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2 size-4">
                      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                    </svg>
                    {showChat ? "Hide Chat" : "Chat with Documents"}
                  </Button>
                </div>
              </div>

              <div className={`grid flex-1 gap-6 ${showChat ? "lg:grid-cols-2" : ""}`}>
                {/* Documents section */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h2 className="text-lg font-semibold">Documents</h2>
                    <span className="text-sm text-muted-foreground">
                      {documents?.length ?? 0} document{documents?.length !== 1 ? "s" : ""}
                    </span>
                  </div>

                  {/* Upload area */}
                  <DocumentUpload
                    notebookId={notebookId}
                    clerkId={user.id}
                  />

                  {/* Documents list */}
                  {documents === undefined ? (
                    <div className="space-y-2">
                      {[...Array(3)].map((_, i) => (
                        <Card key={i} className="animate-pulse">
                          <CardContent className="flex items-center gap-4 py-4">
                            <div className="size-8 rounded bg-muted" />
                            <div className="flex-1">
                              <div className="h-4 w-32 rounded bg-muted" />
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  ) : documents.length === 0 ? (
                    <Card className="border-dashed">
                      <CardContent className="flex flex-col items-center justify-center py-12">
                        <div className="flex size-12 items-center justify-center rounded-full bg-muted">
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="size-6 text-muted-foreground">
                            <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
                            <polyline points="14,2 14,8 20,8" />
                            <line x1="12" y1="18" x2="12" y2="12" />
                            <line x1="9" y1="15" x2="15" y2="15" />
                          </svg>
                        </div>
                        <h3 className="mt-4 font-semibold">No documents yet</h3>
                        <p className="mt-1 text-center text-sm text-muted-foreground">
                          Upload PDF, DOCX, or TXT files to get started
                        </p>
                      </CardContent>
                    </Card>
                  ) : (
                    <div className="space-y-2">
                      {documents.map((doc) => (
                        <Card
                          key={doc._id}
                          className={`group cursor-pointer transition-all hover:shadow-md ${
                            selectedDocument?._id === doc._id ? "ring-2 ring-primary" : ""
                          }`}
                          onClick={() => setSelectedDocument(doc)}
                        >
                          <CardContent className="flex items-center gap-4 py-4">
                            {getFileIcon(doc.type)}
                            <div className="flex-1 min-w-0">
                              <p className="font-medium truncate">{doc.name}</p>
                              <p className="text-sm text-muted-foreground">
                                {doc.type.toUpperCase()} &bull; {new Date(doc.createdAt).toLocaleDateString()}
                              </p>
                            </div>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                if (confirm("Delete this document?")) {
                                  handleDeleteDocument(doc._id);
                                }
                              }}
                              className="rounded-md p-2 opacity-0 transition-opacity hover:bg-destructive/10 group-hover:opacity-100"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-4 text-destructive">
                                <path d="M3 6h18" />
                                <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                                <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                              </svg>
                            </button>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  )}
                </div>

                {/* Chat section */}
                {showChat && documents && documents.length > 0 && (
                  <ChatInterface
                    documents={documents}
                    notebookTitle={notebook.title}
                  />
                )}
              </div>
            </>
          )}
        </main>
      </div>
    </>
  );
}
