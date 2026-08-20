/**
 * `/api/chat` handler tests (AUDIT.md §10).
 *
 * Every other test in this repo covers a pure function, which meant the routes
 * — where the security checks, the 503s and the stream framing live — had no
 * coverage at all. These exercise the handler itself: its dependencies are
 * mocked, but the wrapper, the guards and the NDJSON framing are the real ones.
 *
 * Run: `bun test`
 */

import { afterEach, expect, mock, test } from "bun:test";

/** Reset the module registry between tests so each one installs its own doubles. */
const loadRoute = async () => (await import("../app/api/chat/route")).POST;

const jsonRequest = (body: unknown) =>
  new Request("http://localhost/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as any;

const validBody = {
  notebookId: "nb1",
  notebookTitle: "Research",
  messages: [
    { role: "user", content: "What does the report say about costs?" },
  ],
};

/** The dependencies the route reaches for, with everything set to succeed. */
function installMocks(
  overrides: {
    ownerResponse?: Response | null;
    search?: () => Promise<unknown[]>;
    stream?: () => AsyncGenerator<string>;
  } = {}
) {
  mock.module("@/lib/api-auth", () => ({
    requireApiAuth: async () => ({ userId: "user_1", errorResponse: null }),
  }));

  mock.module("@/lib/rate-limit", () => ({
    enforceRateLimit: async () => null,
  }));

  mock.module("@/lib/convex-server", () => ({
    requireNotebookOwner: async () => overrides.ownerResponse ?? null,
    notebookDocuments: async () => [
      { _id: "doc1", name: "Report.pdf", content: "costs are up" },
    ],
  }));

  mock.module("@/lib/embeddings", () => ({
    generateEmbedding: async () => [0.1, 0.2, 0.3],
  }));

  mock.module("@/lib/qdrant", () => ({
    searchChunks:
      overrides.search ??
      (async () => [
        {
          id: "c1",
          documentId: "doc1",
          documentName: "Report.pdf",
          content: "Costs rose 12% year on year.",
          startChar: 0,
          endChar: 28,
          score: 0.82,
        },
      ]),
    retrievalLimitFor: () => 5,
  }));

  mock.module("@/lib/openrouter", () => ({
    resolveModel: async () => "google/gemma-4-31b-it:free",
    modelContextLength: async () => 32_000,
    streamChatWithOpenRouter:
      overrides.stream ??
      async function* () {
        yield "Costs ";
        yield "rose 12% [1].";
      },
  }));

  mock.module("@/lib/query-rewrite", () => ({
    rewriteQuery: async (question: string) => question,
  }));
}

afterEach(() => {
  mock.restore();
  process.env.GOOGLE_API_KEY = "";
  process.env.QDRANT_URL = "";
  process.env.OPENROUTER_API_KEY = "";
});

/** Read an NDJSON body into the objects it carried. */
async function readNdjson(response: Response) {
  const text = await response.text();

  return text
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line));
}

test("a request with no notebookId is a 400, not an ungrounded answer", async () => {
  installMocks();
  process.env.GOOGLE_API_KEY = "key";
  process.env.QDRANT_URL = "http://qdrant";
  process.env.OPENROUTER_API_KEY = "key";

  const POST = await loadRoute();
  const response = await POST(jsonRequest({ ...validBody, notebookId: "" }));

  expect(response.status).toBe(400);
  expect(await response.json()).toEqual({ error: "notebookId is required" });
});

test("a missing retrieval key is a 503 that names the variable", async () => {
  installMocks();
  process.env.QDRANT_URL = "http://qdrant";
  process.env.OPENROUTER_API_KEY = "key";

  const POST = await loadRoute();
  const response = await POST(jsonRequest(validBody));

  expect(response.status).toBe(503);
  // The whole point of §6.6: the deployment problem is named, not hidden.
  expect((await response.json()).error).toContain("GOOGLE_API_KEY");
});

test("a caller who does not own the notebook gets the ownership response", async () => {
  installMocks({
    ownerResponse: new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
    }),
  });
  process.env.GOOGLE_API_KEY = "key";
  process.env.QDRANT_URL = "http://qdrant";
  process.env.OPENROUTER_API_KEY = "key";

  const POST = await loadRoute();
  const response = await POST(jsonRequest(validBody));

  expect(response.status).toBe(403);
});

test("a retrieval failure is a 502, not a silent answer without sources", async () => {
  installMocks({
    search: async () => {
      throw new Error("qdrant unreachable");
    },
  });
  process.env.GOOGLE_API_KEY = "key";
  process.env.QDRANT_URL = "http://qdrant";
  process.env.OPENROUTER_API_KEY = "key";

  const POST = await loadRoute();
  const response = await POST(jsonRequest(validBody));

  expect(response.status).toBe(502);
  expect((await response.json()).error).toContain("Could not search");
});

test("a successful answer streams meta first, then deltas, then done", async () => {
  installMocks();
  process.env.GOOGLE_API_KEY = "key";
  process.env.QDRANT_URL = "http://qdrant";
  process.env.OPENROUTER_API_KEY = "key";

  const POST = await loadRoute();
  const response = await POST(jsonRequest(validBody));

  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toContain("x-ndjson");

  const events = await readNdjson(response);

  // Citations before the first token is what lets the client render the source
  // header while the answer is still being written (AUDIT.md §8).
  expect(events[0].type).toBe("meta");
  expect(events[0].citations[0].documentName).toBe("Report.pdf");
  expect(events.at(-1).type).toBe("done");

  const answer = events
    .filter((event) => event.type === "delta")
    .map((event) => event.text)
    .join("");

  expect(answer).toBe("Costs rose 12% [1].");
});

test("a mid-stream failure is reported in-band, since the status is already 200", async () => {
  installMocks({
    stream: async function* () {
      yield "Costs ";
      throw new Error("upstream died");
    },
  });
  process.env.GOOGLE_API_KEY = "key";
  process.env.QDRANT_URL = "http://qdrant";
  process.env.OPENROUTER_API_KEY = "key";

  const POST = await loadRoute();
  const response = await POST(jsonRequest(validBody));
  const events = await readNdjson(response);

  expect(response.status).toBe(200);
  expect(events.at(-1).type).toBe("error");
  // Internal detail stays server-side (AUDIT.md §6.5).
  expect(events.at(-1).message).not.toContain("upstream died");
});
