// OpenRouter configuration and model definitions
// Updated: January 2026 - verified working free models
export const OPENROUTER_MODELS = {
  // Free tier models
  "meta-llama/llama-3.3-70b-instruct:free": {
    id: "meta-llama/llama-3.3-70b-instruct:free",
    name: "Llama 3.3 70B (Free)",
    description: "Meta's powerful 70B instruction-tuned model",
    contextLength: 131072,
    tier: "free",
  },
  "deepseek/deepseek-r1-0528:free": {
    id: "deepseek/deepseek-r1-0528:free",
    name: "DeepSeek R1 (Free)",
    description: "DeepSeek's reasoning model",
    contextLength: 163840,
    tier: "free",
  },
  "qwen/qwen3-coder:free": {
    id: "qwen/qwen3-coder:free",
    name: "Qwen3 Coder (Free)",
    description: "Qwen's powerful coding model",
    contextLength: 262000,
    tier: "free",
  },
  "mistralai/mistral-small-3.1-24b-instruct:free": {
    id: "mistralai/mistral-small-3.1-24b-instruct:free",
    name: "Mistral Small 3.1 (Free)",
    description: "Mistral's efficient 24B model",
    contextLength: 96000,
    tier: "free",
  },
  // Premium tier
  "openai/gpt-4o-mini": {
    id: "openai/gpt-4o-mini",
    name: "GPT-4o Mini",
    description: "OpenAI's efficient GPT-4o variant",
    contextLength: 128000,
    tier: "premium",
  },
  "anthropic/claude-3.5-sonnet": {
    id: "anthropic/claude-3.5-sonnet",
    name: "Claude 3.5 Sonnet",
    description: "Anthropic's balanced model",
    contextLength: 200000,
    tier: "premium",
  },
} as const;

export type ModelId = keyof typeof OPENROUTER_MODELS;

export const DEFAULT_MODEL: ModelId = "meta-llama/llama-3.3-70b-instruct:free";

// List of valid model IDs for validation
export const VALID_MODEL_IDS = Object.keys(OPENROUTER_MODELS) as ModelId[];

export function isValidModel(modelId: string): modelId is ModelId {
  return modelId in OPENROUTER_MODELS;
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
  }
): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY;

  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY not configured");
  }

  // Validate model ID - fall back to default if invalid
  const validModel = isValidModel(model) ? model : DEFAULT_MODEL;
  
  if (model !== validModel) {
    console.warn(`[openrouter] Invalid model "${model}", falling back to "${validModel}"`);
  }

  console.log(`[openrouter] Sending request with model: ${validModel}`);

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
      "X-Title": "Docsy - Document Chat",
    },
    body: JSON.stringify({
      model: validModel,
      messages,
      temperature: options?.temperature ?? 0.7,
      max_tokens: options?.maxTokens ?? 2000,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("[openrouter] API error:", response.status, errorText);
    
    // Try to parse error for better message
    try {
      const errorJson = JSON.parse(errorText);
      const errorMessage = errorJson.error?.message || errorJson.message || errorText;
      throw new Error(`OpenRouter API error (${response.status}): ${errorMessage}`);
    } catch (parseError) {
      if (parseError instanceof Error && parseError.message.includes("OpenRouter")) {
        throw parseError;
      }
      throw new Error(`OpenRouter API error (${response.status}): ${errorText.slice(0, 200)}`);
    }
  }

  const data: OpenRouterResponse = await response.json();
  const content = data.choices[0]?.message?.content || "";
  
  console.log(`[openrouter] Response received, length: ${content.length} chars`);
  
  return content;
}
