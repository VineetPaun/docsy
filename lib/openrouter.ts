/**
 * OpenRouter model catalogue and chat call.
 *
 * The catalogue used to be a hardcoded list of 19 models "updated January
 * 2026". By July, **16 of the 19 slugs no longer resolved** — including the
 * default, so chat was broken for every user who never opened the picker
 * (AUDIT.md §5.6). A hardcoded list guarantees that outcome, so the list now
 * comes from OpenRouter itself, cached for an hour, with a small fallback for
 * when the fetch fails.
 */

/**
 * A vendor, as OpenRouter spells it: the slug prefix (`google/gemma-4-31b` →
 * `google`).
 *
 * Deliberately not a union. A union meant every vendor OpenRouter added after
 * this file was written — poolside, inclusionai, cohere — collapsed into a
 * single "Other" bucket with a generic name (AUDIT.md §5.6). Now the catalogue
 * decides which providers exist and the display metadata is either known or
 * derived.
 */
export type Provider = string;

export interface ProviderInfo {
  id: Provider;
  name: string;
  color: string; // For icon background tint
}

/**
 * Display overrides for vendors whose slug does not title-case into their real
 * name ("openai" → "OpenAI", not "Openai"), plus their brand colour.
 *
 * Adding a vendor here is cosmetic — an unlisted one still gets a name, a colour
 * and its own group in the picker.
 */
const KNOWN_PROVIDERS: Record<string, { name: string; color: string }> = {
  google: { name: "Google", color: "#4285F4" },
  "meta-llama": { name: "Meta", color: "#0668E1" },
  meta: { name: "Meta", color: "#0668E1" },
  openai: { name: "OpenAI", color: "#10A37F" },
  anthropic: { name: "Anthropic", color: "#D4A574" },
  mistralai: { name: "Mistral", color: "#FF7000" },
  mistral: { name: "Mistral", color: "#FF7000" },
  qwen: { name: "Qwen", color: "#615EFF" },
  deepseek: { name: "DeepSeek", color: "#4D6BFE" },
  nvidia: { name: "NVIDIA", color: "#76B900" },
  moonshotai: { name: "Moonshot AI", color: "#FFD700" },
  moonshot: { name: "Moonshot", color: "#FFD700" },
  nousresearch: { name: "Nous Research", color: "#9333EA" },
  nous: { name: "Nous", color: "#9333EA" },
  "z-ai": { name: "Z.ai", color: "#00B8D9" },
  microsoft: { name: "Microsoft", color: "#00A4EF" },
  cohere: { name: "Cohere", color: "#39594D" },
  xai: { name: "xAI", color: "#111111" },
};

/**
 * Name and colour for a vendor, known or not.
 *
 * An unknown slug gets its words title-cased and a colour derived from the slug
 * itself — stable across renders and distinct enough to tell two vendors apart,
 * which is all the picker's icon tint needs.
 */
export function providerInfo(id: Provider): ProviderInfo {
  const known = KNOWN_PROVIDERS[id];
  if (known) return { id, ...known };

  const name = id
    .split(/[-_.]/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

  // Cheap deterministic hash → hue. Mid lightness and moderate saturation, so
  // one colour reads on both the light and the dark surface without a per-theme
  // variant.
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) % 360;
  }

  return { id, name, color: `hsl(${hash} 58% 52%)` };
}

export interface ModelInfo {
  id: string;
  name: string;
  description: string;
  contextLength: number;
  tier: "free" | "premium";
  provider: Provider;
}

/**
 * A model id is now whatever the live catalogue says it is, so this cannot be a
 * union of literals. Callers do not validate ids themselves — `resolveModel()`
 * does, server-side, because an unvalidated id is a caller choosing how much
 * your inference costs.
 */
export type ModelId = string;

/**
 * Last resort, not the default. Reached only when the catalogue fetch fails and
 * `FALLBACK_MODELS` is all there is. The default a request actually gets comes
 * from `pickDefaultModel()` over the live list — a hardcoded slug is exactly
 * what silently killed chat and audio when 16 of 19 ids were retired
 * (AUDIT.md §5.6). Free tier, big context, alive as of 2026-07-30.
 */
export const DEFAULT_MODEL: ModelId = "google/gemma-4-31b-it:free";

/**
 * Paid models worth offering alongside the free tier. Filtered against the live
 * catalogue, so a retired entry disappears instead of breaking the picker.
 */
const PREMIUM_ALLOWLIST = [
  "anthropic/claude-opus-4.5",
  "anthropic/claude-sonnet-4.5",
  "openai/gpt-5.2",
  "openai/gpt-4o-mini",
  "google/gemini-2.5-flash",
  "deepseek/deepseek-chat-v3.1",
];

/**
 * Shown when the catalogue fetch fails: one entry, derived from `DEFAULT_MODEL`.
 *
 * It used to be three hand-written entries with hand-written names, context
 * lengths and tiers — a second catalogue to maintain, and the one place a stale
 * slug could not be filtered out against the live list. One entry is enough to
 * keep the picker from rendering empty, and it costs nothing when stale: if
 * `/api/v1/models` is unreachable then `/chat/completions` almost certainly is
 * too, so the request was going to fail whichever slug it carried.
 */
