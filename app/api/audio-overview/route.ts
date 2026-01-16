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

// Synthesize audio using OpenAI TTS
async function synthesizeSpeech(
  script: string,
  voice: "alloy" | "echo" | "fable" | "onyx" | "nova" | "shimmer" = "nova"
): Promise<ArrayBuffer | null> {
  const openaiKey = process.env.OPENAI_API_KEY;
  if (!openaiKey) {
    console.log("[audio-overview] OpenAI API key not configured for TTS");
    return null;
  }

  // Parse the script to extract dialogue
  const lines = script.split("\n").filter((line) => line.trim());
  const fullText = lines
    .map((line) => {
      // Remove speaker labels for single-voice synthesis
      return line.replace(/^(ALEX|SAM):\s*/i, "");
    })
    .join(" ");

  try {
    const response = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${openaiKey}`,
      },
      body: JSON.stringify({
        model: "tts-1",
        input: fullText.slice(0, 4096), // TTS has a 4096 char limit
        voice: voice,
        response_format: "mp3",
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error("[audio-overview] TTS API error:", error);
      return null;
    }

    return await response.arrayBuffer();
  } catch (error) {
    console.error("[audio-overview] TTS synthesis error:", error);
    return null;
  }
}

// Multi-voice synthesis (if ElevenLabs is available)
async function synthesizeMultiVoice(
  script: string
): Promise<ArrayBuffer | null> {
  const elevenLabsKey = process.env.ELEVENLABS_API_KEY;
  if (!elevenLabsKey) {
    // Fallback to OpenAI single voice
    return synthesizeSpeech(script);
  }

  // ElevenLabs voice IDs (you would need to configure these)
  const voices = {
    alex: process.env.ELEVENLABS_VOICE_ALEX || "21m00Tcm4TlvDq8ikWAM", // Rachel (default)
    sam: process.env.ELEVENLABS_VOICE_SAM || "AZnzlk1XvdvUeBnXmlld", // Domi (default)
  };

  // Parse script into dialogue segments
  const segments: { speaker: "alex" | "sam"; text: string }[] = [];
  const lines = script.split("\n").filter((line) => line.trim());

  for (const line of lines) {
    const alexMatch = line.match(/^ALEX:\s*(.+)/i);
    const samMatch = line.match(/^SAM:\s*(.+)/i);

    if (alexMatch) {
      segments.push({ speaker: "alex", text: alexMatch[1] });
    } else if (samMatch) {
      segments.push({ speaker: "sam", text: samMatch[1] });
    }
  }

  if (segments.length === 0) {
    return synthesizeSpeech(script);
  }

  try {
    // Synthesize each segment (this is simplified - in production you'd batch and combine)
    const audioChunks: ArrayBuffer[] = [];

    for (const segment of segments.slice(0, 10)) {
      // Limit segments for demo
      const response = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${voices[segment.speaker]}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "xi-api-key": elevenLabsKey,
          },
          body: JSON.stringify({
            text: segment.text,
            model_id: "eleven_monolingual_v1",
            voice_settings: {
              stability: 0.5,
              similarity_boost: 0.75,
            },
          }),
        }
      );

      if (response.ok) {
        audioChunks.push(await response.arrayBuffer());
      }
    }

    // Combine audio chunks (simplified - proper implementation would use ffmpeg)
    if (audioChunks.length > 0) {
      const totalLength = audioChunks.reduce(
        (acc, chunk) => acc + chunk.byteLength,
        0
      );
      const combined = new Uint8Array(totalLength);
      let offset = 0;
      for (const chunk of audioChunks) {
        combined.set(new Uint8Array(chunk), offset);
        offset += chunk.byteLength;
      }
      return combined.buffer;
    }

    return null;
  } catch (error) {
    console.error("[audio-overview] ElevenLabs error:", error);
    return synthesizeSpeech(script);
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

    // Step 2: Attempt to synthesize audio
    let audioBase64: string | null = null;
    let audioFormat: string = "mp3";

    const hasOpenAI = !!process.env.OPENAI_API_KEY;
    const hasElevenLabs = !!process.env.ELEVENLABS_API_KEY;

    if (hasElevenLabs) {
      console.log(
        "[audio-overview] Using ElevenLabs for multi-voice synthesis"
      );
      const audio = await synthesizeMultiVoice(script);
      if (audio) {
        audioBase64 = Buffer.from(audio).toString("base64");
      }
    } else if (hasOpenAI) {
      console.log(
        "[audio-overview] Using OpenAI TTS for single-voice synthesis"
      );
      const audio = await synthesizeSpeech(script);
      if (audio) {
        audioBase64 = Buffer.from(audio).toString("base64");
      }
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
            message:
              hasOpenAI || hasElevenLabs
                ? "Audio synthesis failed"
                : "Configure OPENAI_API_KEY or ELEVENLABS_API_KEY for audio synthesis",
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
