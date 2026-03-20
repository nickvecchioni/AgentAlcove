import { Provider } from "@prisma/client";

export interface ModelInfo {
  id: string;
  displayName: string;
  provider: Provider;
}

export const PROVIDER_MODELS: Record<Provider, ModelInfo[]> = {
  ANTHROPIC: [
    { id: "claude-opus-4-6", displayName: "Claude Opus 4.6", provider: "ANTHROPIC" },
    { id: "claude-sonnet-4-5-20250929", displayName: "Claude Sonnet 4.5", provider: "ANTHROPIC" },
    { id: "claude-haiku-4-5-20251001", displayName: "Claude Haiku 4.5", provider: "ANTHROPIC" },
    { id: "claude-opus-4-5-20251101", displayName: "Claude Opus 4.5", provider: "ANTHROPIC" },
    { id: "claude-sonnet-4-20250514", displayName: "Claude Sonnet 4", provider: "ANTHROPIC" },
    { id: "claude-3-7-sonnet-20250219", displayName: "Claude Sonnet 3.7", provider: "ANTHROPIC" },
  ],
  OPENAI: [
    { id: "gpt-5.2", displayName: "GPT-5.2", provider: "OPENAI" },
    { id: "gpt-5", displayName: "GPT-5", provider: "OPENAI" },
    { id: "gpt-5-mini", displayName: "GPT-5 Mini", provider: "OPENAI" },
    { id: "gpt-4.1", displayName: "GPT-4.1", provider: "OPENAI" },
    { id: "gpt-4.1-mini", displayName: "GPT-4.1 Mini", provider: "OPENAI" },
    { id: "gpt-4.1-nano", displayName: "GPT-4.1 Nano", provider: "OPENAI" },
    { id: "gpt-4o", displayName: "GPT-4o", provider: "OPENAI" },
    { id: "gpt-4o-mini", displayName: "GPT-4o Mini", provider: "OPENAI" },
    { id: "o3", displayName: "o3", provider: "OPENAI" },
    { id: "o3-pro", displayName: "o3-pro", provider: "OPENAI" },
    { id: "o4-mini", displayName: "o4-mini", provider: "OPENAI" },
    { id: "o3-mini", displayName: "o3-mini", provider: "OPENAI" },
  ],
  GOOGLE: [
    { id: "gemini-3-pro-preview", displayName: "Gemini 3 Pro", provider: "GOOGLE" },
    { id: "gemini-3-flash-preview", displayName: "Gemini 3 Flash", provider: "GOOGLE" },
    { id: "gemini-2.5-pro", displayName: "Gemini 2.5 Pro", provider: "GOOGLE" },
    { id: "gemini-2.5-flash", displayName: "Gemini 2.5 Flash", provider: "GOOGLE" },
    { id: "gemini-2.5-flash-lite", displayName: "Gemini 2.5 Flash Lite", provider: "GOOGLE" },
    { id: "gemini-2.0-flash", displayName: "Gemini 2.0 Flash", provider: "GOOGLE" },
  ],
};

export function getModelDisplayName(
  provider: Provider,
  modelId: string
): string {
  const models = PROVIDER_MODELS[provider];
  const model = models?.find((m) => m.id === modelId);
  return model?.displayName ?? modelId;
}

export function getAllModels(): ModelInfo[] {
  return Object.values(PROVIDER_MODELS).flat();
}

export const PROVIDER_DISPLAY_NAMES: Record<Provider, string> = {
  ANTHROPIC: "Anthropic",
  OPENAI: "OpenAI",
  GOOGLE: "Google",
};

export const PROVIDER_COLORS: Record<
  Provider,
  { bg: string; border: string; text: string }
> = {
  ANTHROPIC: {
    bg: "bg-orange-50 dark:bg-orange-950/40",
    border: "border-orange-300 dark:border-orange-700",
    text: "text-orange-700 dark:text-orange-400",
  },
  OPENAI: {
    bg: "bg-teal-50 dark:bg-teal-950/40",
    border: "border-teal-300 dark:border-teal-700",
    text: "text-teal-700 dark:text-teal-400",
  },
  GOOGLE: {
    bg: "bg-sky-50 dark:bg-sky-950/40",
    border: "border-sky-300 dark:border-sky-700",
    text: "text-sky-700 dark:text-sky-400",
  },
};
