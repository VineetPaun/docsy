/**
 * Gemini embeddings (AUDIT.md §5.1).
 *
 * Replaces `@google/generative-ai` + `text-embedding-004`: the legacy SDK
 * stopped receiving support in 2025 and Google scheduled the legacy embedding
 * endpoints for shutdown around January 2026.
 *
 * `outputDimensionality: 768` keeps Qdrant's vector size unchanged — but the
 * vector *space* is not the old one, so vectors written by `text-embedding-004`
 * are not comparable to queries embedded here. That is why the collection name
 * is versioned in `lib/qdrant.ts`; mixing the two silently degrades retrieval
 * rather than failing.
 *
 * Vectors come back un-normalised at any dimensionality below 3072. Qdrant's
 * `Cosine` distance normalises on upsert, so nothing normalises them here.
 */

import { createHash } from "node:crypto";
import { GoogleGenAI } from "@google/genai";
import { createLruCache } from "./lru";

const EMBEDDING_MODEL = "gemini-embedding-001";
const EMBEDDING_DIMENSION = 768;

/**
 * Documents and queries are embedded with different task types. Same model, but
 * the asymmetric pair is what the model was trained for, and it costs nothing.
 */
type TaskType = "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY";

const MAX_INPUT_CHARS = 10_000;
const BATCH_SIZE = 10;
const MAX_ATTEMPTS = 4;

/**
 * Identical text embeds to an identical vector, and this app re-embeds the same
 * text constantly: the same question asked twice, the same source re-indexed,
 * the same boilerplate chunk appearing in every document of a set (AUDIT.md §8).
 * Each of those is a paid API call and ~300ms of latency for a value we already
 * had.
 *
 * ponytail: process-local and bounded, not Convex-backed. A serverless instance
 * serves many requests before it is recycled, which is where the repeats are;
 * persisting vectors to survive a cold start would cost a database round trip to
 * save an API call, and 768 floats is 6 KB a row.
 */
const EMBEDDING_CACHE_ENTRIES = 500;
const embeddingCache = createLruCache<number[]>(EMBEDDING_CACHE_ENTRIES);

/**
 * Cache key for one embedding.
 *
 * Hashed rather than keyed by the text itself, so the cache holds 32 bytes per
 * key instead of up to 10,000. The task type is part of the key because the
 * same sentence embedded as a document and as a query is deliberately two
 * different vectors.
 *
 * Exported for `lib/embeddings.test.ts`.
 */
export function embeddingCacheKey(text: string, taskType: string): string {
  return `${taskType}:${createHash("sha256").update(text).digest("hex")}`;
}

let client: GoogleGenAI | null = null;

function getClient(): GoogleGenAI {
  if (!client) {
    const apiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GOOGLE_API_KEY or GEMINI_API_KEY not configured");
    }
    client = new GoogleGenAI({ apiKey });
  }
  return client;
}

/**
 * Rate limits and upstream blips are worth another attempt; a malformed request
 * or a bad key is not.
 *
 * Exported for `lib/embeddings.test.ts`.
 */
export function isRetryableEmbeddingError(error: unknown): boolean {
  const status = (error as { status?: unknown })?.status;
  if (typeof status === "number") return status === 429 || status >= 500;

  // The SDK does not always surface a numeric status, so fall back to the text.
  return /\b(429|5\d\d)\b|rate limit|quota|timeout|ECONNRESET/i.test(
    String((error as { message?: unknown })?.message ?? error)
  );
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Embed a batch, serving what the cache already holds.
 *
 * The cache is checked here rather than in `generateEmbedding` so both the
 * query path and the document path get it.
 */
async function embedBatch(
  texts: string[],
  taskType: TaskType
): Promise<number[][]> {
  const prepared = texts.map((text) => text.slice(0, MAX_INPUT_CHARS).trim());

  // Only the misses are sent. Positions are tracked so the returned vectors go
  // back in the caller's order — a batch that silently reorders would attach
  // every chunk's vector to the wrong chunk.
  const results = new Array<number[]>(prepared.length);
  const missing: { index: number; text: string }[] = [];

  prepared.forEach((text, index) => {
    const cached = embeddingCache.get(embeddingCacheKey(text, taskType));
    if (cached) results[index] = cached;
    else missing.push({ index, text });
  });

  if (missing.length === 0) return results;

  const fresh = await embedUncached(
    missing.map((entry) => entry.text),
    taskType
  );

  missing.forEach((entry, i) => {
    results[entry.index] = fresh[i];
    embeddingCache.set(embeddingCacheKey(entry.text, taskType), fresh[i]);
  });

  return results;
}

/** The API call itself: one `embedContent` for the batch, retried on 429/5xx. */
async function embedUncached(
  contents: string[],
  taskType: TaskType
): Promise<number[][]> {
  const ai = getClient();

  for (let attempt = 1; ; attempt++) {
    try {
      const response = await ai.models.embedContent({
        model: EMBEDDING_MODEL,
        contents,
        config: { taskType, outputDimensionality: EMBEDDING_DIMENSION },
      });

      const values = response.embeddings?.map((embedding) => embedding.values);

      // A short or hole-y batch would silently misalign chunks and vectors.
      if (
        !values ||
        values.length !== contents.length ||
        values.some((vector) => !vector?.length)
      ) {
        throw new Error(
          `Gemini returned ${values?.length ?? 0} embeddings for ${contents.length} inputs`
        );
      }

      return values as number[][];
    } catch (error) {
      if (attempt >= MAX_ATTEMPTS || !isRetryableEmbeddingError(error)) {
        throw error;
      }
      await sleep(2 ** attempt * 250); // 500ms, 1s, 2s
    }
  }
}

/** Embed a search query. */
export async function generateEmbedding(text: string): Promise<number[]> {
  const [embedding] = await embedBatch([text], "RETRIEVAL_QUERY");
  return embedding;
}

/** Embed document chunks, in batches, in the order they were given. */
export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  const embeddings: number[][] = [];

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    embeddings.push(
      ...(await embedBatch(
        texts.slice(i, i + BATCH_SIZE),
        "RETRIEVAL_DOCUMENT"
      ))
    );
  }

  return embeddings;
}

export { EMBEDDING_DIMENSION };
