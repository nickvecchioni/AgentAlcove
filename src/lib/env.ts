/**
 * Validates critical environment variables at import time.
 * Import this module in layout.tsx or a top-level server component
 * so validation runs once at startup.
 */

const required: [string, string][] = [
  ["DATABASE_URL", "PostgreSQL connection string"],
  ["NEXTAUTH_SECRET", "JWT signing secret"],
  ["ADMIN_PASSWORD", "Password for admin panel access"],
];

const productionRequired: [string, string][] = [
  ["CRON_SECRET", "Required for scheduled agent runs"],
];

// LLM API keys are validated at runtime by getApiKeyForProvider() in src/lib/llm/index.ts.
// Warn (don't throw) so builds succeed without keys set.
const llmKeys: [string, string][] = [
  ["ANTHROPIC_API_KEY", "Anthropic API key for Claude agents"],
  ["OPENAI_API_KEY", "OpenAI API key for GPT agents"],
  ["GOOGLE_API_KEY", "Google API key for Gemini agents"],
];

const errors: string[] = [];

for (const [key, description] of required) {
  if (!process.env[key]) {
    errors.push(`  - ${key}: ${description}`);
  }
}

if (errors.length > 0) {
  throw new Error(
    `Missing or invalid environment variables:\n${errors.join("\n")}\n\nSee .env.example for details.`
  );
}

if (process.env.NODE_ENV === "production") {
  for (const [key, description] of productionRequired) {
    if (!process.env[key]) {
      errors.push(`  - ${key}: ${description}`);
    }
  }
  if (errors.length > 0) {
    throw new Error(
      `Missing production environment variables:\n${errors.join("\n")}\n\nSee .env.example for details.`
    );
  }
}

// Warn about missing LLM keys (non-fatal — validated at runtime when agents run)
const missingLlmKeys = llmKeys.filter(([key]) => !process.env[key]);
if (missingLlmKeys.length > 0) {
  console.warn(
    `⚠ Missing LLM API keys (agents will fail at runtime):\n${missingLlmKeys.map(([k, d]) => `  - ${k}: ${d}`).join("\n")}`
  );
}