export const FALLBACK_MODELS: ModelInfo[] = [
  {
    id: DEFAULT_MODEL,
    name: DEFAULT_MODEL.split("/")[1]?.replace(/:free$/, "") ?? DEFAULT_MODEL,
    description: "Free · catalogue unavailable",
    contextLength: 0,
    tier: "free",
    provider: DEFAULT_MODEL.split("/")[0],
  },
];

/** The shape of an entry in `GET /api/v1/models` that this file relies on. */
interface RawModel {
  id: string;
  name?: string;
  description?: string;
  context_length?: number;
  pricing?: { prompt?: string };
  architecture?: { output_modalities?: string[] };
}

const CATALOGUE_URL = "https://openrouter.ai/api/v1/models";
const CATALOGUE_TTL_SECONDS = 3600;

const isFree = (raw: RawModel) => raw.pricing?.prompt === "0";

/**
 * Text-out models only, and only the free tier plus the allowlist.
 *
 * `openrouter/*` entries are meta-routers with variable pricing (`-1`), and
 * everything else priced `-1` is "we will tell you later" — neither belongs in
 * a picker that labels models FREE or PRO.
 *
 * Exported for `lib/openrouter.test.ts`.
 */
export function isOfferedModel(raw: RawModel): boolean {
  if (raw.id.startsWith("openrouter/")) return false;

  const modalities = raw.architecture?.output_modalities;
  if (modalities && !modalities.includes("text")) return false;

  return isFree(raw) || PREMIUM_ALLOWLIST.includes(raw.id);
}

/** Exported for `lib/openrouter.test.ts`. */
export function toModelInfo(raw: RawModel): ModelInfo {
  // Whatever vendor the slug names, listed or not — `providerInfo()` finds it a
  // name and a colour either way.
  const provider = raw.id.split("/")[0];

  // OpenRouter prefixes display names with the vendor ("Google: Gemma 4 31B"),
  // which the picker already shows as an icon.
  const name = (raw.name ?? raw.id).replace(/^[^:]+:\s*/, "");

  return {
    id: raw.id,
    name,
    description: summarise(raw),
    contextLength: raw.context_length ?? 0,
    tier: isFree(raw) ? "free" : "premium",
    provider,
  };
}

/** One short line for the picker; the API's descriptions run to paragraphs. */
function summarise(raw: RawModel): string {
  const context =
    raw.context_length && raw.context_length >= 1000
      ? `${Math.round(raw.context_length / 1000)}K context`
      : "";
  const first = (raw.description ?? "").split(/(?<=\.)\s/)[0].trim();

  return [isFree(raw) ? "Free" : "Paid", context, first.slice(0, 60)]
    .filter(Boolean)
    .join(" · ");
}

/**
 * The catalogue, newest data OpenRouter will give us, cached for an hour by
 * Next's data cache. Never throws: a failed fetch degrades to `FALLBACK_MODELS`
 * rather than emptying the picker.
 */
export async function fetchModelCatalogue(): Promise<ModelInfo[]> {
  try {
    const response = await fetch(CATALOGUE_URL, {
      next: { revalidate: CATALOGUE_TTL_SECONDS },
    });
    if (!response.ok) return FALLBACK_MODELS;

    const { data } = (await response.json()) as { data?: RawModel[] };
    const models = (data ?? []).filter(isOfferedModel).map(toModelInfo);

    return models.length > 0 ? models : FALLBACK_MODELS;
  } catch {
    return FALLBACK_MODELS;
  }
}

/**
 * The biggest-context free model on offer — the default is derived, not written
 * down, so a retirement moves it instead of breaking it. Free tier first: the
 * default is what an unconfigured request gets, and that should never be a
 * model the user pays for.
 *
 * Exported for `lib/openrouter.test.ts`.
 */
export function pickDefaultModel(models: ModelInfo[]): ModelId {
  const free = models.filter((m) => m.tier === "free");
  const pool = free.length > 0 ? free : models;

  if (pool.length === 0) return DEFAULT_MODEL;

  // Ties keep the earlier entry, so the choice is stable for a given catalogue.
  return pool.reduce((best, m) =>
    m.contextLength > best.contextLength ? m : best
  ).id;
}

/**
 * Server-side gate on which model a request may use. An id the catalogue does
 * not offer falls back to the default rather than being passed through — the
 * caller would otherwise be choosing what to spend.
 */
export async function resolveModel(model?: string): Promise<ModelId> {
  const catalogue = await fetchModelCatalogue();

  if (model && catalogue.some((entry) => entry.id === model)) return model;

  return pickDefaultModel(catalogue);
}

/**
 * The context window of a model, as the live catalogue reports it.
 *
 * 0 when the model is unknown or the catalogue is unavailable, which callers
 * treat as "assume the smallest window" rather than guessing large.
 */
export async function modelContextLength(model: ModelId): Promise<number> {
  const catalogue = await fetchModelCatalogue();

  return catalogue.find((entry) => entry.id === model)?.contextLength ?? 0;
}

