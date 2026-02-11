import { generateText } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { Provider } from "@prisma/client";
import { CircuitBreaker } from "@/lib/circuit-breaker";

const LLM_TIMEOUT_MS = 60_000;
const VALIDATE_TIMEOUT_MS = 15_000;

/** Per-provider circuit breakers */
const providerCircuitBreakers = new Map<Provider, CircuitBreaker>();

function getCircuitBreaker(provider: Provider): CircuitBreaker {
  let cb = providerCircuitBreakers.get(provider);
  if (!cb) {
    cb = new CircuitBreaker({
      name: `llm:${provider}`,
      failureThreshold: 5,
      resetTimeoutMs: 30_000,
      halfOpenMaxAttempts: 2,
      isFailure: (error) => {
        if (error instanceof Error && error.name === "AbortError") return true;
        if (error instanceof Error) {
          const msg = error.message.toLowerCase();
          if (msg.includes("econnreset") || msg.includes("fetch failed")) return true;
        }
        if (
          error &&
          typeof error === "object" &&
          "status" in error &&
          typeof (error as { status: unknown }).status === "number"
        ) {
          const status = (error as { status: number }).status;
          return status === 429 || status >= 500;
        }
        return false;
      },
    });
    providerCircuitBreakers.set(provider, cb);
  }
  return cb;
}

const PROVIDER_ENV_KEYS: Record<Provider, string> = {
  ANTHROPIC: "ANTHROPIC_API_KEY",
  OPENAI: "OPENAI_API_KEY",
  GOOGLE: "GOOGLE_API_KEY",
};

export function getApiKeyForProvider(provider: Provider): string {
  const envKey = PROVIDER_ENV_KEYS[provider];
  const value = process.env[envKey];
  if (!value) {
    throw new Error(`Missing environment variable ${envKey} for provider ${provider}`);
  }
  return value;
}

export interface LLMResult {
  text: string | null;
  totalTokens: number;
}

/**
 * If a response was truncated by the token limit, trim it to the last
 * complete sentence so posts never end mid-thought.
 */
function trimToLastSentence(text: string): string {
  // Find the last sentence-ending punctuation
  const match = text.match(/^([\s\S]*[.!?…])\s*/);
  if (match && match[1].length > text.length * 0.3) {
    return match[1].trim();
  }
  // If no sentence boundary found in a reasonable range, return as-is
  return text;
}

export function createLLMProvider(
  provider: Provider,
  apiKey: string,
  modelId: string
) {
  switch (provider) {
    case "ANTHROPIC": {
      const anthropic = createAnthropic({ apiKey });
      return anthropic(modelId);
    }
    case "OPENAI": {
      const openai = createOpenAI({ apiKey });
      return openai(modelId);
    }
    case "GOOGLE": {
      const google = createGoogleGenerativeAI({ apiKey });
      return google(modelId);
    }
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}

export async function callLLM(
  provider: Provider,
  apiKey: string,
  modelId: string,
  messages: { role: "system" | "user"; content: string }[]
): Promise<LLMResult> {
  const cb = getCircuitBreaker(provider);

  return cb.execute(async () => {
    const model = createLLMProvider(provider, apiKey, modelId);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), LLM_TIMEOUT_MS);

    try {
      const result = await generateText({
        model,
        messages,
        maxOutputTokens: 2048,
        abortSignal: controller.signal,
      });

      const totalTokens =
        (result.usage?.inputTokens ?? 0) + (result.usage?.outputTokens ?? 0);
      let text = result.text.trim();
      if (text === "[SKIP]") return { text: null, totalTokens };

      // If truncated by token limit, trim to last complete sentence
      if (result.finishReason === "length") {
        text = trimToLastSentence(text);
      }

      return { text, totalTokens };
    } finally {
      clearTimeout(timer);
    }
  });
}

export async function validateApiKey(
  provider: Provider,
  apiKey: string,
  modelId: string
): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), VALIDATE_TIMEOUT_MS);

  try {
    const model = createLLMProvider(provider, apiKey, modelId);
    await generateText({
      model,
      messages: [{ role: "user", content: "Say hello in one word." }],
      maxOutputTokens: 10,
      abortSignal: controller.signal,
    });
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}
