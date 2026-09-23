/**
 * Page-number attribution in `chunkTextWithPositions` (AUDIT.md §4.9), the
 * retrieval limit, and the shape of the hybrid query `searchChunks` sends.
 *
 * `/api/process-document` joins a PDF's pages with `\f`, and this is the code
 * that turns those form feeds back into a page number per chunk. It is index
 * arithmetic over a moving cursor, so it fails silently — a wrong page number
 * looks exactly like a right one in the UI.
 *
 * Run: `bun test`
 *
 * The filler deliberately contains no `.` and no `\n`, so the sentence-boundary
 * break in the chunker never fires and chunk offsets stay exactly predictable.
 */

import { expect, test } from "bun:test";
import {
  DEFAULT_SCORE_THRESHOLD,
  MAX_RETRIEVAL_LIMIT,
  MIN_RETRIEVAL_LIMIT,
  buildHybridQuery,
  chunkTextWithPositions,
  retrievalLimitFor,
} from "./qdrant";

const PAGE_LEN = 600;
const page = (n: number) => String(n).repeat(PAGE_LEN);

// Pages 1..3 joined the way the PDF route joins them.
const threePages = [page(1), page(2), page(3)].join("\f");

test("form-feed joined pages get per-chunk page numbers", () => {
  const chunks = chunkTextWithPositions(threePages, {
    chunkSize: 200,
    overlap: 0,
  });

  expect(chunks.length).toBeGreaterThan(3);
  expect(chunks[0].pageNumber).toBe(1);
  expect(chunks[chunks.length - 1].pageNumber).toBe(3);
  expect(chunks.some((c) => c.pageNumber === 2)).toBe(true);

  // The cursor only moves forward, so page numbers must never regress.
  const pageNumbers = chunks.map((c) => c.pageNumber!);
  expect(pageNumbers).toEqual([...pageNumbers].sort((a, b) => a - b));

  // A chunk is attributed to the page its *start* falls on. Every chunk that
  // reports page 2 must therefore begin inside page 2's slice of the text.
  const secondPageStart = PAGE_LEN + 1;
  const thirdPageStart = PAGE_LEN * 2 + 2;
  for (const chunk of chunks.filter((c) => c.pageNumber === 2)) {
    expect(chunk.startChar).toBeGreaterThanOrEqual(secondPageStart);
    expect(chunk.startChar).toBeLessThan(thirdPageStart);
  }
});

test("text with no page breaks reports no page number", () => {
  const chunks = chunkTextWithPositions(page(1), {
    chunkSize: 200,
    overlap: 0,
  });

  expect(chunks.length).toBeGreaterThan(0);
  expect(chunks.every((c) => c.pageNumber === undefined)).toBe(true);
});

/**
 * Retrieval breadth scales with the model's context window (AUDIT.md §7).
 *
 * The clamps are the point: an unclamped `context / 2000` asks a 1M-token model
 * for 500 chunks, and a catalogue miss (contextLength 0) would ask for none.
 */

test("scales k with the context window, within bounds", () => {
  expect(retrievalLimitFor(32_000)).toBe(16);
  expect(retrievalLimitFor(262_144)).toBe(MAX_RETRIEVAL_LIMIT);
  expect(retrievalLimitFor(1_000_000)).toBe(MAX_RETRIEVAL_LIMIT);
});

test("an unknown context window retrieves the floor, not nothing", () => {
  expect(retrievalLimitFor(0)).toBe(MIN_RETRIEVAL_LIMIT);
  expect(retrievalLimitFor(Number.NaN)).toBe(MIN_RETRIEVAL_LIMIT);
  expect(retrievalLimitFor(4_000)).toBe(MIN_RETRIEVAL_LIMIT);
});

// Hybrid query shape. The filter on each prefetch is tenant isolation: the
// prefetches are what search the index, so one missing it would fuse other
// notebooks' chunks into the answer.
const embedding = [0.1, 0.2, 0.3];

test("every prefetch and the outer query carry the notebook filter", () => {
  const body = buildHybridQuery(
    { embedding, text: "quarterly revenue" },
    "nb_1",
    { documentIds: ["doc_a"] }
  );

  expect(body.prefetch).toHaveLength(2);

  for (const filter of [body.filter, ...body.prefetch.map((p) => p.filter)]) {
    expect(filter.must).toContainEqual({
      key: "notebookId",
      match: { value: "nb_1" },
    });
    expect(filter.must).toContainEqual({
      key: "documentId",
      match: { any: ["doc_a"] },
    });
  }
});

test("dense half keeps the score floor, keyword half has none", () => {
  const body = buildHybridQuery({ embedding, text: "revenue" }, "nb_1", {
    limit: 5,
  });
  const [dense, sparse] = body.prefetch;

  expect(dense).toMatchObject({
    using: "dense",
    query: embedding,
    score_threshold: DEFAULT_SCORE_THRESHOLD,
    limit: 15,
  });
  expect(sparse).toMatchObject({ using: "bm25", limit: 15 });
  expect("score_threshold" in sparse).toBe(false);
  expect(body.query).toEqual({ fusion: "rrf" });
  expect(body.limit).toBe(5);
});

test("a stopword-only question skips the keyword half", () => {
  const body = buildHybridQuery({ embedding, text: "what is it?" }, "nb_1");
  expect(body.prefetch).toHaveLength(1);
  expect(body.prefetch[0].using).toBe("dense");
});

test("an empty document selection searches the whole notebook", () => {
  const body = buildHybridQuery({ embedding, text: "revenue" }, "nb_1", {
    documentIds: [],
  });
  expect(body.filter.must).toHaveLength(1);
});
