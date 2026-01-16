"use client";

import * as React from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface DocumentUploadProps {
  notebookId: string;
  clerkId: string;
}

const ACCEPTED_TYPES = {
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    "docx",
  "application/msword": "doc",
  "text/plain": "txt",
  "text/markdown": "md",
};

export function DocumentUpload({ notebookId, clerkId }: DocumentUploadProps) {
  const [isDragging, setIsDragging] = React.useState(false);
  const [isUploading, setIsUploading] = React.useState(false);
  const [uploadProgress, setUploadProgress] = React.useState<string>("");
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const createDocument = useMutation(api.documents.createDocument);
  const generateUploadUrl = useMutation(api.documents.generateUploadUrl);

  const extractTextFromFile = async (file: File): Promise<string> => {
    const type = ACCEPTED_TYPES[file.type as keyof typeof ACCEPTED_TYPES];

    if (type === "txt" || type === "md") {
      return await file.text();
    }

    // For PDF and DOCX, we'll store a placeholder and process server-side later
    // For now, return a message indicating the file needs processing
    return `[Content from ${file.name} - processing required]`;
  };

  const handleFiles = async (files: FileList) => {
    const validFiles = Array.from(files).filter(
      (file) => file.type in ACCEPTED_TYPES
    );

    if (validFiles.length === 0) {
      toast.error("Please upload PDF, DOCX, or TXT files only.");
      return;
    }

    setIsUploading(true);

    try {
      for (let i = 0; i < validFiles.length; i++) {
        const file = validFiles[i];
        setUploadProgress(
          `Uploading ${i + 1}/${validFiles.length}: ${file.name}`
        );

        const type = ACCEPTED_TYPES[file.type as keyof typeof ACCEPTED_TYPES];

        // Extract text content (for txt files) or placeholder
        const content = await extractTextFromFile(file);

        // Generate upload URL and upload file
        const uploadUrl = await generateUploadUrl();
        const result = await fetch(uploadUrl, {
          method: "POST",
          headers: { "Content-Type": file.type },
          body: file,
        });

        if (!result.ok) {
          throw new Error(`Failed to upload ${file.name}`);
        }

        const { storageId } = await result.json();

        // Create document record
        await createDocument({
          notebookId: notebookId as never,
          clerkId,
          name: file.name,
          type,
          content,
          storageId,
        });
      }

      setUploadProgress("");
      toast.success("Files uploaded successfully");
    } catch (error) {
      console.error("Upload error:", error);
      toast.error("Failed to upload some files. Please try again.");
    } finally {
      setIsUploading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    if (e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFiles(e.target.files);
    }
  };

  return (
    <Card
      className={`border-2 border-dashed transition-colors ${
        isDragging
          ? "border-primary bg-primary/5"
          : "border-border hover:border-primary/50"
      }`}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
    >
      <CardContent className="flex flex-col items-center justify-center py-8">
        {isUploading ? (
          <>
            <svg
              className="size-10 animate-spin text-primary"
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
            <p className="mt-4 text-sm text-muted-foreground">
              {uploadProgress}
            </p>
          </>
        ) : (
          <>
            <div className="flex size-12 items-center justify-center rounded-full bg-muted">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="size-6 text-muted-foreground"
              >
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
            </div>
            <p className="mt-4 font-medium">
              {isDragging ? "Drop files here" : "Drag and drop files here"}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Supports PDF, DOCX, and TXT files
            </p>
            <Button
              variant="outline"
              className="mt-4"
              onClick={() => fileInputRef.current?.click()}
            >
              Browse Files
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.docx,.doc,.txt,.md"
              multiple
              className="hidden"
              onChange={handleFileSelect}
            />
          </>
        )}
      </CardContent>
    </Card>
  );
}
