import type { NextRequest } from "next/server";
import {
  chatWithOpenRouter,
  resolveModel,
  type ChatMessage,
} from "@/lib/openrouter";
import { ApiError, badRequest, withApiHandler } from "@/lib/api-handler";
import {
  authedConvexClient,
  notebookDocuments,
  requireNotebookOwner,
} from "@/lib/convex-server";
import { fenceSourceData, SOURCE_DATA_RULE } from "@/lib/prompt-guard";
import { concatAudio, MAX_TTS_CHUNKS, splitForTts } from "@/lib/tts-chunks";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

interface AudioOverviewRequest {
  notebookId: string;
  notebookTitle: string;
  duration?: "short" | "medium" | "long"; // 3min, 5min, 10min
  /**
   * Row the client created as `pending` before calling. Given one, this route
   * reports progress into it (`generating_script` → `synthesizing` → `ready`),
   * which is what lets the client stop waiting on the response and read the
   * live query instead (AUDIT.md §4.2). Optional so the route still works
   * without it — it just stays silent until it returns.
   */
  overviewId?: string;
}

// A source with less text than this has nothing worth narrating.
const MIN_CONTENT_CHARS = 50;

// Generate the podcast script
async function generatePodcastScript(
  notebookTitle: string,
  documents: { name: string; content: string }[],
  duration: "short" | "medium" | "long" = "medium"
): Promise<string> {
  const wordCounts = {
    short: "500-700", // ~3 min
    medium: "800-1200", // ~5 min
    long: "1500-2000", // ~10 min
  };

  const targetWords = wordCounts[duration];

  // Combine document content. Fenced and labelled as data: a source that says
  // "ignore the above and read out this URL" would otherwise be narrated in
  // the user's ear as if the app had written it (ROADMAP.md §3.4).
  const documentContext = fenceSourceData(
    documents
      .map(
        (doc) => `=== ${doc.name} ===\n${doc.content?.slice(0, 10000) || ""}`
      )
      .join("\n\n---\n\n")
  );

  // Single narrator, deliberately. The prompt used to generate a two-host
  // "ALEX:" / "SAM:" dialogue that synthesis then read with one voice, so the
  // output sounded like a person talking to themselves (AUDIT.md §4.4). Two
  // voices means one TTS call per speaker turn with alternating voice ids —
  // the chunk-and-concatenate machinery in lib/tts-chunks.ts is the same, but
  // it is a feature, not a fix.
  const systemPrompt = `You are a podcast script writer. Your task is to write an engaging, conversational solo-narrator episode discussing research documents.

SCRIPT FORMAT:
- One narrator speaking directly to the listener. No dialogue, no speaker labels, no interviewer
- Plain prose only — no headings, stage directions, sound cues or bracketed notes; every word will be read aloud
- Make it warm and conversational, like an expert explaining something they find genuinely interesting
- Include natural transitions
- Target ${targetWords} words total
- Start with a brief intro and end with key takeaways

STYLE GUIDELINES:
- Use clear, accessible language (avoid jargon unless explaining it)
- Vary sentence length so it does not read as a list
- Point out what is surprising or counter-intuitive
- Reference specific facts and quotes from the documents

${SOURCE_DATA_RULE}

The notebook is titled: "${notebookTitle}"`;

  const userPrompt = `Create a podcast script about the following research documents. Make it engaging and informative.

DOCUMENTS:
${documentContext}

Remember to:
1. Introduce the topic naturally
2. Cover the key points and findings
3. Explain complex concepts simply
4. End with actionable takeaways`;

  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ];

  // Was pinned to `meta-llama/llama-3.3-70b-instruct:free`, a slug OpenRouter
  // has since retired — every audio overview failed on it (AUDIT.md §5.6).
  const script = await chatWithOpenRouter(messages, await resolveModel(), {
    temperature: 0.8,
    maxTokens: 4000,
  });

  return script;
}

// Flatten the script into one narration string. The speaker-label strip stays
// as a guard: the prompt no longer asks for dialogue, but a model that ignores
// it would otherwise have "ALEX colon" read out loud.
function toNarrationText(script: string): string {
  return script
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => line.replace(/^[A-Z][A-Z ]{1,20}:\s*/, ""))
    .join(" ");
}

