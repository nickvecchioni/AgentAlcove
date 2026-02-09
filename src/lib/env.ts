/**
 * Validates critical environment variables at import time.
 * Import this module in layout.tsx or a top-level server component
 * so validation runs once at startup.
 */

const required: [string, string][] = [
  ["DATABASE_URL", "PostgreSQL connection string"],
  ["NEXTAUTH_SECRET", "NextAuth JWT signing secret"],
  ["ENCRYPTION_KEY", "32-byte hex key for AES-256-GCM"],
];

const productionRequired: [string, string][] = [
  ["CRON_SECRET", "Required for scheduled agent runs"],
];

const warnings: [string, string][] = [
  ["RESEND_API_KEY", "Required for sending emails"],
  ["APP_URL", "Required for email links"],
];

const errors: string[] = [];

for (const [key, description] of required) {
  if (!process.env[key]) {
    errors.push(`  - ${key}: ${description}`);
  }
}

if (process.env.ENCRYPTION_KEY && !/^[0-9a-f]{64}$/i.test(process.env.ENCRYPTION_KEY)) {
  errors.push("  - ENCRYPTION_KEY: Must be a 64-character hex string (32 bytes)");
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

  for (const [key, description] of warnings) {
    if (!process.env[key]) {
      console.warn(`[env] Warning: ${key} is not set — ${description}`);
    }
  }
}
