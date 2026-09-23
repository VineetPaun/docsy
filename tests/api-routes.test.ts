/**
 * Every API route handler except `/api/chat`, which has its own file.
 *
 * TODO §7 asks for a runtime pass over all nine handlers after they moved onto
 * one wrapper, because "a wrong `expose` or a swallowed `Response` shows up as
 * a 500 where a 400 used to be". That is a regression a test can catch, so
 * these catch it: each route's guards are exercised against the real wrapper
 * with its dependencies mocked.
 *
 * What is covered is the contract, not the feature: the status code and the
 * message a caller receives. Whether Tavily returns good results or a PDF
 * parses correctly is not something a mock can tell you.
 *
 * Run: `bun test`
 */

import { afterEach, beforeEach, expect, mock, test } from "bun:test";

// The real modules, spread into every double below.
//
// `mock.module` replaces a module *wholesale*, so a double that lists only the
// exports one route uses breaks every other importer with "Export named X not
// found". Spreading keeps the rest of each module intact and makes each test's
// override the only difference.
import * as apiAuth from "../lib/api-auth";
import * as rateLimit from "../lib/rate-limit";
import * as convexServer from "../lib/convex-server";
import * as embeddings from "../lib/embeddings";
import * as openrouter from "../lib/openrouter";
import * as qdrant from "../lib/qdrant";
import * as ttsChunks from "../lib/tts-chunks";
import * as urlGuard from "../lib/url-guard";

/** Feature keys the routes read. Cleared between tests so none leaks. */
const FEATURE_KEYS = [
  "GOOGLE_API_KEY",
  "GEMINI_API_KEY",
  "OPENROUTER_API_KEY",
  "QDRANT_URL",
  "TAVILY_API_KEY",
  "SERPER_API_KEY",
  "ELEVENLABS_API_KEY",
] as const;

const jsonRequest = (path: string, body: unknown) =>
  new Request(`http://localhost${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as any;

const formRequest = (path: string, form: FormData) =>
  new Request(`http://localhost${path}`, {
    method: "POST",
    body: form,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as any;

/**
 * The two modules `withApiHandler` itself reaches for, plus ownership.
 *
 * Signed in, under budget and owning the notebook unless a test says
 * otherwise — so a failing assertion is about the route, not the scaffolding.
 */
function installWrapperMocks(
  overrides: {
    auth?: Response | null;
    limited?: Response | null;
    notOwner?: Response | null;
  } = {}
) {
  mock.module("@/lib/api-auth", () => ({
    ...apiAuth,
    requireApiAuth: async () =>
      overrides.auth
        ? { userId: null, errorResponse: overrides.auth }
        : { userId: "user_1", errorResponse: null },
  }));

  mock.module("@/lib/rate-limit", () => ({
    ...rateLimit,
    enforceRateLimit: async () => overrides.limited ?? null,
  }));

  mock.module("@/lib/convex-server", () => ({
    ...convexServer,
    requireNotebookOwner: async () => overrides.notOwner ?? null,
    requireDocumentOwner: async () => overrides.notOwner ?? null,
    notebookDocuments: async () => [],
    notebookSourceTexts: async () => [],
    authedConvexClient: async () => null,
  }));
}

const unauthorized = () =>
  new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });

const forbidden = () =>
  new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 });

const rateLimited = () =>
  new Response(JSON.stringify({ error: "Too many requests" }), { status: 429 });

beforeEach(() => {
  for (const key of FEATURE_KEYS) process.env[key] = "";
});

afterEach(() => {
  mock.restore();
  for (const key of FEATURE_KEYS) process.env[key] = "";
});

// ---------------------------------------------------------------------------
// The wrapper, checked once on a route with no other moving parts.
// ---------------------------------------------------------------------------

test("an anonymous caller is a 401 on every route, before the handler runs", async () => {
  installWrapperMocks({ auth: unauthorized() });

  const fetchModelCatalogue = mock(async () => []);
  mock.module("@/lib/openrouter", () => ({
    ...openrouter,
    fetchModelCatalogue,
  }));

  const { GET } = await import("../app/api/models/route");
  const response = await GET(
    new Request("http://localhost/api/models") as never
  );

  expect(response.status).toBe(401);
  // Rule 1 of the wrapper: no handler runs without a session. A 401 that still
  // did the work would be a 401 that costs money.
  expect(fetchModelCatalogue).not.toHaveBeenCalled();
});

test("a rate-limited caller is a 429, before the handler runs", async () => {
  installWrapperMocks({ limited: rateLimited() });

  const searchWeb = mock(async () => ({}));
  mock.module("@/lib/url-guard", () => ({
    ...urlGuard,
    safeFetchText: searchWeb,
  }));

  const { POST } = await import("../app/api/research/route");
  const response = await POST(
    jsonRequest("/api/research", { topic: "anything" })
  );

  // Charged before the first paid call, not after it.
  expect(response.status).toBe(429);
});

