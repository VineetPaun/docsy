// OpenRouter configuration and model definitions
// Updated: January 2026 - organized by provider with logos

export type Provider =
  | "google"
  | "meta"
  | "openai"
  | "anthropic"
  | "mistral"
  | "qwen"
  | "deepseek"
  | "nvidia"
  | "moonshot"
  | "nous"
  | "other";

export interface ProviderInfo {
  id: Provider;
  name: string;
  color: string; // For icon background tint
}

export const PROVIDERS: Record<Provider, ProviderInfo> = {
  google: { id: "google", name: "Google", color: "#4285F4" },
  meta: { id: "meta", name: "Meta", color: "#0668E1" },
  openai: { id: "openai", name: "OpenAI", color: "#10A37F" },
  anthropic: { id: "anthropic", name: "Anthropic", color: "#D4A574" },
  mistral: { id: "mistral", name: "Mistral", color: "#FF7000" },
  qwen: { id: "qwen", name: "Qwen", color: "#615EFF" },
  deepseek: { id: "deepseek", name: "DeepSeek", color: "#4D6BFE" },
  nvidia: { id: "nvidia", name: "NVIDIA", color: "#76B900" },
  moonshot: { id: "moonshot", name: "Moonshot", color: "#FFD700" },
  nous: { id: "nous", name: "Nous", color: "#9333EA" },
  other: { id: "other", name: "Other", color: "#6B7280" },
};

export interface ModelInfo {
  id: string;
  name: string;
  description: string;
  contextLength: number;
  tier: "free" | "premium";
  provider: Provider;
}

export const OPENROUTER_MODELS: Record<string, ModelInfo> = {
  // ========== GOOGLE ==========
  "google/gemini-2.0-flash-exp:free": {
    id: "google/gemini-2.0-flash-exp:free",
    name: "Gemini 2.0 Flash",
    description: "1M context, great for docs",
    contextLength: 1048576,
    tier: "free",
    provider: "google",
  },
  "google/gemma-3-27b-it:free": {
    id: "google/gemma-3-27b-it:free",
    name: "Gemma 3 27B",
    description: "Powerful 27B model",
    contextLength: 131072,
    tier: "free",
    provider: "google",
  },
  "google/gemma-3-12b-it:free": {
    id: "google/gemma-3-12b-it:free",
    name: "Gemma 3 12B",
    description: "Balanced 12B model",
    contextLength: 32768,
    tier: "free",
    provider: "google",
  },
  "google/gemma-3-4b-it:free": {
    id: "google/gemma-3-4b-it:free",
    name: "Gemma 3 4B",
    description: "Fast 4B model",
    contextLength: 32768,
    tier: "free",
    provider: "google",
  },

  // ========== META ==========
  "meta-llama/llama-3.1-405b-instruct:free": {
    id: "meta-llama/llama-3.1-405b-instruct:free",
    name: "Llama 3.1 405B",
    description: "Flagship model",
    contextLength: 131072,
    tier: "free",
    provider: "meta",
  },
  "meta-llama/llama-3.3-70b-instruct:free": {
    id: "meta-llama/llama-3.3-70b-instruct:free",
    name: "Llama 3.3 70B",
    description: "Powerful 70B model",
    contextLength: 131072,
    tier: "free",
    provider: "meta",
  },
  "meta-llama/llama-3.2-3b-instruct:free": {
    id: "meta-llama/llama-3.2-3b-instruct:free",
    name: "Llama 3.2 3B",
    description: "Compact model",
    contextLength: 131072,
    tier: "free",
    provider: "meta",
  },

  // ========== OPENAI ==========
  "openai/gpt-oss-120b:free": {
    id: "openai/gpt-oss-120b:free",
    name: "GPT-OSS 120B",
    description: "Open source model",
    contextLength: 131072,
    tier: "free",
    provider: "openai",
  },
  "openai/gpt-4o-mini": {
    id: "openai/gpt-4o-mini",
    name: "GPT-4o Mini",
    description: "Efficient GPT-4o",
    contextLength: 128000,
    tier: "premium",
    provider: "openai",
  },

  // ========== ANTHROPIC ==========
  "anthropic/claude-3.5-sonnet": {
    id: "anthropic/claude-3.5-sonnet",
    name: "Claude 3.5 Sonnet",
    description: "Balanced model",
    contextLength: 200000,
    tier: "premium",
    provider: "anthropic",
  },

  // ========== MISTRAL ==========
  "mistralai/mistral-small-3.1-24b-instruct:free": {
    id: "mistralai/mistral-small-3.1-24b-instruct:free",
    name: "Mistral Small 3.1",
    description: "Efficient 24B model",
    contextLength: 128000,
    tier: "free",
    provider: "mistral",
  },
  "mistralai/devstral-2512:free": {
    id: "mistralai/devstral-2512:free",
    name: "Devstral 2",
    description: "Coding model",
    contextLength: 262144,
    tier: "free",
    provider: "mistral",
  },

  // ========== QWEN ==========
  "qwen/qwen3-coder:free": {
    id: "qwen/qwen3-coder:free",
    name: "Qwen3 Coder 480B",
    description: "Massive coding model",
    contextLength: 262000,
    tier: "free",
    provider: "qwen",
  },
  "qwen/qwen3-4b:free": {
    id: "qwen/qwen3-4b:free",
    name: "Qwen3 4B",
    description: "Efficient small model",
    contextLength: 40960,
    tier: "free",
    provider: "qwen",
  },

  // ========== DEEPSEEK ==========
  "deepseek/deepseek-r1-0528:free": {
    id: "deepseek/deepseek-r1-0528:free",
    name: "DeepSeek R1",
    description: "Reasoning model",
    contextLength: 163840,
    tier: "free",
    provider: "deepseek",
  },

  // ========== NVIDIA ==========
  "nvidia/nemotron-3-nano-30b-a3b:free": {
    id: "nvidia/nemotron-3-nano-30b-a3b:free",
    name: "Nemotron 3 Nano 30B",
    description: "30B model",
    contextLength: 256000,
    tier: "free",
    provider: "nvidia",
  },
  "nvidia/nemotron-nano-9b-v2:free": {
    id: "nvidia/nemotron-nano-9b-v2:free",
    name: "Nemotron Nano 9B",
    description: "Efficient nano model",
    contextLength: 128000,
    tier: "free",
    provider: "nvidia",
  },

  // ========== MOONSHOT ==========
  "moonshotai/kimi-k2:free": {
    id: "moonshotai/kimi-k2:free",
    name: "Kimi K2",
    description: "Moonshot's Kimi model",
    contextLength: 32768,
    tier: "free",
    provider: "moonshot",
  },

  // ========== NOUS ==========
  "nousresearch/hermes-3-llama-3.1-405b:free": {
    id: "nousresearch/hermes-3-llama-3.1-405b:free",
    name: "Hermes 3 405B",
    description: "Massive 405B model",
    contextLength: 131072,
    tier: "free",
    provider: "nous",
  },
} as const;

