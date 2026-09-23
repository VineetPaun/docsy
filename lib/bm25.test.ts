/**
 * The BM25 sparse encoder behind the keyword half of hybrid search.
 *
 * Qdrant cannot tell a well-formed sparse vector from a useless one — a
 * stopword-heavy vector or a document/query pair tokenized differently just
 * retrieves nothing, silently. These pin the properties retrieval relies on.
 *
 * Run: `bun test`
 */

import { expect, test } from "bun:test";
import {
  documentSparseVector,
  querySparseVector,
  tokenIndex,
  tokenize,
} from "./bm25";

test("tokenize lowercases, splits on punctuation and drops stopwords", () => {
  expect(tokenize("What does the ISO-27001 audit say?")).toEqual([
    "iso",
    "27001",
    "audit",
    "say",
  ]);
});

test("tokenize keeps non-Latin scripts", () => {
  expect(tokenize("Ünïcode 東京 résumé")).toEqual([
    "ünïcode",
    "東京",
    "résumé",
  ]);
});

test("tokenIndex is a stable uint32", () => {
  const index = tokenIndex("invoice");
  expect(index).toBe(tokenIndex("invoice"));
  expect(index).not.toBe(tokenIndex("invoices"));
  expect(Number.isInteger(index)).toBe(true);
  expect(index).toBeGreaterThanOrEqual(0);
  expect(index).toBeLessThan(2 ** 32);
});

test("a query and a document share indices for the same term", () => {
  const doc = documentSparseVector("The SKU-4471 widget ships in March.");
  const query = querySparseVector("when does sku 4471 ship");

  const shared = query.indices.filter((i) => doc.indices.includes(i));
  expect(shared).toContain(tokenIndex("sku"));
  expect(shared).toContain(tokenIndex("4471"));
});

test("indices are unique and aligned with values", () => {
  const doc = documentSparseVector("alpha beta alpha gamma alpha beta");
  expect(new Set(doc.indices).size).toBe(doc.indices.length);
  expect(doc.values.length).toBe(doc.indices.length);

  const query = querySparseVector("alpha alpha beta");
  expect(query.indices.length).toBe(2);
  expect(query.values).toEqual([1, 1]);
});

test("repeated terms weigh more, with diminishing returns", () => {
  const weightOf = (text: string, term: string) => {
    const v = documentSparseVector(text);
    return v.values[v.indices.indexOf(tokenIndex(term))];
  };

  const once = weightOf("kiwi apple", "kiwi");
  const twice = weightOf("kiwi kiwi apple", "kiwi");
  const thrice = weightOf("kiwi kiwi kiwi apple", "kiwi");

  expect(twice).toBeGreaterThan(once);
  expect(thrice - twice).toBeLessThan(twice - once);
});

test("stopword-only text produces an empty vector", () => {
  // `searchChunks` and `storeChunks` both skip the sparse half on this, since
  // Qdrant rejects an empty sparse query.
  expect(querySparseVector("what is it?").indices).toEqual([]);
  expect(documentSparseVector("...").indices).toEqual([]);
});
