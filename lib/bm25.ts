/**
 * BM25 sparse vectors for the keyword half of hybrid search.
 *
 * Dense embeddings miss exact terms, IDs and acronyms: "ISO 27001" and
 * "ISO 9001" embed almost identically. A sparse vector matches the literal
 * tokens instead. This is the same split fastembed's `Bm25` model uses:
 *
 * - a **document** vector carries each term's BM25 term-frequency weight,
 * - a **query** vector carries 1 per distinct term,
 * - Qdrant multiplies in the IDF itself, because the collection declares the
 *   sparse vector with `modifier: "idf"` (`lib/qdrant.ts`). IDF depends on the
 *   whole corpus, so it can only be computed where the corpus lives.
 *
 * ponytail: no stemming. "invoices" does not match "invoice" here; the dense
 * half already covers morphology, and this half exists for exact tokens. Add a
 * stemmer when the eval harness shows keyword misses on inflected words.
 */

// Standard BM25 parameters: k1 caps how much a repeated term counts, b how much
// a long chunk is penalised for being long.
const K1 = 1.2;
const B = 0.75;

/**
 * Typical chunk length in tokens after stopwords are dropped.
 *
 * Chunks are ~1,000 characters (`chunkTextWithPositions`), about 170 words, of
 * which roughly 100 survive the stopword list. Chunks are near-uniform in size,
 * so this barely moves a score — it only has to be the right order of
 * magnitude.
 */
const AVG_CHUNK_TOKENS = 100;

// Words that carry no retrieval signal. Without this, "what does the document
// say about X" matches every chunk containing "the".
const STOPWORDS = new Set(
  (
    "a about above after again against all am an and any are as at be because " +
    "been before being below between both but by can could did do does doing " +
    "down during each few for from further had has have having he her here " +
    "hers herself him himself his how i if in into is it its itself just me " +
    "more most my myself no nor not now of off on once only or other our ours " +
    "ourselves out over own same she should so some such than that the their " +
    "theirs them themselves then there these they this those through to too " +
    "under until up very was we were what when where which while who whom why " +
    "will with would you your yours yourself yourselves"
  ).split(" ")
);

export interface SparseVector {
  indices: number[];
  values: number[];
}

/**
 * Lowercased word tokens, stopwords removed.
 *
 * `\p{L}\p{N}` keeps non-Latin scripts and digits, so "section 4.2" yields
 * "section", "4", "2" and a model number survives as its own token.
 */
export function tokenize(text: string): string[] {
  const words = text
    .normalize("NFKC")
    .toLowerCase()
    .match(/[\p{L}\p{N}]+/gu);
  return (words ?? []).filter((w) => !STOPWORDS.has(w));
}

/**
 * 32-bit FNV-1a, which is what maps a token to a sparse index.
 *
 * ponytail: hashing instead of a vocabulary table. No shared state to keep in
 * step between the indexer and the query path, at the cost of a collision
 * roughly once per few billion token pairs — two unrelated words then match.
 */
export function tokenIndex(token: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < token.length; i++) {
    hash ^= token.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  // Qdrant sparse indices are uint32.
  return hash >>> 0;
}

// Term frequency per index. Keyed by index, not token, so a hash collision
// merges into one entry instead of producing the duplicate index Qdrant rejects.
function termCounts(tokens: string[]): Map<number, number> {
  const counts = new Map<number, number>();
  for (const token of tokens) {
    const index = tokenIndex(token);
    counts.set(index, (counts.get(index) ?? 0) + 1);
  }
  return counts;
}

/** Sparse vector for a chunk being indexed: BM25 term-frequency weights. */
export function documentSparseVector(text: string): SparseVector {
  const tokens = tokenize(text);
  const lengthNorm = 1 - B + B * (tokens.length / AVG_CHUNK_TOKENS);
  const vector: SparseVector = { indices: [], values: [] };

  for (const [index, tf] of termCounts(tokens)) {
    vector.indices.push(index);
    vector.values.push((tf * (K1 + 1)) / (tf + K1 * lengthNorm));
  }

  return vector;
}

/** Sparse vector for a search query: 1 per distinct term. */
export function querySparseVector(text: string): SparseVector {
  const indices = [...termCounts(tokenize(text)).keys()];
  return { indices, values: indices.map(() => 1) };
}
