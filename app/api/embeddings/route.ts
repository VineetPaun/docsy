import { NextRequest, NextResponse } from "next/server";
import { generateEmbeddings } from "@/lib/embeddings";
import {
  storeChunks,
  deleteDocumentChunks,
  chunkTextWithPositions,
  type DocumentChunk,
} from "@/lib/qdrant";
import { randomUUID } from "crypto";

interface EmbeddingsRequest {
  documentId: string;
  notebookId: string;
  content: string;
  documentName?: string;
}

export async function POST(request: NextRequest) {
  try {
    const body: EmbeddingsRequest = await request.json();
    const { documentId, notebookId, content, documentName } = body;

    console.log(
      `[embeddings] Request received - documentId: ${documentId}, notebookId: ${notebookId}, content length: ${content?.length || 0}`
    );

    if (!documentId || !notebookId || !content) {
      console.error(`[embeddings] Missing required fields`);
      return NextResponse.json(
        { error: "Missing required fields: documentId, notebookId, content" },
        { status: 400 }
      );
    }

    // Check for API key
    const apiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.error(`[embeddings] No API key configured`);
      return NextResponse.json(
        { error: "GOOGLE_API_KEY or GEMINI_API_KEY not configured" },
        { status: 500 }
      );
    }

    console.log(
      `[embeddings] Deleting existing chunks for document: ${documentId}`
    );
    // Delete existing chunks for this document (in case of re-processing)
    await deleteDocumentChunks(documentId);

    // Split content into chunks with position tracking
    const textChunksWithPositions = chunkTextWithPositions(content, {
      chunkSize: 1000,
      overlap: 200,
    });

    console.log(
      `[embeddings] Created ${textChunksWithPositions.length} chunks from content`
    );

    if (textChunksWithPositions.length === 0) {
      console.log(`[embeddings] No content to embed`);
      return NextResponse.json({
        success: true,
        message: "No content to embed",
        chunksStored: 0,
      });
    }

    const textChunks = textChunksWithPositions.map((c) => c.text);

    console.log(
      `[embeddings] Generating embeddings for ${textChunks.length} chunks`
    );
    // Generate embeddings for all chunks
    const embeddings = await generateEmbeddings(textChunks);
    console.log(`[embeddings] Generated ${embeddings.length} embeddings`);

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

    console.log(`[embeddings] Storing ${chunks.length} chunks in Qdrant`);
    // Store in Qdrant
    await storeChunks(chunks, embeddings);
    console.log(
      `[embeddings] Successfully stored chunks for document: ${documentName}`
    );

    return NextResponse.json({
      success: true,
      chunksStored: chunks.length,
      documentId,
    });
  } catch (error) {
    console.error("[embeddings] API error:", error);
    return NextResponse.json(
      { error: "Failed to generate embeddings" },
      { status: 500 }
    );
  }
}

// DELETE endpoint to remove document embeddings
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const documentId = searchParams.get("documentId");

    if (!documentId) {
      return NextResponse.json(
        { error: "Missing documentId parameter" },
        { status: 400 }
      );
    }

    await deleteDocumentChunks(documentId);

    return NextResponse.json({
      success: true,
      message: `Deleted embeddings for document ${documentId}`,
    });
  } catch (error) {
    console.error("Delete embeddings error:", error);
    return NextResponse.json(
      { error: "Failed to delete embeddings" },
      { status: 500 }
    );
  }
}