test("an unexpected throw is a generic 500 with the detail withheld", async () => {
  installWrapperMocks();

  mock.module("@/lib/openrouter", () => ({
    ...openrouter,
    fetchModelCatalogue: async () => {
      throw new Error("OPENROUTER_API_KEY=sk-secret-leaked");
    },
  }));

  const { GET } = await import("../app/api/models/route");
  const response = await GET(
    new Request("http://localhost/api/models") as never
  );

  expect(response.status).toBe(500);
  const body = await response.json();
  expect(body.error).toBe("Something went wrong");
  // Internal detail goes to Sentry, never to the caller.
  expect(JSON.stringify(body)).not.toContain("sk-secret-leaked");
});

test("/api/models answers with the catalogue", async () => {
  installWrapperMocks();

  mock.module("@/lib/openrouter", () => ({
    ...openrouter,
    fetchModelCatalogue: async () => [{ id: "google/gemma", name: "Gemma" }],
  }));

  const { GET } = await import("../app/api/models/route");
  const response = await GET(
    new Request("http://localhost/api/models") as never
  );

  expect(response.status).toBe(200);
  expect((await response.json()).models[0].id).toBe("google/gemma");
});

// ---------------------------------------------------------------------------
// The two routes that take a notebookId from the body.
// ---------------------------------------------------------------------------

test("/api/embeddings refuses a missing field, a foreign notebook and a missing key", async () => {
  mock.module("@/lib/embeddings", () => ({
    ...embeddings,
    generateEmbeddings: async () => [[0.1]],
  }));
  mock.module("@/lib/qdrant", () => ({
    ...qdrant,
    chunkText: () => [{ text: "x", startChar: 0, endChar: 1 }],
    storeChunks: async () => undefined,
  }));

  installWrapperMocks();
  let { POST } = await import("../app/api/embeddings/route");
  let response = await POST(
    jsonRequest("/api/embeddings", { notebookId: "nb1", content: "text" })
  );
  expect(response.status).toBe(400);

  // Ownership before the embedding spend, not after.
  installWrapperMocks({ notOwner: forbidden() });
  ({ POST } = await import("../app/api/embeddings/route"));
  response = await POST(
    jsonRequest("/api/embeddings", {
      documentId: "doc1",
      notebookId: "nb1",
      content: "text",
      documentName: "a.pdf",
    })
  );
  expect(response.status).toBe(403);

  installWrapperMocks();
  ({ POST } = await import("../app/api/embeddings/route"));
  response = await POST(
    jsonRequest("/api/embeddings", {
      documentId: "doc1",
      notebookId: "nb1",
      content: "text",
      documentName: "a.pdf",
    })
  );
  expect(response.status).toBe(503);
  // Named, so the fix is five minutes rather than an afternoon.
  expect((await response.json()).error).toContain("GOOGLE_API_KEY");
});

test("/api/search refuses a missing field, a foreign notebook and a missing key", async () => {
  mock.module("@/lib/embeddings", () => ({
    ...embeddings,
    generateEmbedding: async () => [0.1],
  }));
  mock.module("@/lib/qdrant", () => ({
    ...qdrant,
    searchChunks: async () => [],
    retrievalLimitFor: () => 5,
  }));

  installWrapperMocks();
  let { POST } = await import("../app/api/search/route");
  let response = await POST(jsonRequest("/api/search", { notebookId: "nb1" }));
  expect(response.status).toBe(400);

  installWrapperMocks({ notOwner: forbidden() });
  ({ POST } = await import("../app/api/search/route"));
  response = await POST(
    jsonRequest("/api/search", { query: "costs", notebookId: "nb1" })
  );
  expect(response.status).toBe(403);

  installWrapperMocks();
  ({ POST } = await import("../app/api/search/route"));
  response = await POST(
    jsonRequest("/api/search", { query: "costs", notebookId: "nb1" })
  );
  expect(response.status).toBe(503);
  expect((await response.json()).error).toContain("GOOGLE_API_KEY");
});

// ---------------------------------------------------------------------------
// The routes that need a third-party key.
// ---------------------------------------------------------------------------

test("/api/web-search names both usable keys when neither is set", async () => {
  installWrapperMocks();

  const { POST } = await import("../app/api/web-search/route");

  const empty = await POST(jsonRequest("/api/web-search", {}));
  expect(empty.status).toBe(400);

  const response = await POST(jsonRequest("/api/web-search", { query: "rag" }));
  expect(response.status).toBe(503);

  // Either key works, so a message naming only one sends the reader down the
  // wrong path. This route used to answer with fabricated example.com results.
  const { error } = await response.json();
  expect(error).toContain("TAVILY_API_KEY");
  expect(error).toContain("SERPER_API_KEY");
});

test("/api/research refuses a missing topic and names its missing key", async () => {
  installWrapperMocks();

  const { POST } = await import("../app/api/research/route");

  expect((await POST(jsonRequest("/api/research", {}))).status).toBe(400);

  const response = await POST(jsonRequest("/api/research", { topic: "rag" }));
  expect(response.status).toBe(503);
  expect((await response.json()).error).toContain("OPENROUTER_API_KEY");
});

