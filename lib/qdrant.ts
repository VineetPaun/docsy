import { QdrantClient, type Schemas } from "@qdrant/js-client-rest";
import { EMBEDDING_DIMENSION } from "./embeddings";
import { documentSparseVector, querySparseVector } from "./bm25";

/**
 * Versioned because the vector layout changed. `_v3` holds two named vectors
 * per point — `dense` (`gemini-embedding-001`, 768 dims) and `bm25` (sparse,
 * `lib/bm25.ts`) — for hybrid search. `_v2` held one unnamed dense vector and
 * cannot be queried by name, so nothing reads it any more. Bump this whenever
 * the model, the dimensionality or the vector layout changes — old points left
 * in place score plausibly and answer wrongly.
 *
 * Sources indexed before this change need re-indexing (the "Reindex" row
 * action); `_v2` can be deleted from Qdrant by hand once that is done. Must
 * match `VECTOR_COLLECTION` in `convex/documents.ts`.
 */
const COLLECTION_NAME = "docsy_documents_v3";

// Vector names inside the collection. Both the write and the query path use
// them, so they live in one place.
const DENSE_VECTOR = "dense";
const SPARSE_VECTOR = "bm25";

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
        [DENSE_VECTOR]: { size: EMBEDDING_DIMENSION, distance: "Cosine" },
      },
      // Qdrant applies IDF at query time from its own corpus statistics, which
      // is the part of BM25 a single chunk cannot compute (`lib/bm25.ts`).
      sparse_vectors: {
        [SPARSE_VECTOR]: { modifier: "idf" },
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

  const points = chunks.map((chunk, i) => {
    const sparse = documentSparseVector(chunk.content);

    return {
      id: chunk.id,
      vector: {
        [DENSE_VECTOR]: embeddings[i],
        // Omitted when the chunk has no indexable terms (all stopwords or
        // punctuation) — named vectors are optional per point, and the dense
        // half still finds it.
        ...(sparse.indices.length > 0 ? { [SPARSE_VECTOR]: sparse } : {}),
      },
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
    };
  });

  await client.upsert(COLLECTION_NAME, {
    points,
    wait: true,
  });
}

// Minimum cosine similarity a chunk must reach on the dense half to be treated
// as relevant. Below this the model still dutifully cites whatever it is
// handed, so a floor here is what stops irrelevant passages appearing as
// citations. The keyword half has no floor: a BM25 hit already shares a
// non-stopword term with the question.
export const DEFAULT_SCORE_THRESHOLD = 0.5;

/**
 * Each half of a hybrid query fetches this many times the final limit before
 * fusion, so a chunk ranked just outside one list can still win on the other.
 */
const PREFETCH_MULTIPLIER = 3;

/**
 * How many chunks to retrieve for a model with this context window (AUDIT.md §7).
 *
 * `limit: 5` was hardcoded regardless of the model, which under-uses a 262K
 * window and is generous for a 32K one. Chunks are ~1,000 characters, so this
 * spends roughly half a percent of the window per chunk and clamps hard at both
 * ends: fewer than five leaves obvious answers unretrieved, more than twenty
 * buries the relevant passage in near-misses (no reranker yet — see §7).
 *
 * Exported for `lib/qdrant.test.ts`.
 */
export const MIN_RETRIEVAL_LIMIT = 5;
export const MAX_RETRIEVAL_LIMIT = 20;

export function retrievalLimitFor(contextLength: number): number {
  if (!Number.isFinite(contextLength) || contextLength <= 0) {
    return MIN_RETRIEVAL_LIMIT;
  }

  const affordable = Math.floor(contextLength / 2000);

  return Math.max(
    MIN_RETRIEVAL_LIMIT,
    Math.min(MAX_RETRIEVAL_LIMIT, affordable)
  );
}

export interface SearchOptions {
  limit?: number;
  documentIds?: string[];
  scoreThreshold?: number;
}

/**
 * The Qdrant request body for one hybrid query.
 *
 * Pure and exported so `lib/qdrant.test.ts` can pin its shape — in particular
 * that the notebook filter reaches every prefetch, which is tenant isolation
 * and fails silently if it ever drops off one branch.
 */
