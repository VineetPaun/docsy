/**
 * Conversational query rewriting (AUDIT.md §7).
 *
 * The two pure halves get tests because both fail silently: a rewrite that
 * never triggers leaves follow-ups retrieving garbage, and one that accepts any
 * model output can replace a good question with a paragraph of commentary.
 *
 * Run: `bun test`
 */

import { expect, test } from "bun:test";
import { needsRewrite, sanitiseRewrite } from "./query-rewrite";

test("a first message is never rewritten", () => {
  expect(needsRewrite("What were the Q3 revenue figures?", false)).toBe(false);
});

test("a bare follow-up needs rewriting", () => {
  expect(needsRewrite("what about the second one?", true)).toBe(true);
  expect(needsRewrite("and the costs?", true)).toBe(true);
  expect(needsRewrite("why?", true)).toBe(true);
});

test("a pronoun reference needs rewriting even when long", () => {
  expect(
    needsRewrite(
      "Can you explain how they arrived at that conclusion in the appendix?",
      true
    )
  ).toBe(true);
});

test("a self-contained question is left alone", () => {
  expect(
    needsRewrite("What was the total marketing spend in Q3 2025?", true)
  ).toBe(false);
});

test("an empty message is not sent for rewriting", () => {
  expect(needsRewrite("   ", true)).toBe(false);
});

test("takes the first line and strips a preamble", () => {
  expect(
    sanitiseRewrite(
      "Standalone question: What was the Q3 marketing spend?\n\nI resolved 'it' to the spend.",
      "what about it?"
    )
  ).toBe("What was the Q3 marketing spend?");
});

test("falls back to the original when the model rambles", () => {
  expect(sanitiseRewrite("x".repeat(400), "what about it?")).toBe(
    "what about it?"
  );
});

test("falls back to the original on an empty rewrite", () => {
  expect(sanitiseRewrite("   \n  ", "what about it?")).toBe("what about it?");
});
