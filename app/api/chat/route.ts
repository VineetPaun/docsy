import type { NextRequest } from "next/server";
import {
  modelContextLength,
  resolveModel,
  streamChatWithOpenRouter,
  type ChatMessage,
} from "@/lib/openrouter";
import { generateEmbedding } from "@/lib/embeddings";
import {
  retrievalLimitFor,
  searchChunks,
  type SearchResult,
} from "@/lib/qdrant";
import { rewriteQuery } from "@/lib/query-rewrite";
import {
  ApiError,
  badRequest,
  missingEnv,
  withApiHandler,
} from "@/lib/api-handler";
import { notebookDocuments, requireNotebookOwner } from "@/lib/convex-server";
import { fenceSourceData, SOURCE_DATA_RULE } from "@/lib/prompt-guard";

// Free-tier models on OpenRouter run as low as a 32k context. The system
// prompt, the retrieved chunks and the conversation history all share it, so
// each part is bounded independently rather than trusting the client.
const MAX_HISTORY_MESSAGES = 20; // ~10 turns
const MAX_HISTORY_CHARS = 24_000;

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

/**
 * Answer a question from one notebook's sources, streamed.
 *
 * Auth and the rate limit belong to the wrapper — this route proxies a paid LLM
 * gateway, and the budget is charged before any embedding or completion is
 * bought.
 */
export const POST = withApiHandler(
  async (request: NextRequest) => {
    const body: ChatRequest = await request.json();
    const {
      messages,
      notebookId,
      notebookTitle,
      documentIds = [],
      model,
    } = body;

    // Every answer is grounded in one notebook's sources, so there is nothing
    // to answer from without an id. It used to be optional, which only meant
    // an id-less request got a context-free completion.
    if (!notebookId) {
      throw badRequest("notebookId is required");
    }

    // Retrieval below reads whatever notebook the body names, so an unowned
    // id is rejected outright rather than silently answered without RAG.
    const notOwner = await requireNotebookOwner(notebookId);
    if (notOwner) return notOwner;

    // Sources come from Convex, not from the request. The client used to post
    // every document's full text with each message — megabytes per turn on a
    // mobile connection (AUDIT.md §4.7).
    const allDocuments = await notebookDocuments(notebookId);

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

    // Retrieval is now the only way source text reaches the prompt. The
    // full-document fallback that ran when RAG came back empty is gone
    // (AUDIT.md §4.6): it answered without citations and made a dead embedding
    // pipeline look like a working one. So a missing retrieval key is a 503
    // naming the variable — the same treatment OPENROUTER_API_KEY gets below —
    // rather than a silent downgrade to ungrounded answers.
    const missingVar = !(process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY)
      ? "GOOGLE_API_KEY"
      : !process.env.QDRANT_URL
        ? "QDRANT_URL"
        : null;

    if (missingVar) {
      throw missingEnv(missingVar, "Chat");
    }

    let ragResults: SearchResult[] = [];

    try {
      // "What about the second one?" embeds as a vector for the words "second
      // one" — the topic lives in the previous turn, not in the message. The
      // rewrite resolves it against the conversation, and returns the original
      // untouched when the question already stands alone (AUDIT.md §7).
      const searchQuery = await rewriteQuery(
        userMessage,
        messages.slice(0, -1),
        selectedModel
      );

      const queryEmbedding = await generateEmbedding(searchQuery);

      // Breadth follows the model: 5 chunks was hardcoded regardless of whether
      // the window was 32K or 262K.
      ragResults = await searchChunks(queryEmbedding, notebookId, {
        limit: retrievalLimitFor(await modelContextLength(selectedModel)),
        documentIds: selectedIds,
      });
    } catch {
      // "Search broke" and "nothing relevant in your sources" are different
      // answers, and the user cannot tell them apart from the reply. Say the
      // true one: the client renders this as a retryable inline error
      // (AUDIT.md §9.5).
      throw new ApiError(502, "Could not search your sources. Try again.");
    }

    // Source text is untrusted: fenced, and labelled as data in the rule the
    // system prompt carries (ROADMAP.md §3.4).
    const documentContext =
      ragResults.length > 0
        ? fenceSourceData(
            ragResults
              .map(
                (r, i) =>
                  `[${i + 1}] From "${r.documentName || "Unknown"}"${r.pageNumber ? ` (Page ${r.pageNumber})` : ""} (Score: ${r.score.toFixed(2)})\n${r.content}`
              )
              .join("\n\n---\n\n")
          )
        : "";

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

    // Build system prompt with citation instructions
    const systemPrompt = `You are a helpful AI assistant for a notebook called "${notebookTitle}".
The passages below were retrieved from the user's own sources. Answer only from them, and ALWAYS cite using [1], [2], etc. notation.

${SOURCE_DATA_RULE}

CITATION RULES:
- When you reference information from the sources, include the citation number in brackets like [1] or [2]
- Place citations immediately after the relevant statement
- You can cite multiple sources for the same statement like [1][3]
- Each number corresponds to the numbered passages below

If the answer is NOT in the retrieved passages:
1. Say plainly that it is not in the current sources. Do not answer from your own knowledge.
2. Suggest the "Web Search" feature in the Sources panel to add the missing material to the notebook.
3. Do NOT claim you can search the web yourself. You can only read the passages below.

RETRIEVED PASSAGES:
${documentContext || "Nothing in this notebook matched the question."}

INSTRUCTIONS:
- Answer only from the retrieved passages
- ALWAYS use [1], [2], etc. to cite your sources when referencing information
- If the answer isn't there, say so and guide the user to add it via Web Search
- Be concise but thorough
- Use markdown formatting for better readability`;

    // A missing key used to serve 114 lines of fabricated "demo" text, so a
    // misconfigured deploy looked like a working one (AUDIT.md §6.6). Fail
    // loudly instead — 503, because the service is unconfigured, not the
    // request malformed.
    if (!process.env.OPENROUTER_API_KEY) {
      throw missingEnv("OPENROUTER_API_KEY", "Chat");
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
  },
  {
    rateLimit: "chat",
    fallbackMessage: "Failed to process chat request",
  }
);
