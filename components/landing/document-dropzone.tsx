"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "convex/react";
import { useUser } from "@clerk/nextjs";
import { api } from "@/convex/_generated/api";
import { cn } from "@/lib/utils";

const ACCEPTED_TYPES = {
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    "docx",
  "application/msword": "doc",
  "text/plain": "txt",
  "text/markdown": "md",
};

export function DocumentDropzone() {
  const router = useRouter();
  const { user, isSignedIn } = useUser();
  const [isDragging, setIsDragging] = React.useState(false);
  const [isProcessing, setIsProcessing] = React.useState(false);
  const [status, setStatus] = React.useState(
    "Drop your document here to start"
  );

  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const createNotebook = useMutation(api.notebooks.createNotebook);
  const createDocument = useMutation(api.documents.createDocument);
  const generateUploadUrl = useMutation(api.documents.generateUploadUrl);

  const extractTextFromFile = async (file: File): Promise<string> => {
    const type = ACCEPTED_TYPES[file.type as keyof typeof ACCEPTED_TYPES];

    // For text files, read directly
    if (type === "txt" || type === "md") {
      return await file.text();
    }

    // For PDF and DOCX, use the server-side processing API
    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/process-document", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error("Failed to process document");
      }

      const data = await response.json();
      return data.content || "";
    } catch (error) {
      console.error("Document processing error:", error);
      return "";
    }
  };

  const processFile = async (file: File) => {
    if (!isSignedIn || !user) {
      router.push("/sign-up");
      return;
    }

    if (!(file.type in ACCEPTED_TYPES)) {
      setStatus("Invalid file type. Please upload a PDF, DOCX, or text file.");
      setTimeout(() => setStatus("Drop your document here to start"), 3000);
      return;
    }

    try {
      setIsProcessing(true);
      setStatus("Creating your notebook...");

      // 1. Create Notebook
      const notebookId = await createNotebook({
        clerkId: user.id,
        title: file.name.split(".")[0] || "New Notebook",
      });

      setStatus(`Processing ${file.name}...`);

      // 2. Extract Text
      const content = await extractTextFromFile(file);

      // 3. Upload File
      setStatus("Uploading...");
      const uploadUrl = await generateUploadUrl();
      const result = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file,
      });

      if (!result.ok) throw new Error("Upload failed");
      const { storageId } = await result.json();

      // 4. Create Document Record
      const docId = await createDocument({
        notebookId,
        clerkId: user.id,
        name: file.name,
        type: ACCEPTED_TYPES[file.type as keyof typeof ACCEPTED_TYPES],
        content,
        storageId,
      });

      // 5. Trigger Embeddings (Background)
      if (content && content.length > 50) {
        setStatus("Generating AI embeddings...");
        fetch("/api/embeddings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            documentId: docId,
            notebookId,
            content,
            documentName: file.name,
          }),
        }).catch((err) => console.error("Embedding trigger error:", err));
      }

      setStatus("Done! Redirecting...");
      router.push(`/notebook/${notebookId}`);
    } catch (error) {
      console.error("Dropzone error:", error);
      setStatus("Something went wrong. Please try again.");
      setIsProcessing(false);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      await processFile(files[0]);
    }
  };

  const handleFileInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      await processFile(files[0]);
    }
  };

  return (
    <div className="w-full space-y-8">
      <div
        onClick={() => fileInputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          setIsDragging(false);
        }}
        onDrop={handleDrop}
        className={cn(
          "group relative mx-auto h-64 w-full cursor-pointer overflow-hidden rounded-xl border-2 border-dashed transition-all duration-300",
          isDragging
            ? "border-primary bg-primary/5 scale-[1.01] shadow-xl"
            : "border-muted-foreground/25 bg-background/50 hover:border-primary/50 hover:bg-muted/50",
          isProcessing && "pointer-events-none opacity-80"
        )}
      >
        <input
          type="file"
          ref={fileInputRef}
          className="hidden"
          accept=".pdf,.docx,.doc,.txt,.md"
          onChange={handleFileInput}
        />

        {/* Center Action Area (Always visible but enhanced on hover/drag) */}
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center p-4 text-center transition-all duration-300">
          <div
            className={cn(
              "flex size-16 items-center justify-center rounded-full bg-background shadow-lg transition-transform duration-300 group-hover:scale-110",
              isDragging ? "scale-110 text-primary" : "text-muted-foreground"
            )}
          >
            {isProcessing ? (
              <div className="size-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            ) : (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="size-8"
              >
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
            )}
          </div>

          <div className="mt-4 rounded-full bg-background/80 px-4 py-1.5 backdrop-blur-md">
            <p className="text-sm font-medium">
              {isProcessing ? (
                status
              ) : (
                <>
                  <span className="text-primary">Click to upload</span> or drag
                  and drop
                </>
              )}
            </p>
          </div>

          {!isProcessing && (
            <p className="mt-2 text-xs text-muted-foreground bg-background/50 px-2 py-0.5 rounded">
              PDF, DOCX, TXT (up to 10MB)
            </p>
          )}
        </div>

        {/* Status Overlay when dragging (Stronger cue) */}
        {isDragging && !isProcessing && (
          <div className="absolute inset-0 z-30 flex items-center justify-center bg-primary/20 backdrop-blur-[1px]">
            <div className="rounded-xl bg-background/90 px-8 py-4 shadow-2xl">
              <p className="text-lg font-bold text-primary">Drop to analyze</p>
            </div>
          </div>
        )}
      </div>

      {/* Mockup Preview */}
      <div className="relative mx-auto aspect-[16/10] w-full overflow-hidden rounded-xl border border-border/50 bg-gradient-to-b from-muted/50 to-muted shadow-2xl">
        {/* Chat interface mockup */}
        <div className="absolute inset-0 p-4 sm:p-6">
          {/* Header */}
          <div className="flex items-center gap-2 border-b border-border/50 pb-4">
            <div className="flex gap-1.5">
              <div className="size-3 rounded-full bg-red-500/80" />
              <div className="size-3 rounded-full bg-yellow-500/80" />
              <div className="size-3 rounded-full bg-green-500/80" />
            </div>
            <div className="ml-4 h-4 w-32 rounded bg-muted-foreground/20" />
          </div>

          {/* Content area */}
          <div className="mt-4 flex gap-4">
            {/* Documents sidebar */}
            <div className="hidden w-1/4 flex-col gap-2 sm:flex">
              {/* Animated floating documents */}
              <div className="animate-float-slow rounded-lg border border-border/50 bg-background/80 p-3 shadow-sm backdrop-blur-sm">
                <div className="flex items-center gap-2">
                  <div className="flex size-8 items-center justify-center rounded bg-red-500/10">
                    <span className="text-xs font-medium text-red-500">
                      PDF
                    </span>
                  </div>
                  <div className="flex-1">
                    <div className="h-2 w-16 rounded bg-muted-foreground/30" />
                    <div className="mt-1 h-1.5 w-10 rounded bg-muted-foreground/20" />
                  </div>
                </div>
              </div>
              <div
                className="animate-float-medium rounded-lg border border-border/50 bg-background/80 p-3 shadow-sm backdrop-blur-sm"
                style={{ animationDelay: "0.5s" }}
              >
                <div className="flex items-center gap-2">
                  <div className="flex size-8 items-center justify-center rounded bg-blue-500/10">
                    <span className="text-xs font-medium text-blue-500">
                      DOC
                    </span>
                  </div>
                  <div className="flex-1">
                    <div className="h-2 w-14 rounded bg-muted-foreground/30" />
                    <div className="mt-1 h-1.5 w-8 rounded bg-muted-foreground/20" />
                  </div>
                </div>
              </div>
              <div
                className="animate-float-slow rounded-lg border border-border/50 bg-background/80 p-3 shadow-sm backdrop-blur-sm"
                style={{ animationDelay: "1s" }}
              >
                <div className="flex items-center gap-2">
                  <div className="flex size-8 items-center justify-center rounded bg-gray-500/10">
                    <span className="text-xs font-medium text-gray-500">
                      TXT
                    </span>
                  </div>
                  <div className="flex-1">
                    <div className="h-2 w-12 rounded bg-muted-foreground/30" />
                    <div className="mt-1 h-1.5 w-6 rounded bg-muted-foreground/20" />
                  </div>
                </div>
              </div>
            </div>

            {/* Chat area */}
            <div className="flex flex-1 flex-col gap-3">
              {/* User message */}
              <div className="ml-auto max-w-[80%] rounded-2xl rounded-br-md bg-foreground px-4 py-2 text-background">
                <p className="text-sm">
                  What are the key findings from the research paper?
                </p>
              </div>

              {/* AI response */}
              <div className="max-w-[80%] rounded-2xl rounded-bl-md border border-border/50 bg-background/80 px-4 py-2 backdrop-blur-sm">
                <p className="text-sm text-muted-foreground">
                  Based on the uploaded documents, here are the key findings:
                </p>
                <div className="mt-2 space-y-1">
                  <div className="h-2 w-full rounded bg-muted-foreground/20" />
                  <div className="h-2 w-4/5 rounded bg-muted-foreground/20" />
                  <div className="h-2 w-3/5 rounded bg-muted-foreground/20" />
                </div>
              </div>

              {/* Typing indicator */}
              <div className="flex gap-1 px-4 py-2">
                <span className="size-2 animate-bounce rounded-full bg-muted-foreground/40" />
                <span
                  className="size-2 animate-bounce rounded-full bg-muted-foreground/40"
                  style={{ animationDelay: "0.15s" }}
                />
                <span
                  className="size-2 animate-bounce rounded-full bg-muted-foreground/40"
                  style={{ animationDelay: "0.3s" }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Gradient overlay */}
        <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-background to-transparent" />
      </div>
    </div>
  );
}
