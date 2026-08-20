/**
 * The catalogue filter decides what a user can spend money on and what the
 * picker labels FREE, so it is worth pinning against real response shapes from
 * `GET https://openrouter.ai/api/v1/models` (AUDIT.md §5.6).
 */

import { expect, test } from "bun:test";
import {
  DEFAULT_MODEL,
  getModelsByProvider,
  withPromptCaching,
  type ChatMessage,
  providerInfo,
  isOfferedModel,
  parseStreamLine,
  pickDefaultModel,
  toModelInfo,
} from "./openrouter";

const freeModel = {
  id: "google/gemma-4-31b-it:free",
  name: "Google: Gemma 4 31B (free)",
  description: "Gemma 4 is a multimodal open model. It handles long context.",
  context_length: 262144,
  pricing: { prompt: "0" },
  architecture: { output_modalities: ["text"] },
};

const paidAllowlisted = {
  id: "openai/gpt-4o-mini",
  name: "OpenAI: GPT-4o mini",
  context_length: 128000,
  pricing: { prompt: "0.00000015" },
  architecture: { output_modalities: ["text"] },
};

test("offers free text models and allowlisted paid ones", () => {
  expect(isOfferedModel(freeModel)).toBe(true);
  expect(isOfferedModel(paidAllowlisted)).toBe(true);
});

test("rejects paid models that are not allowlisted", () => {
  expect(
    isOfferedModel({ ...paidAllowlisted, id: "some/expensive-model" })
  ).toBe(false);
});

test("rejects meta-routers and non-text output", () => {
  // Variable pricing (`-1`), so it can be labelled neither FREE nor PRO.
  expect(
    isOfferedModel({ id: "openrouter/auto", pricing: { prompt: "-1" } })
  ).toBe(false);

  expect(
    isOfferedModel({
      id: "google/lyria-3-pro-preview",
      pricing: { prompt: "0" },
      architecture: { output_modalities: ["audio"] },
    })
  ).toBe(false);
});

test("strips the vendor prefix and summarises for the picker", () => {
  const info = toModelInfo(freeModel);

  expect(info.name).toBe("Gemma 4 31B (free)");
  expect(info.tier).toBe("free");
  expect(info.provider).toBe("google");
  expect(info.contextLength).toBe(262144);
  expect(info.description).toBe(
    "Free · 262K context · Gemma 4 is a multimodal open model."
  );
});

test("keeps an unknown vendor as its own provider", () => {
  // Previously collapsed to "other", which put every vendor added after this
  // file was written into one anonymous group (AUDIT.md §5.6).
  expect(
    toModelInfo({ ...freeModel, id: "poolside/laguna-s-2.1:free" }).provider
  ).toBe("poolside");
});

test("an unlisted vendor still gets a name and a stable colour", () => {
  const info = providerInfo("inclusionai");

  expect(info.name).toBe("Inclusionai");
  expect(info.color).toBe(providerInfo("inclusionai").color);
  expect(info.color).not.toBe(providerInfo("poolside").color);
});

test("a listed vendor keeps its real capitalisation", () => {
  expect(providerInfo("openai").name).toBe("OpenAI");
});

test("grouping contains only the providers present", () => {
  const groups = getModelsByProvider([
    toModelInfo(freeModel),
    toModelInfo({ ...freeModel, id: "poolside/laguna-s-2.1:free" }),
  ]);

  expect(Object.keys(groups).sort()).toEqual(["google", "poolside"]);
  expect(groups.google).toHaveLength(1);
});

test("labels an allowlisted paid model premium", () => {
  expect(toModelInfo(paidAllowlisted).tier).toBe("premium");
});

/**
 * SSE line parsing for streamed completions (AUDIT.md §8).
 *
 * The stream is parsed by hand rather than with the Vercel AI SDK, so the line
 * handling is ours to get right — and a parser that silently drops deltas looks
 * identical to a slow model.
 */

test("extracts the delta text from a content chunk", () => {
  const line = `data: ${JSON.stringify({
    choices: [{ delta: { content: "Hello" } }],
  })}`;
  expect(parseStreamLine(line)).toBe("Hello");
});

test("recognises the terminator", () => {
  expect(parseStreamLine("data: [DONE]")).toBe("done");
});

test("skips lines with no usable text", () => {
  // Keep-alive comment, non-data line, blank line.
  expect(parseStreamLine(": ping")).toBeNull();
  expect(parseStreamLine("event: message")).toBeNull();
  expect(parseStreamLine("")).toBeNull();

  // Role-only opening chunk, and an empty delta.
  expect(
    parseStreamLine(
      `data: ${JSON.stringify({ choices: [{ delta: { role: "assistant" } }] })}`
    )
  ).toBeNull();
  expect(
    parseStreamLine(
      `data: ${JSON.stringify({ choices: [{ delta: { content: "" } }] })}`
    )
  ).toBeNull();
});

test("survives malformed JSON instead of throwing", () => {
  expect(parseStreamLine("data: {not json")).toBeNull();
});

test("keeps whitespace-only deltas, which carry real spacing", () => {
  const line = `data: ${JSON.stringify({ choices: [{ delta: { content: " " } }] })}`;
  expect(parseStreamLine(line)).toBe(" ");
});

test("default model is the biggest-context free one", () => {
  const catalogue = [
    toModelInfo(paidAllowlisted),
    toModelInfo({ ...freeModel, id: "small/free:free", context_length: 8000 }),
    toModelInfo(freeModel),
  ];

  // Not the paid 128K one, and not the small free one.
  expect(pickDefaultModel(catalogue)).toBe("google/gemma-4-31b-it:free");
});

test("default model never falls to a paid model unless nothing is free", () => {
  expect(pickDefaultModel([toModelInfo(paidAllowlisted)])).toBe(
    "openai/gpt-4o-mini"
  );
  // An empty catalogue is the fetch having failed; the hardcoded slug is the
  // last resort, not the usual path.
  expect(pickDefaultModel([])).toBe(DEFAULT_MODEL);
});

/**
 * Prompt caching (AUDIT.md §8).
 *
 * The failure mode is asymmetric: a missing breakpoint costs money quietly,
 * while sending Anthropic's block shape to a provider that does not understand
 * it is a 400 on every chat request.
 */

const longSystemPrompt = "x".repeat(5_000);

test("marks a long system prompt cacheable for Anthropic models", () => {
  const [system] = withPromptCaching(
    [
      { role: "system", content: longSystemPrompt },
      { role: "user", content: "hi" },
    ],
    "anthropic/claude-sonnet-4.5"
  ) as { content: { cache_control?: unknown }[] }[];

  expect(system.content[0].cache_control).toEqual({ type: "ephemeral" });
});

test("leaves other providers' messages exactly as they were", () => {
  const messages: ChatMessage[] = [
    { role: "system", content: longSystemPrompt },
    { role: "user", content: "hi" },
  ];

  expect(withPromptCaching(messages, "google/gemma-4-31b-it:free")).toBe(
    messages
  );
});

test("does not mark a system prompt too short to cache", () => {
  const messages: ChatMessage[] = [{ role: "system", content: "short" }];

  expect(withPromptCaching(messages, "anthropic/claude-opus-4.5")).toEqual(
    messages
  );
});
