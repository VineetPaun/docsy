import { NextRequest, NextResponse } from "next/server";
import { generateEmbedding } from "@/lib/embeddings";
import { searchChunks } from "@/lib/qdrant";
import { requireApiAuth } from "@/lib/api-auth";
import { requireNotebookOwner } from "@/lib/convex-server";

interface SearchRequest {
  query: string;
  notebookId: string;
  documentIds?: string[];
  limit?: number;
}

export async function POST(request: NextRequest) {
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

    // A session alone would let any user search another user's notebook.
    const notOwner = await requireNotebookOwner(notebookId);
    if (notOwner) return notOwner;

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
