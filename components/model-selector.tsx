"use client";

import * as React from "react";
import { OPENROUTER_MODELS, DEFAULT_MODEL, type ModelId } from "@/lib/openrouter";

interface ModelSelectorProps {
  value: ModelId;
  onChange: (model: ModelId) => void;
}

export function ModelSelector({ value, onChange }: ModelSelectorProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const dropdownRef = React.useRef<HTMLDivElement>(null);

  const selectedModel = OPENROUTER_MODELS[value] || OPENROUTER_MODELS[DEFAULT_MODEL];
  const models = Object.entries(OPENROUTER_MODELS);

  // Close dropdown when clicking outside
  React.useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-1.5 text-sm hover:bg-muted transition-colors"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="size-4 text-muted-foreground"
        >
          <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
        </svg>
        <span className="max-w-[120px] truncate">{selectedModel.name}</span>
        {selectedModel.tier === "free" && (
          <span className="rounded bg-green-500/10 px-1.5 py-0.5 text-[10px] font-medium text-green-600 dark:text-green-400">
            FREE
          </span>
        )}
        {selectedModel.tier === "premium" && (
          <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400">
            PRO
          </span>
        )}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`size-3 text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`}
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute left-0 top-full z-50 mt-1 min-w-[280px] rounded-lg border border-border bg-popover p-1 shadow-lg">
          <div className="mb-1 px-2 py-1.5 text-xs font-medium text-muted-foreground">
            Select Model
          </div>
          {models.map(([id, model]) => (
            <button
              key={id}
              onClick={() => {
                onChange(id as ModelId);
                setIsOpen(false);
              }}
              className={`flex w-full items-center justify-between rounded-md px-2 py-2 text-left text-sm transition-colors hover:bg-muted ${
                value === id ? "bg-muted" : ""
              }`}
            >
              <div className="flex flex-col">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{model.name}</span>
                  {model.tier === "free" && (
                    <span className="rounded bg-green-500/10 px-1.5 py-0.5 text-[10px] font-medium text-green-600 dark:text-green-400">
                      FREE
                    </span>
                  )}
                  {model.tier === "premium" && (
                    <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400">
                      PRO
                    </span>
                  )}
                </div>
                <span className="text-xs text-muted-foreground">{model.description}</span>
              </div>
              {value === id && (
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="size-4 text-primary"
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              )}
            </button>
          ))}
          <div className="mt-1 border-t border-border pt-2 px-2 pb-1">
            <p className="text-[10px] text-muted-foreground">
              Powered by OpenRouter. Free models have usage limits.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
