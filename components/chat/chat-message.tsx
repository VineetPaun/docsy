"use client";

/**
 * One message in the transcript: avatar, bubble, and its sources.
 *
 * Split out of `notebook-chat.tsx` (AUDIT.md §6.2). The streaming answer is
 * rendered by this same component — the in-flight message is appended to the
 * list as a synthetic entry, so there is one bubble implementation rather than
 * two that drift.
 */

import { MarkdownAnswer } from "./markdown-answer";
import type { ChatMessage as Message, Citation } from "./types";

function AssistantAvatar() {
  return (
    <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="size-4 text-primary"
        aria-hidden="true"
      >
        <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
      </svg>
    </div>
  );
}

function UserAvatar() {
  return (
    <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="size-4"
        aria-hidden="true"
      >
        <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
        <circle cx="12" cy="7" r="4" />
      </svg>
    </div>
  );
}

interface ChatMessageProps {
  message: Message;
  onCitationClick?: (citation: Citation) => void;
}

export function ChatMessageBubble({
  message,
  onCitationClick,
}: ChatMessageProps) {
  const isUser = message.role === "user";

  return (
    <div className={`flex gap-3 ${isUser ? "justify-end" : ""}`}>
      {!isUser && <AssistantAvatar />}

      <div className={`max-w-[85%] sm:max-w-[80%] ${isUser ? "order-first" : ""}`}>
        <div
          className={`rounded-2xl px-4 py-2.5 ${
            isUser
              ? "bg-primary text-primary-foreground"
              : "cursor-grab bg-muted active:cursor-grabbing"
          }`}
          draggable={!isUser}
          onDragStart={(event) => {
            if (isUser) return;
            event.dataTransfer.setData("text/plain", message.content);
            event.dataTransfer.setData("application/docsy-chat", "true");
            event.dataTransfer.effectAllowed = "copy";
          }}
          title={!isUser ? "Drag to add to your document" : undefined}
        >
          {isUser ? (
            <p className="whitespace-pre-wrap text-sm">{message.content}</p>
          ) : (
            <MarkdownAnswer
              content={message.content}
              citations={message.citations}
              onCitationClick={onCitationClick}
            />
          )}
        </div>

        {/* Citations when the answer has them; the plain source list otherwise. */}
        {message.citations && message.citations.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {message.citations.map((citation) => (
              <button
                key={citation.id}
                onClick={() => onCitationClick?.(citation)}
                className="group inline-flex cursor-pointer items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-xs transition-colors hover:bg-primary/20"
                title={`Open the cited passage${citation.pageNumber ? ` (page ${citation.pageNumber})` : ""}`}
              >
                <span className="flex size-4 items-center justify-center rounded-full bg-primary text-[10px] font-medium text-primary-foreground">
                  {citation.id}
                </span>
                <span className="max-w-[150px] truncate text-muted-foreground transition-colors group-hover:text-foreground">
                  {citation.documentName}
                </span>
                {citation.pageNumber && (
                  <span className="text-[10px] text-muted-foreground/60">
                    p.{citation.pageNumber}
                  </span>
                )}
              </button>
            ))}
          </div>
        ) : message.sources && message.sources.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-1">
            {message.sources.map((source) => (
              <span
                key={source}
                className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="size-3"
                  aria-hidden="true"
                >
                  <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
                  <polyline points="14,2 14,8 20,8" />
                </svg>
                {source}
              </span>
            ))}
          </div>
        ) : null}
      </div>

      {isUser && <UserAvatar />}
    </div>
  );
}

/** The three dots shown between sending a question and the first token. */
export function ThinkingBubble() {
  return (
    <div className="flex gap-3">
      <AssistantAvatar />
      <div
        role="status"
        aria-label="Waiting for the answer"
        className="rounded-2xl bg-muted px-4 py-2.5"
      >
        <div className="flex items-center gap-1">
          {[0, 150, 300].map((delay) => (
            <div
              key={delay}
              className="size-2 animate-bounce rounded-full bg-muted-foreground/40"
              style={{ animationDelay: `${delay}ms` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
