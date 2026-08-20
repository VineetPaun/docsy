"use client";

/**
 * What the transcript shows before the first question.
 *
 * Two states, because the advice differs: with no sources the only useful
 * action is adding one; with sources, a few starting questions.
 */

import { Button } from "@/components/ui/button";

const SUGGESTED_QUESTIONS = [
  "Summarize the main points",
  "What are the key takeaways?",
  "Explain the main concepts",
  "Compare the different sources",
];

interface ChatEmptyStateProps {
  hasDocuments: boolean;
  onPickQuestion: (question: string) => void;
}

export function ChatEmptyState({
  hasDocuments,
  onPickQuestion,
}: ChatEmptyStateProps) {
  if (!hasDocuments) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-6 text-center sm:p-8">
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
            aria-hidden="true"
          >
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
        </div>
        <h3 className="mt-4 text-lg font-medium">Add a source to get started</h3>
        <p className="mt-2 max-w-sm text-sm text-muted-foreground">
          Upload a PDF, DOCX or text file, paste a link, or search the web.
          Answers come only from what is in this notebook.
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col items-center justify-center p-6 text-center sm:p-8">
      <div className="flex size-16 items-center justify-center rounded-full bg-primary/10">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="size-8 text-primary"
          aria-hidden="true"
        >
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      </div>
      <h3 className="mt-4 text-lg font-medium">
        Ask anything about your sources
      </h3>
      <p className="mt-2 max-w-sm text-sm text-muted-foreground">
        Summarize, find a detail, compare two sources — every answer cites the
        passage it came from.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        {SUGGESTED_QUESTIONS.map((question) => (
          <Button
            key={question}
            variant="outline"
            size="sm"
            className="rounded-full"
            onClick={() => onPickQuestion(question)}
          >
            {question}
          </Button>
        ))}
      </div>
    </div>
  );
}
