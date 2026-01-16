import { NextRequest, NextResponse } from "next/server";
import { chatWithOpenRouter, type ChatMessage } from "@/lib/openrouter";

interface AudioOverviewRequest {
  notebookId: string;
  notebookTitle: string;
  documents: { name: string; content: string }[];
  duration?: "short" | "medium" | "long"; // 3min, 5min, 10min
}

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

  const systemPrompt = `You are a podcast script writer. Your task is to create an engaging, conversational script for a two-host podcast episode discussing research documents.

The hosts are:
- Alex: The main host who explains concepts clearly and asks insightful questions
- Sam: The co-host who provides additional context, asks follow-up questions, and adds interesting observations

SCRIPT FORMAT:
- Write in dialogue format: "ALEX: [dialogue]" and "SAM: [dialogue]"
- Make it conversational and engaging, like two friends discussing interesting research
- Include natural transitions, humor where appropriate, and genuine curiosity
- Target ${targetWords} words total
- Start with a brief intro and end with key takeaways

STYLE GUIDELINES:
- Use clear, accessible language (avoid jargon unless explaining it)
- Include "ums" and "you knows" sparingly for natural speech
- Have hosts build on each other's points
- Include moments of surprise or insight ("Oh, that's interesting!")
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

  const script = await chatWithOpenRouter(
    messages,
    "meta-llama/llama-3.3-70b-instruct:free",
    {
      temperature: 0.8,
      maxTokens: 4000,
    }
  );

  return script;
}

// Synthesize audio using ElevenLabs
async function synthesizeWithElevenLabs(
  script: string
): Promise<ArrayBuffer | null> {
  const elevenLabsKey = process.env.ELEVENLABS_API_KEY;
  if (!elevenLabsKey) {
    console.log("[audio-overview] ElevenLabs API key not configured");
    return null;
  }

  // Use a single voice for simplicity and speed
  const voiceId = process.env.ELEVENLABS_VOICE_ID || "21m00Tcm4TlvDq8ikWAM"; // Rachel voice

  // Clean up the script - remove speaker labels for narration
  const cleanedText = script
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => line.replace(/^(ALEX|SAM):\s*/i, ""))
    .join(" ")
    .slice(0, 5000); // ElevenLabs has limits

  console.log(
    `[audio-overview] Synthesizing ${cleanedText.length} characters with ElevenLabs`
  );

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
      const errorText = await response.text();
      console.error(
        `[audio-overview] ElevenLabs API error:`,
        response.status,
        errorText
      );
      return null;
    }

    console.log("[audio-overview] Audio synthesized successfully");
    return await response.arrayBuffer();
  } catch (error) {
    console.error("[audio-overview] ElevenLabs error:", error);
    return null;
  }
}

export async function POST(request: NextRequest) {
  try {
    const body: AudioOverviewRequest = await request.json();
    const { notebookId, notebookTitle, documents, duration = "medium" } = body;

    if (!notebookId || !documents || documents.length === 0) {
      return NextResponse.json(
        { error: "Notebook ID and documents are required" },
        { status: 400 }
      );
    }

    console.log(
      `[audio-overview] Generating script for "${notebookTitle}" with ${documents.length} documents`
    );

    // Step 1: Generate the podcast script
    const script = await generatePodcastScript(
      notebookTitle,
      documents,
      duration
    );

    console.log(
      `[audio-overview] Script generated: ${script.length} chars, ${script.split(/\s+/).length} words`
    );

    // Step 2: Synthesize audio with ElevenLabs
    let audioBase64: string | null = null;
    let audioFormat: string = "mp3";

    console.log("[audio-overview] Using ElevenLabs for audio synthesis");
    const audio = await synthesizeWithElevenLabs(script);
    if (audio) {
      audioBase64 = Buffer.from(audio).toString("base64");
    }

    return NextResponse.json({
      success: true,
      notebookId,
      script,
      audio: audioBase64
        ? {
            data: audioBase64,
            format: audioFormat,
            available: true,
          }
        : {
            available: false,
            message: "Audio synthesis failed",
          },
      wordCount: script.split(/\s+/).length,
      estimatedDuration: Math.round(script.split(/\s+/).length / 150), // ~150 words per minute
    });
  } catch (error) {
    console.error("[audio-overview] Error:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: `Failed to generate audio overview: ${errorMessage}` },
      { status: 500 }
    );
  }
}
