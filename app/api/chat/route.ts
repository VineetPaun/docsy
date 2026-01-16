import { NextRequest, NextResponse } from "next/server";
import {
  chatWithOpenRouter,
  DEFAULT_MODEL,
  isValidModel,
  type ChatMessage,
} from "@/lib/openrouter";
import { generateEmbedding } from "@/lib/embeddings";
import { searchChunks, type SearchResult } from "@/lib/qdrant";

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
  documents: { id?: string; name: string; content?: string }[];
  notebookId: string;
  notebookTitle: string;
  model?: string;
  useRAG?: boolean;
}

export async function POST(request: NextRequest) {
  try {
    const body: ChatRequest = await request.json();
    const {
      messages,
      documents,
      notebookId,
      notebookTitle,
      model = DEFAULT_MODEL,
      useRAG = true,
    } = body;

    console.log(
      `[chat] Request received - notebookId: ${notebookId}, documents: ${documents.length}, useRAG: ${useRAG}, model: ${model}`
    );
    documents.forEach((doc, i) => {
      console.log(
        `[chat] Document ${i + 1}: ${doc.name}, content length: ${doc.content?.length || 0}`
      );
    });

    // Validate model - use isValidModel helper
    const selectedModel = isValidModel(model) ? model : DEFAULT_MODEL;
    if (model !== selectedModel) {
      console.warn(
        `[chat] Invalid model "${model}" requested, using "${selectedModel}"`
      );
    }

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

    console.log(
      `[chat] RAG config - hasEmbeddingApi: ${!!hasEmbeddingApi}, hasQdrant: ${!!hasQdrant}`
    );

    if (useRAG && notebookId && hasEmbeddingApi && hasQdrant) {
      try {
        console.log(
          `[chat] Performing RAG search for query: "${userMessage.substring(0, 50)}..."`
        );
        const queryEmbedding = await generateEmbedding(userMessage);
        ragResults = await searchChunks(queryEmbedding, notebookId, {
          limit: 5,
        });

        console.log(`[chat] RAG search returned ${ragResults.length} results`);

        if (ragResults.length > 0) {
          documentContext = ragResults
            .map(
              (r, i) =>
                `[${i + 1}] From "${r.documentName || "Unknown"}"${r.pageNumber ? ` (Page ${r.pageNumber})` : ""} (Score: ${r.score.toFixed(2)})\n${r.content}`
            )
            .join("\n\n---\n\n");
          console.log(
            `[chat] RAG context length: ${documentContext.length} chars`
          );
        }
      } catch (error) {
        console.error("[chat] RAG search error:", error);
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

    // If RAG didn't return results, use full document content
    if (!documentContext) {
      console.log(`[chat] Using fallback document context`);
      documentContext = documents
        .filter((doc) => doc.content && doc.content.length > 0)
        .map((doc) => `=== ${doc.name} ===\n${doc.content}`)
        .join("\n\n---\n\n");
      console.log(
        `[chat] Fallback context from ${documents.filter((d) => d.content && d.content.length > 0).length} docs, length: ${documentContext.length} chars`
      );
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

    // Check for OpenRouter API key
    const openRouterKey = process.env.OPENROUTER_API_KEY;

    if (openRouterKey) {
      // Use OpenRouter
      const chatMessages: ChatMessage[] = [
        { role: "system", content: systemPrompt },
        ...messages.map((m) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        })),
      ];

      const assistantMessage = await chatWithOpenRouter(
        chatMessages,
        selectedModel,
        {
          temperature: 0.7,
          maxTokens: 2000,
        }
      );

      // Extract source names for citations
      const sourceNames = documents.slice(0, 3).map((d) => d.name);

      return NextResponse.json({
        message: assistantMessage,
        sources: sourceNames,
        citations,
        model: selectedModel,
      });
    }

    // Fallback: Check for legacy API keys (OpenAI, Anthropic)
    const openaiKey = process.env.OPENAI_API_KEY;
    const anthropicKey = process.env.ANTHROPIC_API_KEY;

    if (openaiKey) {
      const response = await fetch(
        "https://api.openai.com/v1/chat/completions",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${openaiKey}`,
          },
          body: JSON.stringify({
            model: "gpt-4o-mini",
            messages: [
              { role: "system", content: systemPrompt },
              ...messages.map((m) => ({
                role: m.role as "user" | "assistant",
                content: m.content,
              })),
            ],
            temperature: 0.7,
            max_tokens: 1000,
          }),
        }
      );

      if (!response.ok) {
        const error = await response.text();
        console.error("OpenAI API error:", error);
        throw new Error("Failed to get response from OpenAI");
      }

      const data = await response.json();
      const assistantMessage =
        data.choices[0]?.message?.content || "No response generated.";

      return NextResponse.json({
        message: assistantMessage,
        sources: documents.slice(0, 3).map((d) => d.name),
        citations,
        model: "openai/gpt-4o-mini",
      });
    } else if (anthropicKey) {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": anthropicKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-3-haiku-20240307",
          max_tokens: 1000,
          system: systemPrompt,
          messages: messages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        console.error("Anthropic API error:", error);
        throw new Error("Failed to get response from Anthropic");
      }

      const data = await response.json();
      const assistantMessage =
        data.content[0]?.text || "No response generated.";

      return NextResponse.json({
        message: assistantMessage,
        sources: documents.slice(0, 3).map((d) => d.name),
        citations,
        model: "anthropic/claude-3-haiku",
      });
    }

    // No API key configured - return demo response
    return NextResponse.json({
      message: generateDemoResponse(userMessage, documents, notebookTitle),
      sources: documents.slice(0, 2).map((d) => d.name),
      citations: [],
      isDemo: true,
      model: "demo",
    });
  } catch (error) {
    console.error("Chat API error:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: `Failed to process chat request: ${errorMessage}` },
      { status: 500 }
    );
  }
}

function generateDemoResponse(
  question: string,
  documents: { name: string; content?: string }[],
  notebookTitle: string
): string {
  if (documents.length === 0) {
    return "I don't have any sources to reference yet. Please add some documents to get started!";
  }

  const hasContent = documents.some((d) => d.content && d.content.length > 50);
  const lowerQ = question.toLowerCase();

  if (!hasContent) {
    return `I can see you have ${documents.length} source(s) uploaded, but the content hasn't been fully processed yet.

**To enable AI-powered responses:**
1. Add \`OPENROUTER_API_KEY\` to your environment
2. Restart the development server
3. The chat will then use your documents as context for intelligent responses`;
  }

  if (lowerQ.includes("summarize") || lowerQ.includes("summary")) {
    return `**Summary of "${notebookTitle}"**

Based on your ${documents.length} source(s), here's an overview:

${documents.map((d, i) => `${i + 1}. **${d.name}** - ${d.content?.slice(0, 100)}...`).join("\n")}

---
*This is a demo response. Add OPENROUTER_API_KEY for detailed analysis.*`;
  }

  if (
    lowerQ.includes("key") ||
    lowerQ.includes("main") ||
    lowerQ.includes("important")
  ) {
    return `**Key Points from Your Sources**

Here are the main topics covered:

• Your documents contain valuable information related to "${notebookTitle}"
• ${documents.length} sources are available for reference
• Full AI analysis requires an API connection

**Available Sources:**
${documents.map((d) => `- ${d.name}`).join("\n")}

---
*Add OPENROUTER_API_KEY for AI-powered analysis*`;
  }

  return `I found your question: "${question}"

**Demo Mode Active**

To enable full AI-powered responses with your ${documents.length} source(s):

1. Add this to your \`.env.local\`:
   \`\`\`
   OPENROUTER_API_KEY=sk-or-...
   \`\`\`

2. Restart your development server

The AI will then:
- Analyze your documents
- Answer questions with citations
- Summarize and compare sources

---
*${documents.length} source(s) ready for analysis*`;
}
