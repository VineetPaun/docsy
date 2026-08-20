import type { NextRequest } from "next/server";
import { generateEmbeddings } from "@/lib/embeddings";
import {
  storeChunks,
  deleteDocumentChunks,
  chunkTextWithPositions,
  type DocumentChunk,
} from "@/lib/qdrant";
import { randomUUID } from "crypto";
import { badRequest, missingEnv, withApiHandler } from "@/lib/api-handler";
import { requireNotebookOwner } from "@/lib/convex-server";

interface EmbeddingsRequest {
  documentId: string;
  notebookId: string;
  content: string;
  documentName?: string;
}

// A long document fans out into many batched Gemini embedding calls.
export const maxDuration = 300;

export const POST = withApiHandler(
  async (request: NextRequest) => {
    const body: EmbeddingsRequest = await request.json();
    const { documentId, notebookId, content, documentName } = body;

    if (!documentId || !notebookId || !content) {
      throw badRequest(
        "Missing required fields: documentId, notebookId, content"
      );
    }

    // Writing vectors into a notebook you do not own poisons its retrieval.
    const notOwner = await requireNotebookOwner(notebookId);
    if (notOwner) return notOwner;

    if (!(process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY)) {
      throw missingEnv("GOOGLE_API_KEY", "Indexing");
    }

    // Delete existing chunks for this document (in case of re-processing)
    await deleteDocumentChunks(documentId);

    // Split content into chunks with position tracking
    const textChunksWithPositions = chunkTextWithPositions(content, {
      chunkSize: 1000,
      overlap: 200,
    });

    if (textChunksWithPositions.length === 0) {
      return { success: true, message: "No content to embed", chunksStored: 0 };
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

    return { success: true, chunksStored: chunks.length, documentId };
  },
  { fallbackMessage: "Failed to generate embeddings" }
);

// There is deliberately no DELETE handler. Vector cleanup is cascaded from the
// Convex delete mutations via `internal.cleanup.purgeVectors` (AUDIT.md §4.1),
// so an endpoint that deletes vectors by id would be an attack surface with no
// caller.
