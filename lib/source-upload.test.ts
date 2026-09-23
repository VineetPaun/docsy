/**
 * The text-splitting half of source ingestion (AUDIT.md §8).
 *
 * A Convex document is capped at 1 MB, so the extracted text lives in file
 * storage and the row keeps a snippet. What is worth pinning is the split
 * itself: the row must never receive more than the snippet, the recorded
 * length must describe the *whole* text, and a storage failure must still
 * produce a usable source rather than throwing away the upload.
 */

import { describe, expect, it } from "bun:test";
import { SOURCE_SNIPPET_CHARS, storeSourceText } from "./source-upload";

/** A fake upload endpoint: records what it was handed, answers with an id. */
function fakeUpload(options: { ok?: boolean; throws?: boolean } = {}) {
  const received: string[] = [];

  globalThis.fetch = (async (_url: string, init: RequestInit) => {
    if (options.throws) throw new Error("network down");

    received.push(await (init.body as Blob).text());

    return {
      ok: options.ok ?? true,
      json: async () => ({ storageId: "kg2stored" }),
    } as Response;
  }) as typeof fetch;

  return {
    generateUploadUrl: async () => "https://example.convex.cloud/upload",
    received,
  };
}

describe("storeSourceText", () => {
  it("keeps short text inline and stores nothing", async () => {
    const { generateUploadUrl, received } = fakeUpload();

    const result = await storeSourceText(generateUploadUrl, "short source");

    expect(result.content).toBe("short source");
    expect(result.contentLength).toBe(12);
    expect(result.contentStorageId).toBeUndefined();
    // An extra stored blob per web snippet is not worth the storage call.
    expect(received).toHaveLength(0);
  });

  it("stores the full text and keeps only a snippet on the row", async () => {
    const text = "x".repeat(SOURCE_SNIPPET_CHARS * 3);
    const { generateUploadUrl, received } = fakeUpload();

    const result = await storeSourceText(generateUploadUrl, text);

    // The row never sees more than the snippet — that is the 1 MB fix.
    expect(result.content).toHaveLength(SOURCE_SNIPPET_CHARS);
    // The length describes the whole source, not what the row holds, or every
    // long source would report the same size in the list.
    expect(result.contentLength).toBe(text.length);
    expect(result.contentStorageId).toBe("kg2stored");
    expect(received[0]).toBe(text);
  });

  it("falls back to the snippet when storage refuses", async () => {
    const text = "y".repeat(SOURCE_SNIPPET_CHARS + 1);
    const { generateUploadUrl } = fakeUpload({ ok: false });

    const result = await storeSourceText(generateUploadUrl, text);

    expect(result.contentStorageId).toBeUndefined();
    expect(result.content).toHaveLength(SOURCE_SNIPPET_CHARS);
    expect(result.contentLength).toBe(text.length);
  });

  it("does not throw when the upload never connects", async () => {
    const text = "z".repeat(SOURCE_SNIPPET_CHARS + 1);
    const { generateUploadUrl } = fakeUpload({ throws: true });

    // A failed text blob must not lose an otherwise good upload.
    const result = await storeSourceText(generateUploadUrl, text);

    expect(result.contentStorageId).toBeUndefined();
    expect(result.contentLength).toBe(text.length);
  });
});
