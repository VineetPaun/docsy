/**
 * The retry predicate decides whether a failed document ingestion is retried or
 * abandoned, so it is worth pinning: retry rate limits and upstream faults,
 * never a bad request or a bad key (AUDIT.md §5.1).
 */

import { expect, test } from "bun:test";
import { isRetryableEmbeddingError } from "./embeddings";

test("retries rate limits and server faults", () => {
  expect(isRetryableEmbeddingError({ status: 429 })).toBe(true);
  expect(isRetryableEmbeddingError({ status: 503 })).toBe(true);
  expect(isRetryableEmbeddingError(new Error("429 Too Many Requests"))).toBe(
    true
  );
  expect(isRetryableEmbeddingError(new Error("quota exceeded"))).toBe(true);
});

test("gives up on client errors", () => {
  expect(isRetryableEmbeddingError({ status: 400 })).toBe(false);
  expect(isRetryableEmbeddingError({ status: 403 })).toBe(false);
  // A numeric status wins over the message, so a 400 that happens to mention a
  // model name with digits is still not retried.
  expect(
    isRetryableEmbeddingError({ status: 400, message: "gemini-embedding-001" })
  ).toBe(false);
  expect(isRetryableEmbeddingError(new Error("API key not valid"))).toBe(false);
});
