import { NextRequest, NextResponse } from "next/server";
import { generateEmbeddings } from "@/lib/embeddings";
import {
  storeChunks,
  deleteDocumentChunks,
  chunkTextWithPositions,
  type DocumentChunk,
} from "@/lib/qdrant";
import { randomUUID } from "crypto";
import { requireApiAuth } from "@/lib/api-auth";
import { requireNotebookOwner } from "@/lib/convex-server";

interface EmbeddingsRequest {
  documentId: string;
  notebookId: string;
  content: string;
  documentName?: string;
}

// A long document fans out into many batched Gemini embedding calls.
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  // Anonymous callers could previously poison any notebook's vector index.
  const { errorResponse } = await requireApiAuth();
  if (errorResponse) return errorResponse;

  try {
    const body: EmbeddingsRequest = await request.json();
    const { documentId, notebookId, content, documentName } = body;

    if (!documentId || !notebookId || !content) {
      return NextResponse.json(
        { error: "Missing required fields: documentId, notebookId, content" },
        { status: 400 }
      );
    }

    // Writing vectors into a notebook you do not own poisons its retrieval.
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

    // Delete existing chunks for this document (in case of re-processing)
    await deleteDocumentChunks(documentId);

    // Split content into chunks with position tracking
    const textChunksWithPositions = chunkTextWithPositions(content, {
      chunkSize: 1000,
      overlap: 200,
    });

    if (textChunksWithPositions.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No content to embed",
        chunksStored: 0,
      });
    }

    const textChunks = textChunksWithPositions.map((c) => c.text);

    // Generate embeddings for all chunks
    const embeddings = await generateEmbeddings(textChunks);

    // Create document chunks with metadata including positions
    const chunks: DocumentChunk[] = textChunksWithPositions.map(
      (chunk, index) => ({
        id: randomUUID(), // Qdrant requires UUID format
        documentId,
        notebookId,
        content: chunk.text,
        chunkIndex: index,
        startChar: chunk.startChar,
        endChar: chunk.endChar,
        pageNumber: chunk.pageNumber,
        metadata: {
          documentName: documentName || "Untitled",
          totalChunks: textChunksWithPositions.length,
        },
      })
    );

    // Store in Qdrant
    await storeChunks(chunks, embeddings);

    return NextResponse.json({
      success: true,
      chunksStored: chunks.length,
      documentId,
    });
  } catch {
    return NextResponse.json(
      { error: "Failed to generate embeddings" },
      { status: 500 }
    );
  }
}

// There is deliberately no DELETE handler. Vector cleanup is cascaded from the
// Convex delete mutations via `internal.cleanup.purgeVectors` (AUDIT.md §4.1),
// so an endpoint that deletes vectors by id would be an attack surface with no
// caller.
