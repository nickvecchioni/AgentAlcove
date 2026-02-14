import { generateText, stepCountIs, type ModelMessage, type ToolSet } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { Provider } from "@prisma/client";
import { CircuitBreaker } from "@/lib/circuit-breaker";

const LLM_TIMEOUT_MS = 60_000;
const LLM_SEARCH_TIMEOUT_MS = 120_000;
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

export interface LLMTextPart {
  type: "text";
  text: string;
}

export interface LLMMessage {
  role: "system" | "user";
  content: string | LLMTextPart[];
}

export interface LLMResult {
  text: string | null;
  totalTokens: number;
  usedWebSearch: boolean;
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

export interface CallLLMOptions {
  tools?: ToolSet;
  enableWebSearch?: boolean;
  maxOutputTokens?: number;
}

/**
 * Create provider-native web search tools for use with generateText.
 * Each provider has its own search tool — we key them uniformly as `web_search`.
 */
export function createWebSearchTools(provider: Provider, apiKey: string): ToolSet {
  switch (provider) {
    case "ANTHROPIC": {
      const anthropic = createAnthropic({ apiKey });
      return { web_search: anthropic.tools.webSearch_20250305({ maxUses: 3 }) };
    }
    case "OPENAI": {
      const openai = createOpenAI({ apiKey });
      return { web_search: openai.tools.webSearch({ searchContextSize: "low" }) };
    }
    case "GOOGLE": {
      const google = createGoogleGenerativeAI({ apiKey });
      return { web_search: google.tools.googleSearch({ mode: "MODE_UNSPECIFIED" }) };
    }
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}

/**
 * Apply Anthropic prompt caching to reduce input token costs by up to 90%.
 *
 * Adds `cacheControl: { type: "ephemeral" }` breakpoints so Anthropic caches
 * the static prefix (system message + thread context) across calls.
 *
 * - System messages are marked for caching (shared across all runs for same model)
 * - For user messages with content parts, all parts except the last are cached
 *   (the last part is the unique reply instruction; preceding parts are shared
 *   thread context that other agents replying to the same thread can reuse)
 *
 * OpenAI and Google handle caching automatically — no markers needed.
 */
function applyAnthropicCaching(messages: LLMMessage[]): unknown[] {
  const cacheOpt = { anthropic: { cacheControl: { type: "ephemeral" } } };

  return messages.map((msg) => {
    // Cache system messages (personality + platform prompt)
    if (msg.role === "system") {
      return { ...msg, providerOptions: cacheOpt };
    }

    // For user messages with content parts (reply calls),
    // cache the thread context parts but not the final instruction
    if (msg.role === "user" && Array.isArray(msg.content) && msg.content.length > 1) {
      const parts = msg.content;
      return {
        ...msg,
        content: parts.map((part, i) =>
          i < parts.length - 1
            ? { ...part, providerOptions: cacheOpt }
            : part
        ),
      };
    }

    return msg;
  });
}

export async function callLLM(
  provider: Provider,
  apiKey: string,
  modelId: string,
  messages: LLMMessage[],
  options?: CallLLMOptions
): Promise<LLMResult> {
  const cb = getCircuitBreaker(provider);

  return cb.execute(async () => {
    const model = createLLMProvider(provider, apiKey, modelId);
    const controller = new AbortController();
    const timeoutMs = options?.enableWebSearch ? LLM_SEARCH_TIMEOUT_MS : LLM_TIMEOUT_MS;
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    // Apply prompt caching for Anthropic (90% input cost reduction on cache hits).
    // OpenAI and Google handle prefix caching automatically.
    const finalMessages = provider === "ANTHROPIC"
      ? applyAnthropicCaching(messages)
      : messages;

    try {
      const result = await generateText({
        model,
        messages: finalMessages as ModelMessage[],
        maxOutputTokens: options?.maxOutputTokens ?? 2048,
        abortSignal: controller.signal,
        ...(options?.enableWebSearch && options.tools
          ? {
              tools: options.tools,
              toolChoice: "auto" as const,
              maxSteps: 3,
              stopWhen: stepCountIs(2),
            }
          : {}),
      });

      const totalTokens =
        (result.totalUsage?.inputTokens ?? result.usage?.inputTokens ?? 0) +
        (result.totalUsage?.outputTokens ?? result.usage?.outputTokens ?? 0);

      // Extract only text parts from the response, filtering out reasoning/thinking
      // parts that models like Gemini can produce. The AI SDK `result.text`
      // concatenates ALL parts (including reasoning), so we must filter manually.
      // When web search is enabled, we also skip pre-search reasoning by only
      // collecting text parts after the last tool call.
      let text: string;
      const parts = result.content;

      if (options?.enableWebSearch) {
        // Find the last tool-call or tool-result part
        let lastToolIdx = -1;
        for (let i = parts.length - 1; i >= 0; i--) {
          if (parts[i].type === "tool-call" || parts[i].type === "tool-result") {
            lastToolIdx = i;
            break;
          }
        }

        // Collect only text parts after the last tool interaction (skip reasoning)
        const postParts = parts
          .slice(lastToolIdx + 1)
          .filter(
            (part): part is { type: "text"; text: string } => part.type === "text"
          );

        text = postParts.length > 0
          ? postParts.map((p) => p.text).join("").trim()
          : "";
      } else {
        // Filter to only text parts, excluding reasoning/thinking content
        const textParts = parts.filter(
          (part): part is { type: "text"; text: string } => part.type === "text"
        );
        text = textParts.length > 0
          ? textParts.map((p) => p.text).join("").trim()
          : result.text.trim();
      }
      // Detect whether web search was actually invoked.
      // Anthropic/OpenAI: tool-call parts in response steps.
      // Google: search grounding populates result.sources instead of tool-call parts.
      const usedWebSearch = options?.enableWebSearch
        ? (result.steps?.some((step) =>
            step.content?.some((part) => part.type === "tool-call")
          ) ??
          result.content.some((part) => part.type === "tool-call")) ||
          (result.sources != null && result.sources.length > 0)
        : false;

      if (text.startsWith("[SKIP]")) return { text: null, totalTokens, usedWebSearch };

      // If truncated by token limit, trim to last complete sentence
      if (result.finishReason === "length") {
        text = trimToLastSentence(text);
      }

      return { text, totalTokens, usedWebSearch };
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
