/**
 * Narration chunking for ElevenLabs (AUDIT.md §4.3).
 *
 * The whole point of chunking is that no narration is lost, so the invariant
 * worth testing is that rejoining the chunks reproduces the input's words — a
 * splitter that quietly drops a sentence would look identical in the UI.
 *
 * Run: `bun test`
 */

import { expect, test } from "bun:test";
import { concatAudio, splitForTts } from "./tts-chunks";

const words = (s: string) => s.split(/\s+/).filter(Boolean);

test("short text stays one chunk", () => {
  expect(splitForTts("Hello there. Short script.", 100)).toEqual([
    "Hello there. Short script.",
  ]);
});

test("empty or whitespace text yields no chunks", () => {
  expect(splitForTts("", 100)).toEqual([]);
  expect(splitForTts("   \n  ", 100)).toEqual([]);
});

test("splits on sentence boundaries, never mid-word", () => {
  const text = "One two three. Four five six. Seven eight nine.";
  const chunks = splitForTts(text, 20);

  expect(chunks.length).toBeGreaterThan(1);
  for (const chunk of chunks) {
    expect(chunk.length).toBeLessThanOrEqual(20);
    expect(chunk).toMatch(/[.!?]$/);
  }
});

test("loses no words, whatever the limit", () => {
  const text =
    "Intro sentence here. A second one follows! Then a question? " +
    "And a final, longer sentence to push past the limit.";

  for (const limit of [10, 25, 60, 200]) {
    expect(words(splitForTts(text, limit).join(" "))).toEqual(words(text));
  }
});

test("packs whole words when one sentence exceeds the limit", () => {
  const chunks = splitForTts("alpha beta gamma delta epsilon zeta.", 15);

  expect(chunks.every((c) => c.length <= 15)).toBe(true);
  // No chunk starts or ends mid-word.
  expect(words(chunks.join(" "))).toEqual(
    words("alpha beta gamma delta epsilon zeta.")
  );
});

test("cuts mid-word only for a single word longer than the limit", () => {
  const long = `${"a".repeat(250)}.`;
  const chunks = splitForTts(long, 100);

  expect(chunks.every((c) => c.length <= 100)).toBe(true);
  expect(chunks.join("")).toBe(long);
});

test("packs whole sentences rather than one chunk each", () => {
  // Three 14-char sentences, 30-char limit: two fit together, then the third.
  const chunks = splitForTts("Aaa bbb ccc d. Eee fff ggg h. Iii jjj kkk l.", 30);
  expect(chunks).toEqual(["Aaa bbb ccc d. Eee fff ggg h.", "Iii jjj kkk l."]);
});

test("concatAudio joins segments in order", () => {
  const a = new Uint8Array([1, 2, 3]);
  const b = new Uint8Array([4, 5]);

  expect(Array.from(new Uint8Array(concatAudio([a.buffer, b.buffer])))).toEqual([
    1, 2, 3, 4, 5,
  ]);
});