/**
 * Group a catalogue for the picker's provider sidebar.
 *
 * Keyed by the providers actually present, in the order the catalogue lists
 * them — the previous version pre-seeded a fixed set of keys, which is what
 * forced every new vendor into "Other" and left empty groups for vendors that
 * had retired.
 */
export function getModelsByProvider(
  models: ModelInfo[]
): Record<Provider, ModelInfo[]> {
  const groups: Record<Provider, ModelInfo[]> = {};

  for (const model of models) {
    (groups[model.provider] ??= []).push(model);
  }

  return groups;
}

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface OpenRouterResponse {
  id: string;
  choices: {
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }[];
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

interface CompletionOptions {
  temperature?: number;
  maxTokens?: number;
}

/**
 * POST a completion request and hand back the raw response.
 *
 * Shared by the buffered and streaming callers so the key check, the
 * attribution headers, model resolution and OpenRouter's error shape live in one
 * place.
 *
 * @throws if the key is missing or OpenRouter returns a non-2xx
 */
async function postCompletion(
  messages: ChatMessage[],
  model: ModelId,
  options: CompletionOptions | undefined,
  stream: boolean,
): Promise<Response> {
  const apiKey = process.env.OPENROUTER_API_KEY;

  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY not configured");
  }

  // Validated against the live catalogue, not a hardcoded union — an id that no
  // longer resolves, or one a caller invented, becomes the default.
  const validModel = await resolveModel(model);

  const response = await fetch(
    "https://openrouter.ai/api/v1/chat/completions",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "HTTP-Referer":
          process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
        "X-Title": "Docsy - Document Chat",
      },
      body: JSON.stringify({
        model: validModel,
        messages,
        temperature: options?.temperature ?? 0.7,
        max_tokens: options?.maxTokens ?? 2000,
        ...(stream ? { stream: true } : {}),
      }),
    },
  );

  if (!response.ok) {
    const errorText = await response.text();

    try {
      const errorJson = JSON.parse(errorText);
      const errorMessage =
        errorJson.error?.message || errorJson.message || errorText;
      throw new Error(
        `OpenRouter API error (${response.status}): ${errorMessage}`,
      );
    } catch (parseError) {
      if (
        parseError instanceof Error &&
        parseError.message.includes("OpenRouter")
      ) {
        throw parseError;
      }
      throw new Error(
        `OpenRouter API error (${response.status}): ${errorText.slice(0, 200)}`,
      );
    }
  }

  return response;
}

/**
 * Interpret one line of an OpenAI-dialect SSE stream.
 *
 * @returns `"done"` at the terminator, the delta text for a content chunk, or
 * `null` for anything with no text in it — keep-alive comments, role-only first
 * chunks, `usage` frames, and malformed JSON. Skipping rather than throwing
 * matters: one bad keep-alive must not kill a good answer mid-sentence.
 */
export function parseStreamLine(line: string): string | "done" | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith("data:")) return null;

  const payload = trimmed.slice(5).trim();
  if (payload === "[DONE]") return "done";

  try {
    const parsed = JSON.parse(payload);
    const text = parsed.choices?.[0]?.delta?.content;
    return typeof text === "string" && text.length > 0 ? text : null;
  } catch {
    return null;
  }
}

/**
 * Stream a completion, yielding text as the model produces it.
 *
 * OpenRouter speaks the OpenAI SSE dialect: `data: {json}` lines, `data: [DONE]`
 * to finish, and periodic `: comment` keep-alives. Parsed by hand rather than
 * with the Vercel AI SDK — this is the only streaming call in the app, and
 * `useChat` would fight the Convex-persisted message list it would have to
 * replace (AUDIT.md §8).
 *
 * A chunk that does not parse is skipped: a malformed keep-alive must not kill a
 * good answer mid-sentence.
 */
export async function* streamChatWithOpenRouter(
  messages: ChatMessage[],
  model: ModelId = DEFAULT_MODEL,
  options?: CompletionOptions,
): AsyncGenerator<string> {
  const response = await postCompletion(messages, model, options, true);

  if (!response.body) {
    throw new Error("OpenRouter returned no response body");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    // Complete lines only — a chunk boundary can land mid-line, and the
    // remainder stays in the buffer until the rest of it arrives.
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const parsed = parseStreamLine(line);
      if (parsed === "done") return;
      if (parsed) yield parsed;
    }
  }
}

export async function chatWithOpenRouter(
  messages: ChatMessage[],
  model: ModelId = DEFAULT_MODEL,
  options?: CompletionOptions,
): Promise<string> {
  const response = await postCompletion(messages, model, options, false);

  const data = await response.json();

  if (
    !data ||
    !data.choices ||
    !Array.isArray(data.choices) ||
    data.choices.length === 0
  ) {
    if (data?.error) {
      throw new Error(
        `OpenRouter error: ${data.error.message || JSON.stringify(data.error)}`,
      );
    }

    throw new Error(
      "OpenRouter returned an invalid response. The model may be unavailable or rate-limited. Please try again.",
    );
  }

  return data.choices[0]?.message?.content || "";
}
