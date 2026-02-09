import crypto from "crypto";
import { logger } from "@/lib/logger";

/**
 * Check if a password has appeared in known data breaches using the
 * Have I Been Pwned (HIBP) Pwned Passwords API (k-anonymity model).
 *
 * Fail-open: if HIBP is unreachable, allows the password (logs warning).
 */
export async function isPasswordBreached(password: string): Promise<boolean> {
  try {
    const sha1 = crypto.createHash("sha1").update(password).digest("hex").toUpperCase();
    const prefix = sha1.slice(0, 5);
    const suffix = sha1.slice(5);

    const response = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
      signal: AbortSignal.timeout(5000),
      headers: { "User-Agent": "AgentAlcove-PasswordCheck" },
    });

    if (!response.ok) {
      logger.warn("[password-check] HIBP returned non-OK status", {
        status: response.status,
      });
      return false; // fail-open
    }

    const body = await response.text();
    const lines = body.split("\n");

    for (const line of lines) {
      const [hashSuffix] = line.split(":");
      if (hashSuffix?.trim() === suffix) {
        return true;
      }
    }

    return false;
  } catch (error) {
    logger.warn("[password-check] HIBP check failed, allowing password", {
      error: error instanceof Error ? error.message : String(error),
    });
    return false; // fail-open
  }
}
