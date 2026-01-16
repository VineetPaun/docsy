import { QdrantClient } from "@qdrant/js-client-rest";
import { EMBEDDING_DIMENSION } from "./embeddings";

const COLLECTION_NAME = "docsy_documents";

let qdrantClient: QdrantClient | null = null;

function getQdrantClient(): QdrantClient {
  if (!qdrantClient) {
    const url = process.env.QDRANT_URL || "http://localhost:6333";
    const apiKey = process.env.QDRANT_API_KEY;

    qdrantClient = new QdrantClient({
      url,
      apiKey,
    });
  }
  return qdrantClient;
}

export interface DocumentChunk {
  id: string;
  documentId: string;
  notebookId: string;
  content: string;
  chunkIndex: number;
  startChar: number;
  endChar: number;
  pageNumber?: number;
  metadata?: Record<string, unknown>;
}

export interface SearchResult {
  id: string;
  documentId: string;
  content: string;
  score: number;
  startChar: number;
  endChar: number;
  pageNumber?: number;
  documentName?: string;
  metadata?: Record<string, unknown>;
}

// Initialize collection if it doesn't exist
export async function ensureCollection(): Promise<void> {
  const client = getQdrantClient();

  try {
    await client.getCollection(COLLECTION_NAME);
  } catch {
    // Collection doesn't exist, create it
    await client.createCollection(COLLECTION_NAME, {
      vectors: {
        size: EMBEDDING_DIMENSION,
        distance: "Cosine",
      },
    });

    // Create payload indexes for filtering
    await client.createPayloadIndex(COLLECTION_NAME, {
      field_name: "notebookId",
      field_schema: "keyword",
    });

    await client.createPayloadIndex(COLLECTION_NAME, {
      field_name: "documentId",
      field_schema: "keyword",
    });
  }
}

// Store document chunks with embeddings
export async function storeChunks(
  chunks: DocumentChunk[],
  embeddings: number[][]
): Promise<void> {
  const client = getQdrantClient();
  await ensureCollection();

  const points = chunks.map((chunk, i) => ({
    id: chunk.id,
    vector: embeddings[i],
    payload: {
      documentId: chunk.documentId,
      notebookId: chunk.notebookId,
      content: chunk.content,
      chunkIndex: chunk.chunkIndex,
      startChar: chunk.startChar,
      endChar: chunk.endChar,
      pageNumber: chunk.pageNumber,
      ...chunk.metadata,
    },
  }));

  await client.upsert(COLLECTION_NAME, {
    points,
    wait: true,
  });
}

// Search for similar chunks
export async function searchChunks(
  embedding: number[],
  notebookId: string,
  options?: {
    limit?: number;
    documentIds?: string[];
  }
): Promise<SearchResult[]> {
  const client = getQdrantClient();
  await ensureCollection();

  const filter: Record<string, unknown> = {
    must: [{ key: "notebookId", match: { value: notebookId } }],
  };

  if (options?.documentIds && options.documentIds.length > 0) {
    (filter.must as unknown[]).push({
      key: "documentId",
      match: { any: options.documentIds },
    });
  }

  const results = await client.search(COLLECTION_NAME, {
    vector: embedding,
    filter,
    limit: options?.limit ?? 10,
    with_payload: true,
  });

  return results.map((result) => ({
    id: result.id as string,
    documentId: result.payload?.documentId as string,
    content: result.payload?.content as string,
    score: result.score,
    startChar: (result.payload?.startChar as number) ?? 0,
    endChar: (result.payload?.endChar as number) ?? 0,
    pageNumber: result.payload?.pageNumber as number | undefined,
    documentName: result.payload?.documentName as string | undefined,
    metadata: result.payload as Record<string, unknown>,
  }));
}

// Delete chunks for a document
export async function deleteDocumentChunks(documentId: string): Promise<void> {
  const client = getQdrantClient();
  await ensureCollection();

  await client.delete(COLLECTION_NAME, {
    filter: {
      must: [{ key: "documentId", match: { value: documentId } }],
    },
  });
}

// Delete all chunks for a notebook
export async function deleteNotebookChunks(notebookId: string): Promise<void> {
  const client = getQdrantClient();
  await ensureCollection();

  await client.delete(COLLECTION_NAME, {
    filter: {
      must: [{ key: "notebookId", match: { value: notebookId } }],
    },
  });
}

// Text chunking utility with position tracking
export interface ChunkWithPosition {
  text: string;
  startChar: number;
  endChar: number;
  pageNumber?: number;
}

export function chunkText(
  text: string,
  options?: { chunkSize?: number; overlap?: number }
): string[] {
  return chunkTextWithPositions(text, options).map((chunk) => chunk.text);
}

export function chunkTextWithPositions(
  text: string,
  options?: { chunkSize?: number; overlap?: number }
): ChunkWithPosition[] {
  const chunkSize = options?.chunkSize ?? 1000;
  const overlap = options?.overlap ?? 200;

  // Detect page boundaries (form feed characters or page markers)
  const pageBreaks: number[] = [];
  let searchIndex = 0;
  while (searchIndex < text.length) {
    const ffIndex = text.indexOf("\f", searchIndex);
    const pageMarkerIndex = text.indexOf("\n--- Page ", searchIndex);

    if (
      ffIndex !== -1 &&
      (pageMarkerIndex === -1 || ffIndex < pageMarkerIndex)
    ) {
      pageBreaks.push(ffIndex);
      searchIndex = ffIndex + 1;
    } else if (pageMarkerIndex !== -1) {
      pageBreaks.push(pageMarkerIndex);
      searchIndex = pageMarkerIndex + 1;
    } else {
      break;
    }
  }

  const getPageNumber = (charIndex: number): number => {
    let page = 1;
    for (const breakPoint of pageBreaks) {
      if (charIndex > breakPoint) {
        page++;
      } else {
        break;
      }
    }
    return page;
  };

  const chunks: ChunkWithPosition[] = [];
  let start = 0;

  while (start < text.length) {
    let end = start + chunkSize;

    // Try to break at sentence boundary
    if (end < text.length) {
      const lastPeriod = text.lastIndexOf(".", end);
      const lastNewline = text.lastIndexOf("\n", end);
      const breakPoint = Math.max(lastPeriod, lastNewline);

      if (breakPoint > start + chunkSize / 2) {
        end = breakPoint + 1;
      }
    }

    const chunkText = text.slice(start, end).trim();
    if (chunkText.length > 50) {
      chunks.push({
        text: chunkText,
        startChar: start,
        endChar: end,
        pageNumber: pageBreaks.length > 0 ? getPageNumber(start) : undefined,
      });
    }

    start = end - overlap;
  }

  return chunks;
}