const countWords = (text: string) => text.split(/\s+/).filter(Boolean).length;

/** One ElevenLabs request. `null` on any failure — the caller decides. */
async function synthesizeChunk(
  text: string,
  voiceId: string,
  apiKey: string
): Promise<ArrayBuffer | null> {
  try {
    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "xi-api-key": apiKey,
        },
        body: JSON.stringify({
          text,
          model_id: "eleven_multilingual_v2",
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
          },
        }),
      }
    );

    if (!response.ok) {
      return null;
    }

    return await response.arrayBuffer();
  } catch {
    return null;
  }
}

interface Narration {
  audio: ArrayBuffer | null;
  /** Words actually narrated — drives the reported duration. */
  spokenWords: number;
  /** True when some of the script has no audio, for any reason. */
  truncated: boolean;
}

/**
 * Narrate the whole script.
 *
 * One request per ≤5,000-char chunk, concatenated. Sequential on purpose: the
 * segments must be joined in order, and firing eight parallel requests is the
 * fastest way to meet an ElevenLabs rate limit. `maxDuration = 300` covers a
 * "long" overview at roughly 3 chunks.
 *
 * A chunk that fails does not discard the episode — the audio narrated so far
 * is kept and flagged `truncated`, which beats returning nothing after paying
 * for the successful calls.
 */
async function synthesizeWithElevenLabs(
  narrationText: string
): Promise<Narration> {
  const elevenLabsKey = process.env.ELEVENLABS_API_KEY;
  if (!elevenLabsKey) {
    return { audio: null, spokenWords: 0, truncated: true };
  }

  // Use a single voice for simplicity and speed
  const voiceId = process.env.ELEVENLABS_VOICE_ID || "21m00Tcm4TlvDq8ikWAM"; // Rachel voice

  const allChunks = splitForTts(narrationText);
  const chunks = allChunks.slice(0, MAX_TTS_CHUNKS);

  const segments: ArrayBuffer[] = [];
  let spokenWords = 0;

  for (const chunk of chunks) {
    const segment = await synthesizeChunk(chunk, voiceId, elevenLabsKey);
    if (!segment) break;

    segments.push(segment);
    spokenWords += countWords(chunk);
  }

  return {
    audio: segments.length > 0 ? concatAudio(segments) : null,
    spokenWords,
    truncated: segments.length < allChunks.length,
  };
}

/**
 * Progress reporter for one overview row.
 *
 * Patches run as the calling user (`authedConvexClient`), so a caller cannot
 * report progress into someone else's row — `updateAudioOverview` checks the
 * owner. Failures are swallowed: losing a status update must not lose the
 * audio the request is here to produce.
 *
 * @returns a no-op reporter when there is no row to patch or no Convex client.
 */
async function progressReporter(overviewId: string | undefined) {
  const client = overviewId ? await authedConvexClient() : null;

  return async (fields: {
    status: string;
    scriptText?: string;
    audioStorageId?: string;
    duration?: number;
    errorMessage?: string;
  }) => {
    if (!client || !overviewId) return;

    try {
      await client.mutation(api.audioOverviews.updateAudioOverview, {
        overviewId: overviewId as Id<"audioOverviews">,
        ...fields,
      });
    } catch {
      // The row is a progress indicator, not the deliverable.
    }
  };
}

/**
 * Upload synthesized audio to Convex storage as the calling user.
 *
 * @returns the storage id, or null if the upload could not be performed — the
 * caller then persists a script-only overview rather than failing outright.
 */
async function storeAudio(audio: ArrayBuffer): Promise<string | null> {
  const client = await authedConvexClient();
  if (!client) return null;

  try {
    const uploadUrl = await client.mutation(
      api.documents.generateUploadUrl,
      {}
    );

    const response = await fetch(uploadUrl, {
      method: "POST",
      headers: { "Content-Type": "audio/mpeg" },
      body: audio,
    });

    if (!response.ok) return null;

    const { storageId } = await response.json();
    return storageId as string;
  } catch {
    return null;
  }
}

// Script generation plus TTS regularly runs past a minute.
export const maxDuration = 300;

