"use client";

/**
 * Audio overview section: generate, show the current stage, then play.
 *
 * Split out of `sources-panel.tsx` (AUDIT.md §6.2). All the generation logic
 * lives in `hooks/use-audio-overview.ts`; this file is presentation.
 */

import * as React from "react";
import AudioPlayer from "@/components/audio-player";
import { Button } from "@/components/ui/button";
import { useAudioOverview } from "./hooks/use-audio-overview";

/** The spinner used inside the generate button, at button scale. */
function ButtonSpinner() {
  return (
    <svg
      className="mr-2 size-4 animate-spin"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden="true"
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
  );
}

interface AudioOverviewPanelProps {
  notebookId: string;
  hasSources: boolean;
}

export function AudioOverviewPanel({
  notebookId,
  hasSources,
}: AudioOverviewPanelProps) {
  const [expanded, setExpanded] = React.useState(true);
  const { overview, script, isGenerating, stageLabel, generate } =
    useAudioOverview(notebookId, hasSources);

  const hasAudioOrScript = Boolean(
    overview?.audioUrl || script || overview?.scriptText
  );

  return (
    <div className="border-b border-border/40 p-3">
      <div className="mb-2 flex items-center justify-between">
        <button
          onClick={() => setExpanded(!expanded)}
          aria-expanded={expanded}
          className="flex items-center gap-2 text-sm font-medium hover:text-foreground"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="size-4 text-purple-500"
            aria-hidden="true"
          >
            <path d="M12 6V2H8" />
            <path d="m8 18-4 4V8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2Z" />
            <path d="M2 12h2" />
            <path d="M9 11v2" />
            <path d="M12 11v2" />
            <path d="M15 11v2" />
          </svg>
          Audio Overview
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={`size-3 transition-transform ${expanded ? "rotate-180" : ""}`}
            aria-hidden="true"
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>
        <span className="rounded-full bg-gradient-to-r from-purple-500/20 to-blue-500/20 px-2 py-0.5 text-[10px] text-muted-foreground">
          AI Podcast
        </span>
      </div>

      {expanded && (
        <div className="space-y-3">
          {hasAudioOrScript ? (
            <AudioPlayer
              audioUrl={overview?.audioUrl ?? undefined}
              scriptText={script || overview?.scriptText}
              title="Audio Overview"
              onRegenerate={generate}
              isGenerating={isGenerating}
              stageLabel={stageLabel ?? undefined}
            />
          ) : (
            <div className="rounded-lg border border-purple-500/20 bg-gradient-to-br from-purple-900/10 to-blue-900/10 p-4">
              <div className="flex items-start gap-3">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-purple-500/20 to-blue-500/20">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="size-5 text-purple-400"
                    aria-hidden="true"
                  >
                    <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                    <line x1="12" x2="12" y1="19" y2="22" />
                  </svg>
                </div>
                <div className="min-w-0 flex-1">
                  <h4 className="text-sm font-medium">
                    Generate Audio Overview
                  </h4>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Turn your sources into a narrated summary you can listen to.
                  </p>
                </div>
              </div>

              {overview?.status === "failed" && overview.errorMessage && (
                <p className="mt-3 text-xs text-destructive">
                  {overview.errorMessage}
                </p>
              )}

              <Button
                className="mt-3 w-full bg-gradient-to-r from-purple-500 to-blue-500 text-white hover:from-purple-600 hover:to-blue-600"
                onClick={generate}
                disabled={isGenerating || !hasSources}
              >
                {isGenerating ? (
                  <>
                    <ButtonSpinner />
                    {stageLabel}
                  </>
                ) : (
                  <>
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="mr-2 size-4"
                      aria-hidden="true"
                    >
                      <polygon points="6 3 20 12 6 21 6 3" />
                    </svg>
                    Generate Audio Overview
                  </>
                )}
              </Button>

              {!hasSources && (
                <p className="mt-2 text-center text-[10px] text-muted-foreground">
                  Add sources first to generate an overview
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
