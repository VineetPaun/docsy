"use client";

/**
 * The chat pipeline: transcript, optimistic send, streamed answer, retry.
 *
 * Lifted out of `notebook-chat.tsx` (AUDIT.md §6.2), which owned this alongside
 * the markdown renderer, the citation chips, the model picker and the composer.
 * Behaviour is unchanged; the comments explain why each part is shaped this way.
 */

import * as React from "react";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { ChatMessage, Citation } from "../types";

/** The answer currently arriving, token by token. */
interface StreamingAnswer {
  text: string;
  citations?: Citation[];
  sources?: string[];
}

interface UseChatArgs {
  notebookId: string;
  notebookTitle: string;
  /** The sources panel's checked sources. Empty = answer from all of them. */
  selectedDocs: Set<string>;
  model: string;
}

export function useChat({
  notebookId,
  notebookTitle,
  selectedDocs,
  model,
}: UseChatArgs) {
  const dbMessages = useQuery(api.messages.getMessages, {
    notebookId: notebookId as never,
  });

  /**
   * The user's own message appears immediately (AUDIT.md §9.2).
   *
   * Without this the text left the composer and nothing showed for the length
   * of the Convex round-trip, which reads as a dropped keystroke. The optimistic
   * document is thrown away the moment the real one arrives.
   */
  const addMessage = useMutation(api.messages.addMessage).withOptimisticUpdate(
    (localStore, args) => {
      const existing = localStore.getQuery(api.messages.getMessages, {
        notebookId: args.notebookId,
      });

      // `undefined` means the query has not loaded; there is no list to prepend
      // to, and it will arrive with the message already in it.
      if (existing === undefined) return;

      localStore.setQuery(
        api.messages.getMessages,
        { notebookId: args.notebookId },
        [
          ...existing,
          {
            // Placeholder identity: this document lives only until the server
            // echoes the real one back, and nothing reads either field.
            _id: crypto.randomUUID() as Id<"messages">,
            _creationTime: Date.now(),
            userId: "" as Id<"users">,
            ...args,
          },
        ]
      );
    }
  );

  const messages: ChatMessage[] = React.useMemo(() => {
    if (!dbMessages) return [];

    return dbMessages.map((m) => ({
      id: m._id,
      role: m.role as "user" | "assistant",
      content: m.content,
      timestamp: m.timestamp,
      sources: m.sources,
      citations: m.citations ? JSON.parse(m.citations) : undefined,
    }));
  }, [dbMessages]);

  const [isLoading, setIsLoading] = React.useState(false);
  const [streaming, setStreaming] = React.useState<StreamingAnswer | null>(
    null
  );
  // The last failed question, kept in memory so it can be retried without
  // becoming part of the conversation (AUDIT.md §9.5).
  const [failure, setFailure] = React.useState<{
    prompt: string;
    message: string;
  } | null>(null);

  /**
   * Ask the model and persist its answer.
   *
   * Separate from `send` so a retry re-runs only this half — the user's message
   * is already in the database, and posting it again would duplicate it.
   *
   * @throws whatever the route reported, for the caller to surface
   */
  const requestAnswer = React.useCallback(
    async (userContent: string) => {
      // On a retry `messages` already ends with this question; on a first
      // attempt it does not. Drop only a trailing duplicate — matching on
      // content anywhere would delete an earlier, legitimately repeated
      // question from the history.
      const last = messages[messages.length - 1];
      const history =
        last?.role === "user" && last.content === userContent
          ? messages.slice(0, -1)
          : messages;

      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [...history, { role: "user", content: userContent }].map(
            (m) => ({ role: m.role, content: m.content })
          ),
          // Ids only — the server reads the text from Convex itself.
          documentIds: [...selectedDocs],
          notebookId,
          notebookTitle,
          model,
        }),
      });

      // Pre-stream failures (503, 403, 429) are still JSON with a real status.
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `API error: ${response.status}`);
      }

      if (!response.body) {
        throw new Error("The server sent no response body");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      let buffer = "";
      let text = "";
      let citations: Citation[] | undefined;
      let sources: string[] | undefined;
      let streamError: string | null = null;

      setStreaming({ text: "" });

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          // Whole lines only: a network chunk can split one in half, and the
          // remainder waits in the buffer for the rest of it.
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const raw of lines) {
            if (!raw.trim()) continue;

            let event: {
              type?: string;
              text?: string;
              message?: string;
              citations?: Citation[];
              sources?: string[];
            };

            try {
              event = JSON.parse(raw);
            } catch {
              continue;
            }

            if (event.type === "meta") {
              // Retrieval finished before the first token, so the source header
              // renders while the answer is still being written.
              citations = event.citations;
              sources = event.sources;
              setStreaming((current) => ({
                text: current?.text ?? "",
                citations,
                sources,
              }));
            } else if (event.type === "delta" && event.text) {
              text += event.text;
              const snapshot = text;
              setStreaming((current) => ({ ...current, text: snapshot }));
            } else if (event.type === "error") {
              streamError = event.message ?? "Failed to complete the answer";
            }
          }
        }
      } finally {
        // Cleared whether the stream finished, failed or was abandoned — a
        // stuck streaming bubble would sit above the real message forever.
        setStreaming(null);
      }

      // A partial answer is deliberately discarded rather than saved:
      // persisting half a sentence is exactly the history pollution §9.5
      // removed. The cost is one retry.
      if (streamError) throw new Error(streamError);

      if (!text.trim()) {
        throw new Error(
          "The model returned an empty response. Please try again."
        );
      }

      await addMessage({
        notebookId: notebookId as never,
        role: "assistant",
        content: text,
        timestamp: Date.now(),
        sources,
        citations: citations ? JSON.stringify(citations) : undefined,
      });
    },
    [addMessage, messages, model, notebookId, notebookTitle, selectedDocs]
  );

  /**
   * Surface a failure without writing it to the conversation (AUDIT.md §9.5).
   *
   * Failures used to be saved as an assistant message — "Sorry, I encountered
   * an error: ..." — which persisted a transient network problem into the
   * notebook's history forever, and fed it back to the model as context on
   * every later question.
   */
  const reportFailure = React.useCallback((error: unknown, prompt: string) => {
    const message =
      error instanceof Error ? error.message : "Something went wrong";

    setFailure({ prompt, message });
    toast.error(message);
  }, []);

  const send = React.useCallback(
    async (rawInput: string) => {
      const userContent = rawInput.trim();
      if (!userContent || isLoading) return;

      setFailure(null);
      setIsLoading(true);

      try {
        // Appears in the transcript immediately — see the optimistic update.
        await addMessage({
          notebookId: notebookId as never,
          role: "user",
          content: userContent,
          timestamp: Date.now(),
        });

        await requestAnswer(userContent);
      } catch (error) {
        reportFailure(error, userContent);
      } finally {
        setIsLoading(false);
      }
    },
    [addMessage, isLoading, notebookId, reportFailure, requestAnswer]
  );

  /** Re-ask the last failed question. The user's message is already stored. */
  const retry = React.useCallback(async () => {
    if (!failure || isLoading) return;

    const { prompt } = failure;
    setFailure(null);
    setIsLoading(true);

    try {
      await requestAnswer(prompt);
    } catch (error) {
      reportFailure(error, prompt);
    } finally {
      setIsLoading(false);
    }
  }, [failure, isLoading, reportFailure, requestAnswer]);

  /**
   * The transcript plus the answer being streamed.
   *
   * Appending a synthetic message reuses the existing bubble, markdown renderer
   * and citation handling rather than duplicating all three for the in-flight
   * case.
   */
  const renderedMessages: ChatMessage[] = React.useMemo(() => {
    if (!streaming) return messages;

    return [
      ...messages,
      {
        id: "streaming",
        role: "assistant" as const,
        content: streaming.text,
        timestamp: Date.now(),
        sources: streaming.sources,
        citations: streaming.citations,
      },
    ];
  }, [messages, streaming]);

  return {
    messages,
    renderedMessages,
    isLoading,
    isStreaming: streaming !== null,
    hasStreamedText: Boolean(streaming?.text),
    failure,
    send,
    retry,
  };
}
