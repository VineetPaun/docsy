import { NextRequest, NextResponse } from "next/server";
import { generateEmbedding } from "@/lib/embeddings";
import { searchChunks } from "@/lib/qdrant";
import { requireApiAuth } from "@/lib/api-auth";

interface SearchRequest {
  query: string;
  notebookId: string;
  documentIds?: string[];
  limit?: number;
}

export async function POST(request: NextRequest) {
  // TODO (AUDIT.md §3.2): also verify the caller owns `notebookId`. Requires
  // the Convex auth refactor in §3.1 to be able to trust an ownership lookup.
  const { errorResponse } = await requireApiAuth();
  if (errorResponse) return errorResponse;

  try {
    const body: SearchRequest = await request.json();
    const { query, notebookId, documentIds, limit = 10 } = body;

    if (!query || !notebookId) {
      return NextResponse.json(
        { error: "Missing required fields: query, notebookId" },
        { status: 400 }
      );
    }

    // Check for API key
    const apiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "GOOGLE_API_KEY or GEMINI_API_KEY not configured" },
        { status: 500 }
      );
    }

    // Generate embedding for the query
    const queryEmbedding = await generateEmbedding(query);

    // Search for similar chunks
    const results = await searchChunks(queryEmbedding, notebookId, {
      limit,
      documentIds,
    });

    return NextResponse.json({
      success: true,
      results: results.map((r) => ({
        id: r.id,
        documentId: r.documentId,
        content: r.content,
        score: r.score,
        documentName: r.metadata?.documentName,
        chunkIndex: r.metadata?.chunkIndex,
      })),
      query,
    });
  } catch {
    return NextResponse.json(
      { error: "Failed to perform search" },
      { status: 500 }
    );
  }
}