export function buildHybridQuery(
  query: { embedding: number[]; text: string },
  notebookId: string,
  options?: SearchOptions
) {
  const must: Schemas["FieldCondition"][] = [
    { key: "notebookId", match: { value: notebookId } },
  ];

  if (options?.documentIds && options.documentIds.length > 0) {
    must.push({ key: "documentId", match: { any: options.documentIds } });
  }

  const filter = { must };
  const limit = options?.limit ?? 10;
  const prefetchLimit = limit * PREFETCH_MULTIPLIER;
  const sparse = querySparseVector(query.text);

  // The notebook filter sits on every prefetch, not just the outer query:
  // the prefetches are what search the index, and an unfiltered one would
  // rank other tenants' chunks into the fused list.
  const prefetch = [
    {
      query: query.embedding,
      using: DENSE_VECTOR,
      filter,
      limit: prefetchLimit,
      // Filtered server-side by Qdrant so weak matches never cross the wire.
      score_threshold: options?.scoreThreshold ?? DEFAULT_SCORE_THRESHOLD,
    },
    // A question made only of stopwords has no keyword half; Qdrant rejects
    // an empty sparse query rather than returning nothing.
    ...(sparse.indices.length > 0
      ? [{ query: sparse, using: SPARSE_VECTOR, filter, limit: prefetchLimit }]
      : []),
  ];

  return {
    prefetch,
    query: { fusion: "rrf" as const },
    filter,
    limit,
    with_payload: true,
  };
}

/**
 * Hybrid search: dense similarity and BM25 keywords, fused by reciprocal rank.
 *
 * `query.text` must be the text `query.embedding` was generated from — the
 * keyword half tokenizes it. `score` on a result is the RRF score, which
 * orders results but is not a similarity: compare it only within one response.
 */
export async function searchChunks(
  query: { embedding: number[]; text: string },
  notebookId: string,
  options?: SearchOptions
): Promise<SearchResult[]> {
  const client = getQdrantClient();
  await ensureCollection();

  // qdrant-js 1.19 dropped `search()`; `query()` is the universal replacement and
  // wraps the hits in a `points` array.
  const { points } = await client.query(
    COLLECTION_NAME,
    buildHybridQuery(query, notebookId, options)
  );

  return points.map((result) => ({
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

  // Chunks are emitted in ascending `start` order, so the page cursor only
  // ever moves forward. Advancing it in place keeps this O(n + m) instead of
  // rescanning the whole pageBreaks array for every chunk.
  let pageCursor = 0;
  const getPageNumber = (charIndex: number): number => {
    while (
      pageCursor < pageBreaks.length &&
      charIndex > pageBreaks[pageCursor]
    ) {
      pageCursor++;
    }
    return pageCursor + 1;
  };

  const chunks: ChunkWithPosition[] = [];
  let start = 0;

  while (start < text.length) {
    // Clamp so the final chunk can never record an endChar past the text.
    let end = Math.min(start + chunkSize, text.length);

    // Try to break at sentence boundary
    if (end < text.length) {
      const lastPeriod = text.lastIndexOf(".", end);
      const lastNewline = text.lastIndexOf("\n", end);
      const breakPoint = Math.max(lastPeriod, lastNewline);

      if (breakPoint > start + chunkSize / 2) {
        end = breakPoint + 1;
      }
    }

    // Offsets must describe the *trimmed* text that actually gets stored,
    // otherwise citation highlights drift by the amount trimmed off the front.
    const rawChunk = text.slice(start, end);
    const leadingWhitespace = rawChunk.length - rawChunk.trimStart().length;
    const chunkContent = rawChunk.trim();
    const chunkStart = start + leadingWhitespace;

    if (chunkContent.length > 50) {
      chunks.push({
        text: chunkContent,
        startChar: chunkStart,
        endChar: chunkStart + chunkContent.length,
        pageNumber:
          pageBreaks.length > 0 ? getPageNumber(chunkStart) : undefined,
      });
    }

    const nextStart = end - overlap;
    // Guard against a break point that never advances the window.
    if (nextStart <= start) break;
    start = nextStart;
  }

  return chunks;
}
