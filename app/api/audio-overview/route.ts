import { NextRequest, NextResponse } from "next/server";
import {
  chatWithOpenRouter,
  resolveModel,
  type ChatMessage,
} from "@/lib/openrouter";
import { requireApiAuth } from "@/lib/api-auth";
import {
  authedConvexClient,
  notebookDocuments,
  requireNotebookOwner,
} from "@/lib/convex-server";
import { enforceRateLimit } from "@/lib/rate-limit";
import { api } from "@/convex/_generated/api";

interface AudioOverviewRequest {
  notebookId: string;
  notebookTitle: string;
  duration?: "short" | "medium" | "long"; // 3min, 5min, 10min
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

  // Combine document content
  const documentContext = documents
    .map((doc) => `=== ${doc.name} ===\n${doc.content?.slice(0, 10000) || ""}`)
    .join("\n\n---\n\n");

  // Single narrator, deliberately. The prompt used to generate a two-host
  // "ALEX:" / "SAM:" dialogue that synthesis then read with one voice, so the
  // output sounded like a person talking to themselves (AUDIT.md §4.4). Two
  // voices means two TTS calls stitched together — that belongs with §4.3.
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
  const script = await chatWithOpenRouter(
    messages,
    await resolveModel(),
    {
      temperature: 0.8,
      maxTokens: 4000,
    }
  );

  return script;
}

// ElevenLabs caps a single request; anything past this is dropped by the API.
const TTS_CHAR_LIMIT = 5000;

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

// Synthesize audio using ElevenLabs
async function synthesizeWithElevenLabs(
  narrationText: string
): Promise<ArrayBuffer | null> {
  const elevenLabsKey = process.env.ELEVENLABS_API_KEY;
  if (!elevenLabsKey) {
    return null;
  }

  // Use a single voice for simplicity and speed
  const voiceId = process.env.ELEVENLABS_VOICE_ID || "21m00Tcm4TlvDq8ikWAM"; // Rachel voice

  const cleanedText = narrationText.slice(0, TTS_CHAR_LIMIT);

  try {
    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "xi-api-key": elevenLabsKey,
        },
        body: JSON.stringify({
          text: cleanedText,
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

export async function POST(request: NextRequest) {
  // This route spends real money per call (OpenRouter + ElevenLabs), so an
  // anonymous caller was a direct cash-burn vector.
  const { errorResponse } = await requireApiAuth();
  if (errorResponse) return errorResponse;

  // The tightest budget of the three — ~$0.30 of ElevenLabs per call.
  const limited = await enforceRateLimit("audio");
  if (limited) return limited;

  try {
    const body: AudioOverviewRequest = await request.json();
    const { notebookId, notebookTitle, duration = "medium" } = body;

    if (!notebookId) {
      return NextResponse.json(
        { error: "Notebook ID is required" },
        { status: 400 }
      );
    }

    // A session only proves the caller is *some* user, and this route writes an
    // overview row under the notebook it is handed (AUDIT.md §4.7).
    const notOwner = await requireNotebookOwner(notebookId);
    if (notOwner) return notOwner;

    // Source text is read from Convex, never taken from the request body — the
    // client used to post every document's full content, which meant the route
    // narrated whatever the caller supplied under any notebook id it liked.
    const documents = (await notebookDocuments(notebookId))
      .filter((doc) => (doc.content?.length ?? 0) > MIN_CONTENT_CHARS)
      .map((doc) => ({ name: doc.name, content: doc.content ?? "" }));

    if (documents.length === 0) {
      return NextResponse.json(
        { error: "No source in this notebook has enough text to narrate" },
        { status: 400 }
      );
    }

    // Step 1: Generate the podcast script
    const script = await generatePodcastScript(
      notebookTitle,
      documents,
      duration
    );

    // Step 2: Synthesize audio with ElevenLabs
    const narrationText = toNarrationText(script);
    const spokenText = narrationText.slice(0, TTS_CHAR_LIMIT);
    const isTruncated = narrationText.length > TTS_CHAR_LIMIT;

    const audio = await synthesizeWithElevenLabs(narrationText);

    // Step 3: Store the MP3 and return only its id. Returning base64 meant a
    // ~4 MB JSON body — at or over Vercel's 4.5 MB response limit — and the
    // audio was lost on refresh because nothing ever persisted it. AUDIT.md
    // §4.2.
    const storageId = audio ? await storeAudio(audio) : null;

    // Duration must describe what was actually synthesized, not the full
    // script — the two diverge whenever the script is longer than one
    // ElevenLabs request, and the UI was reporting the script's length.
    const wordsAt = (t: string) => t.split(/\s+/).filter(Boolean).length;

    return NextResponse.json({
      success: true,
      notebookId,
      script,
      audio: storageId
        ? {
            storageId,
            format: "mp3",
            available: true,
            truncated: isTruncated,
          }
        : {
            available: false,
            message: audio
              ? "Audio was generated but could not be saved"
              : "Audio synthesis failed",
          },
      wordCount: wordsAt(script),
      // ~150 words per minute, measured over the narrated portion only.
      estimatedDuration: Math.max(1, Math.round(wordsAt(spokenText) / 150)),
    });
  } catch {
    return NextResponse.json(
      { error: "Failed to generate audio overview" },
      { status: 500 }
    );
  }
}