export type ModelId = keyof typeof OPENROUTER_MODELS;

// Default to Gemini 2.0 Flash for best document handling
export const DEFAULT_MODEL: ModelId = "google/gemini-2.0-flash-exp:free";

// List of valid model IDs for validation
export const VALID_MODEL_IDS = Object.keys(OPENROUTER_MODELS) as ModelId[];

export function isValidModel(modelId: string): modelId is ModelId {
  return modelId in OPENROUTER_MODELS;
}

// Get models grouped by provider
export function getModelsByProvider(): Record<Provider, ModelInfo[]> {
  const groups: Record<Provider, ModelInfo[]> = {
    google: [],
    meta: [],
    openai: [],
    anthropic: [],
    mistral: [],
    qwen: [],
    deepseek: [],
    nvidia: [],
    moonshot: [],
    nous: [],
    other: [],
  };

  Object.values(OPENROUTER_MODELS).forEach((model) => {
    groups[model.provider].push(model);
  });

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

export async function chatWithOpenRouter(
  messages: ChatMessage[],
  model: ModelId = DEFAULT_MODEL,
  options?: {
    temperature?: number;
    maxTokens?: number;
  },
): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY;

  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY not configured");
  }

  // Validate model ID - fall back to default if invalid
  const validModel = isValidModel(model) ? model : DEFAULT_MODEL;

  if (model !== validModel) {
    console.warn(
      `[openrouter] Invalid model "${model}", falling back to "${validModel}"`,
    );
  }

  console.log(`[openrouter] Sending request with model: ${validModel}`);

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
      }),
    },
  );

  if (!response.ok) {
    const errorText = await response.text();
    console.error("[openrouter] API error:", response.status, errorText);

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

  const data = await response.json();

  if (
    !data ||
    !data.choices ||
    !Array.isArray(data.choices) ||
    data.choices.length === 0
  ) {
    console.error(
      "[openrouter] Unexpected API response:",
      JSON.stringify(data).slice(0, 500),
    );

    if (data?.error) {
      throw new Error(
        `OpenRouter error: ${data.error.message || JSON.stringify(data.error)}`,
      );
    }

    throw new Error(
      "OpenRouter returned an invalid response. The model may be unavailable or rate-limited. Please try again.",
    );
  }

  const content = data.choices[0]?.message?.content || "";

  console.log(
    `[openrouter] Response received, length: ${content.length} chars`,
  );

  return content;
}
