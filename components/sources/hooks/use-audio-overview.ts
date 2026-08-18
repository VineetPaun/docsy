"use client";

/**
 * Audio overview generation and its live status.
 *
 * Lifted out of `sources-panel.tsx` unchanged in behaviour (AUDIT.md §6.2); the
 * comments below describe why it is shaped this way.
 */

import * as React from "react";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import { convexErrorMessage } from "@/lib/convex-error";

/**
 * A row stuck in a non-terminal status for this long is treated as finished:
 * the request behind it is gone (the tab that made it closed), and a permanent
 * spinner would also block regenerating.
 */
const STALE_AFTER_MS = 10 * 60_000;

/** Legacy rows may hold "generating"/"error" from before the staged statuses. */
const TERMINAL_STATUSES = ["ready", "script_only", "failed", "error"];

// The point of reporting status at all: the stage is worth more than a spinner
// when the wait is a minute or more.
const STAGE_LABELS: Record<string, string> = {
  pending: "Starting...",
  generating_script: "Writing the script...",
  synthesizing: "Recording the narration...",
  generating: "Generating...",
};

export function useAudioOverview(notebookId: string, hasSources: boolean) {
  // Audio itself is not held here — it lives in Convex storage and arrives as a
  // URL on this reactive query. Only the script is mirrored locally, so it shows
  // immediately after generation.
  const [script, setScript] = React.useState<string | undefined>();

  const createAudioOverview = useMutation(
    api.audioOverviews.createAudioOverview
  );
  const updateAudioOverview = useMutation(
    api.audioOverviews.updateAudioOverview
  );

  const overview = useQuery(api.audioOverviews.getAudioOverview, {
    notebookId: notebookId as never,
  });

  React.useEffect(() => {
    if (overview?.scriptText) setScript(overview.scriptText);
  }, [overview]);

  /**
   * Generation is in flight when the latest row sits in a non-terminal status.
   *
   * Derived rather than local state, so a refresh or a second tab shows the
   * spinner too.
   */
  const isGenerating = Boolean(
    overview &&
      !TERMINAL_STATUSES.includes(overview.status) &&
      Date.now() - overview.createdAt < STALE_AFTER_MS
  );

  const stageLabel = isGenerating
    ? (STAGE_LABELS[overview?.status ?? ""] ?? "Generating...")
    : null;

  /**
   * Kick off an audio overview and stop waiting for it.
   *
   * The row is created `pending` first, the route patches it through
   * `generating_script` → `synthesizing` → `ready`, and the live query drives
   * the UI. That is what makes a refresh mid-generation show the current stage
   * instead of an empty panel (AUDIT.md §4.2).
   *
   * The request is deliberately not awaited — awaiting it was the whole
   * problem. Its only remaining job is to catch the failures the route cannot
   * report itself: a 429 from the rate limiter, a 403, or the request dying
   * before it started.
   *
   * ponytail: closing the tab still aborts the request, leaving the row in a
   * non-terminal status. `isGenerating` releases a row older than the cutoff, so
   * the panel recovers on its next render — no timer, which means a row going
   * stale with the panel already open needs one more render (any interaction, or
   * a refresh) to clear. A Convex action or a cron sweep is the durable version,
   * worth it if strandings actually happen.
   */
  const generate = React.useCallback(async () => {
    if (!hasSources) {
      toast.warning(
        "Please add some sources first to generate an audio overview."
      );
      return;
    }

    setScript(undefined);

    let overviewId: string;
    try {
      overviewId = await createAudioOverview({
        notebookId: notebookId as never,
        status: "pending",
      });
    } catch (error) {
      toast.error(
        convexErrorMessage(error, "Failed to start the audio overview")
      );
      return;
    }

    // Only the notebook id and the row go over the wire — the route reads the
    // source text from Convex itself, and rejects a notebook with nothing to
    // narrate (AUDIT.md §4.7).
    fetch("/api/audio-overview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        notebookId,
        notebookTitle: "Your Research",
        duration: "short", // 3-5 minutes
        overviewId,
      }),
    })
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data.success) {
          throw new Error(data.error || "Failed to generate audio overview");
        }
      })
      .catch(async (error) => {
        const message =
          error instanceof Error
            ? error.message
            : "Failed to generate audio overview";

        // The route marks its own failures; this covers the ones it never saw.
        await updateAudioOverview({
          overviewId: overviewId as never,
          status: "failed",
          errorMessage: message,
        }).catch(() => {
          // Nothing left to do — the staleness cutoff releases the row.
        });

        toast.error(message);
      });

    toast.info("Generating your audio overview — this takes a minute or two.");
  }, [createAudioOverview, hasSources, notebookId, updateAudioOverview]);

  return { overview, script, isGenerating, stageLabel, generate };
}
