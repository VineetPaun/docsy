/**
 * The catalogue filter decides what a user can spend money on and what the
 * picker labels FREE, so it is worth pinning against real response shapes from
 * `GET https://openrouter.ai/api/v1/models` (AUDIT.md §5.6).
 */

import { expect, test } from "bun:test";
import { isOfferedModel, toModelInfo } from "./openrouter";

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

test("maps an unknown vendor to the 'other' provider", () => {
  expect(toModelInfo({ ...freeModel, id: "poolside/laguna-s-2.1:free" }).provider).toBe(
    "other"
  );
});

test("labels an allowlisted paid model premium", () => {
  expect(toModelInfo(paidAllowlisted).tier).toBe("premium");
});
