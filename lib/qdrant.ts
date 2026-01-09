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
  metadata?: Record<string, unknown>;
}

export interface SearchResult {
  id: string;
  documentId: string;
  content: string;
  score: number;
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

// Text chunking utility
export function chunkText(
  text: string,
  options?: { chunkSize?: number; overlap?: number }
): string[] {
  const chunkSize = options?.chunkSize ?? 1000;
  const overlap = options?.overlap ?? 200;

  const chunks: string[] = [];
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

    chunks.push(text.slice(start, end).trim());
    start = end - overlap;
  }

  return chunks.filter((chunk) => chunk.length > 50);
}
