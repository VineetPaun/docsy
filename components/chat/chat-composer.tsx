"use client";

/**
 * The question box.
 *
 * Auto-grows to a ceiling, sends on Enter, newline on Shift+Enter. Split out of
 * `notebook-chat.tsx` (AUDIT.md §6.2).
 */

import * as React from "react";
import { Button } from "@/components/ui/button";

interface ChatComposerProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  disabled: boolean;
  isLoading: boolean;
  sourceCount: number;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
}

export function ChatComposer({
  value,
  onChange,
  onSubmit,
  disabled,
  isLoading,
  sourceCount,
  inputRef,
}: ChatComposerProps) {
  const handleChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    onChange(event.target.value);

    // Grow with the text, up to the max height the style below pins.
    event.target.style.height = "auto";
    event.target.style.height = `${Math.min(event.target.scrollHeight, 200)}px`;
  };

  return (
    <div className="border-t border-border/40 p-3 sm:p-4">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
        className="relative"
      >
        <div className="flex items-end gap-2 rounded-2xl border border-border bg-muted/30 px-3 py-2 sm:px-4">
          <textarea
            ref={inputRef}
            value={value}
            onChange={handleChange}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                onSubmit();
              }
            }}
            placeholder={
              disabled ? "Upload a source to get started" : "Ask a question..."
            }
            aria-label="Ask a question about your sources"
            disabled={disabled || isLoading}
            rows={1}
            className="flex-1 resize-none bg-transparent py-1.5 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed"
            style={{ maxHeight: "200px" }}
          />
          <div className="flex items-center gap-2 pb-1.5">
            {/* The mobile tab bar already shows the source count. */}
            <span className="hidden text-xs text-muted-foreground sm:inline">
              {sourceCount} sources
            </span>
            <Button
              type="submit"
              size="icon"
              aria-label="Send message"
              className="size-8 rounded-full"
              disabled={!value.trim() || isLoading || disabled}
            >
              <svg
                aria-hidden="true"
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="size-4"
              >
                <path d="m5 12 7-7 7 7" />
                <path d="M12 19V5" />
              </svg>
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
