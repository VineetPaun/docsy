"use client";

/**
 * The chat panel — layout and composition only.
 *
 * This file was 948 lines: transcript, streaming, markdown rendering, citation
 * chips, the model picker, the composer and the retry banner all in one
 * component (AUDIT.md §6.2). Each of those now lives next to it.
 */

import * as React from "react";
import { Button } from "@/components/ui/button";
import { ModelSelector } from "@/components/model-selector";
import { DEFAULT_MODEL, type ModelId } from "@/lib/openrouter";
import { ChatComposer } from "./chat-composer";
import { ChatEmptyState } from "./chat-empty-state";
import { ChatMessageBubble, ThinkingBubble } from "./chat-message";
import { useChat } from "./hooks/use-chat";
import type { Citation } from "./types";

export type { Citation } from "./types";

interface Document {
  _id: string;
  name: string;
}

interface NotebookChatProps {
  documents: Document[] | undefined;
  notebookId: string;
  notebookTitle: string;
  // The sources panel's checked sources. Empty = answer from all of them.
  selectedDocs: Set<string>;
  onCitationClick?: (citation: Citation) => void;
}

export function NotebookChat({
  documents,
  notebookId,
  notebookTitle,
  selectedDocs,
  onCitationClick,
}: NotebookChatProps) {
  const [input, setInput] = React.useState("");
  const [selectedModel, setSelectedModel] =
    React.useState<ModelId>(DEFAULT_MODEL);

  const messagesEndRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLTextAreaElement>(null);

  const {
    messages,
    renderedMessages,
    isLoading,
    hasStreamedText,
    isStreaming,
    failure,
    send,
    retry,
  } = useChat({
    notebookId,
    notebookTitle,
    selectedDocs,
    model: selectedModel,
  });

  // Load the saved model preference. No client-side validity check — the
  // catalogue is fetched rather than imported, and `/api/chat` resolves an
  // unknown or retired id to the default anyway (AUDIT.md §5.6).
  React.useEffect(() => {
    const saved = localStorage.getItem("docsy-model");
    if (saved) setSelectedModel(saved);
  }, []);

  const handleModelChange = (model: ModelId) => {
    setSelectedModel(model);
    localStorage.setItem("docsy-model", model);
  };

  React.useEffect(() => {
    // Jump rather than glide while tokens arrive: a smooth scroll restarted on
    // every token never finishes, and the transcript visibly stutters.
    messagesEndRef.current?.scrollIntoView({
      behavior: isStreaming ? "auto" : "smooth",
    });
  }, [renderedMessages, failure, isStreaming]);

  const hasDocuments = Boolean(documents && documents.length > 0);

  const submit = () => {
    const question = input;
    setInput("");
    if (inputRef.current) inputRef.current.style.height = "auto";
    send(question);
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-border/40 px-3 py-3 sm:px-4">
        <h2 className="font-semibold">Chat</h2>
        <div className="flex min-w-0 items-center gap-2">
          <ModelSelector value={selectedModel} onChange={handleModelChange} />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {messages.length === 0 ? (
          <ChatEmptyState
            hasDocuments={hasDocuments}
            onPickQuestion={(question) => {
              setInput(question);
              inputRef.current?.focus();
            }}
          />
        ) : (
          <div className="space-y-6 p-4">
            {renderedMessages.map((message) => (
              <ChatMessageBubble
                key={message.id}
                message={message}
                onCitationClick={onCitationClick}
              />
            ))}

            {isLoading && !hasStreamedText && <ThinkingBubble />}

            {failure && !isLoading && (
              <div
                role="alert"
                className="flex flex-wrap items-center gap-3 rounded-2xl border border-destructive/30 bg-destructive/5 px-4 py-3"
              >
                <p className="min-w-0 flex-1 text-sm text-destructive">
                  {failure.message}
                </p>
                <Button size="sm" variant="outline" onClick={retry}>
                  Retry
                </Button>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      <ChatComposer
        value={input}
        onChange={setInput}
        onSubmit={submit}
        disabled={!hasDocuments}
        isLoading={isLoading}
        sourceCount={documents?.length ?? 0}
        inputRef={inputRef}
      />
    </div>
  );
}
