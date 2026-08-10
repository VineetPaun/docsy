import { NextRequest, NextResponse } from "next/server";
import {
  resolveModel,
  streamChatWithOpenRouter,
  type ChatMessage,
} from "@/lib/openrouter";
import { generateEmbedding } from "@/lib/embeddings";
import { searchChunks, type SearchResult } from "@/lib/qdrant";
import { requireApiAuth } from "@/lib/api-auth";
import { notebookDocuments, requireNotebookOwner } from "@/lib/convex-server";
import { enforceRateLimit } from "@/lib/rate-limit";

// Free-tier models on OpenRouter run as low as a 32k context. The system
// prompt, the retrieved chunks and the conversation history all share it, so
// each part is bounded independently rather than trusting the client.
const MAX_HISTORY_MESSAGES = 20; // ~10 turns
const MAX_HISTORY_CHARS = 24_000;
const MAX_FALLBACK_CONTEXT_CHARS = 30_000;

// Citation interface for structured source references
export interface Citation {
  id: number;
  documentId: string;
  documentName: string;
  content: string;
  startChar: number;
  endChar: number;
  pageNumber?: number;
  score: number;
}

interface ChatRequest {
  messages: { role: "user" | "assistant"; content: string }[];
  notebookId: string;
  notebookTitle: string;
  // Which sources to answer from — the checkboxes in the sources panel.
  // Absent or empty means the whole notebook.
  documentIds?: string[];
  model?: string;
  useRAG?: boolean;
}

// Embedding + retrieval + a slow free-tier model routinely exceeds Vercel's
// default serverless cutoff.
export const maxDuration = 120;

// Keep only the most recent turns, newest-first, under both a message count
// and a character budget. Older turns are dropped rather than truncated so a
// long conversation can never overflow the model's context window.
function trimHistory(
  messages: { role: "user" | "assistant"; content: string }[]
): { role: "user" | "assistant"; content: string }[] {
  const recent = messages.slice(-MAX_HISTORY_MESSAGES);
  const kept: typeof recent = [];
  let budget = MAX_HISTORY_CHARS;

  for (let i = recent.length - 1; i >= 0; i--) {
    const cost = recent[i].content.length;
    // Always keep the latest message, even if it alone blows the budget.
    if (budget - cost < 0 && kept.length > 0) break;
    budget -= cost;
    kept.unshift(recent[i]);
  }

  return kept;
}

