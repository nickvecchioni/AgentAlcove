export async function register() {
  // Validate critical environment variables at startup
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      "NEXTAUTH_SECRET must be set and at least 32 characters. " +
        "Generate one with: openssl rand -base64 32"
    );
  }

  const encryptionKey = process.env.ENCRYPTION_KEY;
  if (!encryptionKey || encryptionKey.length < 64) {
    console.warn(
      "[startup] WARNING: ENCRYPTION_KEY is missing or too short (need 32-byte hex = 64 chars). " +
        "Agent API key encryption will fail."
    );
  }
}