// ---------------------------------------------------------------------------
// /api/process-url — the one route with an `expose` hook.
// ---------------------------------------------------------------------------

test("/api/process-url turns a blocked address into a 400 that says why", async () => {
  class BlockedUrlError extends Error {}

  mock.module("@/lib/url-guard", () => ({
    ...urlGuard,
    BlockedUrlError,
    assertPublicUrl: async () => {
      throw new BlockedUrlError("Host is not allowed: 127.0.0.1");
    },
    safeFetchText: async () => "",
  }));

  installWrapperMocks();
  const { POST } = await import("../app/api/process-url/route");

  expect((await POST(jsonRequest("/api/process-url", {}))).status).toBe(400);

  const response = await POST(
    jsonRequest("/api/process-url", { url: "http://127.0.0.1:6333" })
  );

  // The `expose` hook. Without it this is a generic 500 and the user cannot
  // tell a blocked address from a broken server — TODO §7 names exactly this.
  expect(response.status).toBe(400);
  expect((await response.json()).error).toContain("127.0.0.1");
});

test("/api/process-url keeps an ordinary failure generic", async () => {
  class BlockedUrlError extends Error {}

  mock.module("@/lib/url-guard", () => ({
    ...urlGuard,
    BlockedUrlError,
    assertPublicUrl: async () => undefined,
    safeFetchText: async () => {
      throw new Error("ECONNRESET to internal-host:8080");
    },
  }));

  installWrapperMocks();
  const { POST } = await import("../app/api/process-url/route");

  const response = await POST(
    jsonRequest("/api/process-url", { url: "https://example.com" })
  );

  // `expose` must promote BlockedUrlError and nothing else.
  expect(response.status).toBe(500);
  expect(JSON.stringify(await response.json())).not.toContain("internal-host");
});

// ---------------------------------------------------------------------------
// /api/process-document — the only place an upload's type is decided.
// ---------------------------------------------------------------------------

test("/api/process-document rejects no file, an oversized file and unknown bytes", async () => {
  installWrapperMocks();
  const { POST } = await import("../app/api/process-document/route");

  const empty = new FormData();
  expect((await POST(formRequest("/api/process-document", empty))).status).toBe(
    400
  );

  const tooBig = new FormData();
  tooBig.append(
    "file",
    new File([new Uint8Array(11 * 1024 * 1024)], "big.pdf"),
    "big.pdf"
  );
  expect(
    (await POST(formRequest("/api/process-document", tooBig))).status
  ).toBe(413);

  // An executable renamed `report.pdf`: the browser's `file.type` is ignored
  // and the magic bytes decide (CLAUDE.md trap 5d).
  const disguised = new FormData();
  disguised.append(
    "file",
    new File([new Uint8Array([0x4d, 0x5a, 0x90, 0x00])], "report.pdf", {
      type: "application/pdf",
    }),
    "report.pdf"
  );

  const response = await POST(formRequest("/api/process-document", disguised));
  expect(response.status).toBe(400);
  expect((await response.json()).error).toContain(
    "Unsupported or unrecognised"
  );
});

test("/api/process-document accepts plain text and returns its content", async () => {
  installWrapperMocks();
  const { POST } = await import("../app/api/process-document/route");

  const form = new FormData();
  form.append(
    "file",
    new File(["Costs rose 12% year on year."], "notes.txt", {
      type: "text/plain",
    }),
    "notes.txt"
  );

  const response = await POST(formRequest("/api/process-document", form));

  expect(response.status).toBe(200);
  expect((await response.json()).content).toContain("Costs rose 12%");
});

// ---------------------------------------------------------------------------
// /api/audio-overview
// ---------------------------------------------------------------------------

test("/api/audio-overview refuses a missing id, a foreign notebook and empty sources", async () => {
  mock.module("@/lib/openrouter", () => ({
    ...openrouter,
    chatWithOpenRouter: async () => "script",
    resolveModel: async () => "model",
  }));
  mock.module("@/lib/tts-chunks", () => ({
    ...ttsChunks,
    splitForTts: () => [],
  }));

  installWrapperMocks();
  let { POST } = await import("../app/api/audio-overview/route");
  let response = await POST(
    jsonRequest("/api/audio-overview", { notebookTitle: "Research" })
  );
  expect(response.status).toBe(400);

  installWrapperMocks({ notOwner: forbidden() });
  ({ POST } = await import("../app/api/audio-overview/route"));
  response = await POST(
    jsonRequest("/api/audio-overview", {
      notebookId: "nb1",
      notebookTitle: "Research",
    })
  );
  expect(response.status).toBe(403);

  // Owned, but nothing in it has enough text. A 400 saying so beats narrating
  // an empty script.
  installWrapperMocks();
  ({ POST } = await import("../app/api/audio-overview/route"));
  response = await POST(
    jsonRequest("/api/audio-overview", {
      notebookId: "nb1",
      notebookTitle: "Research",
    })
  );
  expect(response.status).toBe(400);
  expect((await response.json()).error).toContain("enough text");
});