export async function POST(request: NextRequest) {
  // Reject anonymous callers — this route proxies a paid LLM gateway.
  const { errorResponse } = await requireApiAuth();
  if (errorResponse) return errorResponse;

  // Charged before any embedding or completion is bought.
  const limited = await enforceRateLimit("chat");
  if (limited) return limited;

  try {
    const body: ChatRequest = await request.json();
    const {
      messages,
      notebookId,
      notebookTitle,
      documentIds = [],
      model,
      useRAG = true,
    } = body;

    // Retrieval below reads whatever notebook the body names, so an unowned
    // id is rejected outright rather than silently answered without RAG.
    if (notebookId) {
      const notOwner = await requireNotebookOwner(notebookId);
      if (notOwner) return notOwner;
    }

    // Sources come from Convex, not from the request. The client used to post
    // every document's full text with each message — megabytes per turn on a
    // mobile connection (AUDIT.md §4.7).
    const allDocuments = notebookId ? await notebookDocuments(notebookId) : [];

    // Narrow to the user's selection. An id the notebook doesn't contain is
    // dropped here, so a stale checkbox can't widen the search.
    const documents =
      documentIds.length > 0
        ? allDocuments.filter((d) => documentIds.includes(d._id))
        : allDocuments;

    // Empty means "no filter" to searchChunks, which is what an empty
    // selection should do: search the whole notebook.
    const selectedIds =
      documentIds.length > 0 ? documents.map((d) => d._id) : [];

    // Resolved against the live catalogue: a retired slug or one the caller
    // invented becomes the default instead of a 400 from OpenRouter.
    const selectedModel = await resolveModel(model);

    // Get the latest user message
    const userMessage = messages[messages.length - 1]?.content || "";

    // Build context from documents
    let documentContext = "";
    let ragResults: SearchResult[] = [];

    // Try RAG-based context if enabled and we have a notebookId
    // Only attempt RAG if embedding API is configured
    const hasEmbeddingApi =
      process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
    const hasQdrant = process.env.QDRANT_URL;

    if (useRAG && notebookId && hasEmbeddingApi && hasQdrant) {
      try {
        const queryEmbedding = await generateEmbedding(userMessage);
        ragResults = await searchChunks(queryEmbedding, notebookId, {
          limit: 5,
          documentIds: selectedIds,
        });

        if (ragResults.length > 0) {
          documentContext = ragResults
            .map(
              (r, i) =>
                `[${i + 1}] From "${r.documentName || "Unknown"}"${r.pageNumber ? ` (Page ${r.pageNumber})` : ""} (Score: ${r.score.toFixed(2)})\n${r.content}`
            )
            .join("\n\n---\n\n");
        }
      } catch {
        // Fall back to full document context
      }
    }

    // Build citations array from RAG results
    const citations: Citation[] = ragResults.map((r, i) => ({
      id: i + 1,
      documentId: r.documentId,
      documentName: r.documentName || "Unknown",
      content: r.content,
      startChar: r.startChar,
      endChar: r.endChar,
      pageNumber: r.pageNumber,
      score: r.score,
    }));

    // If RAG returned nothing (no vectors yet, or nothing cleared the score
    // floor), fall back to raw document text — but under a hard character
    // budget. Unbounded stuffing here was a guaranteed context overflow.
    if (!documentContext) {
      let remaining = MAX_FALLBACK_CONTEXT_CHARS;
      const parts: string[] = [];

      for (const doc of documents) {
        if (!doc.content || doc.content.length === 0) continue;
        if (remaining <= 0) break;

        const body = doc.content.slice(0, remaining);
        const truncated = body.length < doc.content.length;
        parts.push(
          `=== ${doc.name} ===\n${body}${truncated ? "\n[…truncated]" : ""}`
        );
        remaining -= body.length;
      }

      documentContext = parts.join("\n\n---\n\n");
    }

    // Build system prompt with citation instructions
    const systemPrompt = `You are a helpful AI assistant for a notebook called "${notebookTitle}". 
You have access to the following documents that the user has uploaded. 
Use this context to answer questions accurately and ALWAYS cite your sources using [1], [2], etc. notation.

CITATION RULES:
- When you reference information from the sources, include the citation number in brackets like [1] or [2]
- Place citations immediately after the relevant statement
- You can cite multiple sources for the same statement like [1][3]
- Each number corresponds to the source numbers below

If the information needed to answer the user's question is NOT in the provided documents:
1. State clearly that the information is missing from the current sources.
2. Suggest that the user use the "Web Search" feature in the Sources panel to find and add this information to the notebook.
3. Do NOT claim you can search the web yourself. You can only read what is in the "DOCUMENTS" section below.

DOCUMENTS:
${documentContext || "No documents available yet."}

INSTRUCTIONS:
- Answer questions based on the provided documents
- ALWAYS use [1], [2], etc. to cite your sources when referencing information
- If the information isn't in the documents, guide the user to add it via Web Search
- Be concise but thorough
- Use markdown formatting for better readability`;

    // A missing key used to serve 114 lines of fabricated "demo" text, so a
    // misconfigured deploy looked like a working one (AUDIT.md §6.6). Fail
    // loudly instead — 503, because the service is unconfigured, not the
    // request malformed.
    if (!process.env.OPENROUTER_API_KEY) {
      return NextResponse.json(
        { error: "Chat is unavailable: OPENROUTER_API_KEY is not configured" },
        { status: 503 }
      );
    }

    const chatMessages: ChatMessage[] = [
      { role: "system", content: systemPrompt },
      ...trimHistory(messages).map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
    ];

    // NDJSON, one object per line: a single `meta` line, then `delta` lines as
    // the model produces text, then `done`. Retrieval has already finished at
    // this point, so citations go out before the first token rather than after
    // the last — the client can render the source header while the answer is
    // still being written (AUDIT.md §8).
    const encoder = new TextEncoder();
    const line = (value: unknown) => encoder.encode(`${JSON.stringify(value)}\n`);

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        controller.enqueue(
          line({
            type: "meta",
            // Names of the sources the answer could draw on, for the header line.
            sources: documents.slice(0, 3).map((d) => d.name),
            citations,
            model: selectedModel,
          })
        );

        try {
          for await (const text of streamChatWithOpenRouter(
            chatMessages,
            selectedModel,
            { temperature: 0.7, maxTokens: 2000 }
          )) {
            controller.enqueue(line({ type: "delta", text }));
          }

          controller.enqueue(line({ type: "done" }));
        } catch {
          // The HTTP status is already 200 by the time streaming starts, so a
          // mid-stream failure has to be reported in-band. Details stay
          // server-side (AUDIT.md §6.5).
          controller.enqueue(
            line({ type: "error", message: "Failed to complete the answer" })
          );
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        // Streaming dies behind a buffering proxy without these.
        "Cache-Control": "no-store, no-transform",
        "X-Accel-Buffering": "no",
      },
    });
  } catch {
    // Internal error details stay server-side — they leaked upstream API
    // messages to the client before (AUDIT.md §6.5).
    return NextResponse.json(
      { error: "Failed to process chat request" },
      { status: 500 }
    );
  }
}
