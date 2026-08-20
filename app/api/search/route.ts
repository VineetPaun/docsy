import type { NextRequest } from "next/server";
import { generateEmbedding } from "@/lib/embeddings";
import { searchChunks } from "@/lib/qdrant";
import { badRequest, missingEnv, withApiHandler } from "@/lib/api-handler";
import { requireNotebookOwner } from "@/lib/convex-server";

interface SearchRequest {
  query: string;
  notebookId: string;
  documentIds?: string[];
  limit?: number;
}

export const POST = withApiHandler(
  async (request: NextRequest) => {
    const body: SearchRequest = await request.json();
    const { query, notebookId, documentIds, limit = 10 } = body;

    if (!query || !notebookId) {
      throw badRequest("Missing required fields: query, notebookId");
    }

    // A session alone would let any user search another user's notebook.
    const notOwner = await requireNotebookOwner(notebookId);
    if (notOwner) return notOwner;

    if (!(process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY)) {
      throw missingEnv("GOOGLE_API_KEY", "Search");
    }

    const queryEmbedding = await generateEmbedding(query);

    const results = await searchChunks(queryEmbedding, notebookId, {
      limit,
      documentIds,
    });

    return {
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
    };
  },
  { fallbackMessage: "Failed to perform search" }
);