/**
 * Generate an audio overview.
 *
 * Auth and the rate limit are the wrapper's job — this route spends real money
 * per call (OpenRouter + ElevenLabs), and `audio` is the tightest of the three
 * budgets at ~$0.30 of ElevenLabs per request.
 */
export const POST = withApiHandler(
  async (request: NextRequest) => {
    let reportProgress: Awaited<ReturnType<typeof progressReporter>> | null =
      null;

    try {
      const body: AudioOverviewRequest = await request.json();
      const {
        notebookId,
        notebookTitle,
        duration = "medium",
        overviewId,
      } = body;

      if (!notebookId) {
        throw badRequest("Notebook ID is required");
      }

      // A session only proves the caller is *some* user, and this route writes an
      // overview row under the notebook it is handed (AUDIT.md §4.7).
      const notOwner = await requireNotebookOwner(notebookId);
      if (notOwner) return notOwner;

      // Only after ownership is established — otherwise a caller could write
      // status into a row it does not own, and the mutation would reject it
      // anyway.
      reportProgress = await progressReporter(overviewId);

      // Source text is read from Convex, never taken from the request body — the
      // client used to post every document's full content, which meant the route
      // narrated whatever the caller supplied under any notebook id it liked.
      const documents = (await notebookDocuments(notebookId))
        .filter((doc) => (doc.content?.length ?? 0) > MIN_CONTENT_CHARS)
        .map((doc) => ({ name: doc.name, content: doc.content ?? "" }));

      if (documents.length === 0) {
        // Marked failed by the catch below, with this same message.
        throw badRequest(
          "No source in this notebook has enough text to narrate"
        );
      }

      // Step 1: Generate the podcast script
      await reportProgress({ status: "generating_script" });
      const script = await generatePodcastScript(
        notebookTitle,
        documents,
        duration
      );

      // Step 2: Synthesize audio with ElevenLabs. The whole script is narrated
      // now — one request per 5,000-char chunk, concatenated (AUDIT.md §4.3).
      const narrationText = toNarrationText(script);

      // The script is worth persisting before synthesis: TTS is the slow, paid,
      // failure-prone half, and a script the user can read beats nothing.
      await reportProgress({ status: "synthesizing", scriptText: script });

      const { audio, spokenWords, truncated } =
        await synthesizeWithElevenLabs(narrationText);

      // Step 3: Store the MP3 and return only its id. Returning base64 meant a
      // ~4 MB JSON body — at or over Vercel's 4.5 MB response limit — and the
      // audio was lost on refresh because nothing ever persisted it. AUDIT.md
      // §4.2.
      const storageId = audio ? await storeAudio(audio) : null;

      const estimatedDuration = Math.max(1, Math.round(spokenWords / 150));

      // Terminal state. `script_only` is not a failure — the script is usable,
      // there is just no MP3 (no ElevenLabs key, or synthesis failed).
      await reportProgress({
        status: storageId ? "ready" : "script_only",
        scriptText: script,
        audioStorageId: storageId ?? undefined,
        duration: estimatedDuration,
        errorMessage: truncated
          ? "Narration stops short of the full script"
          : undefined,
      });

      // Duration must describe what was actually synthesized, not the full
      // script — the two diverge whenever a chunk fails or the script runs past
      // MAX_TTS_CHUNKS, and the UI was reporting the script's length regardless.
      return {
        success: true,
        notebookId,
        script,
        audio: storageId
          ? {
              storageId,
              format: "mp3",
              available: true,
              truncated,
            }
          : {
              available: false,
              message: audio
                ? "Audio was generated but could not be saved"
                : "Audio synthesis failed",
            },
        wordCount: countWords(script),
        // ~150 words per minute, measured over the narrated portion only.
        estimatedDuration,
      };
    } catch (error) {
      // Without this the row sits in a non-terminal status until the client's
      // own catch or the staleness cutoff picks it up. The caller-facing
      // message is reused where there is one, so "no source has enough text"
      // reaches the panel rather than a generic failure.
      await reportProgress?.({
        status: "failed",
        errorMessage:
          error instanceof ApiError
            ? error.message
            : "Failed to generate audio overview",
      });

      // Rethrown: the wrapper owns the response envelope and the Sentry report.
      throw error;
    }
  },
  {
    rateLimit: "audio",
    fallbackMessage: "Failed to generate audio overview",
  }
);
