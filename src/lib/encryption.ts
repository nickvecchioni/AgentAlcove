import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";

function parseHexKey(key: string, label: string): Buffer {
  if (!/^[0-9a-f]+$/i.test(key)) {
    throw new Error(`${label} must be a valid hex string`);
  }
  if (key.length !== 64) {
    throw new Error(`${label} must be exactly 64 hex characters (32 bytes)`);
  }
  return Buffer.from(key, "hex");
}

function getEncryptionKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) throw new Error("ENCRYPTION_KEY environment variable is required");
  return parseHexKey(key, "ENCRYPTION_KEY");
}

function getOldEncryptionKey(): Buffer | null {
  const key = process.env.ENCRYPTION_KEY_OLD;
  if (!key) return null;
  return parseHexKey(key, "ENCRYPTION_KEY_OLD");
}

export function encrypt(plaintext: string): {
  encrypted: string;
  iv: string;
  tag: string;
} {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plaintext, "utf8", "hex");
  encrypted += cipher.final("hex");
  const tag = cipher.getAuthTag();

  return {
    encrypted,
    iv: iv.toString("hex"),
    tag: tag.toString("hex"),
  };
}

function decryptWithKey(
  key: Buffer,
  encrypted: string,
  iv: string,
  tag: string
): string {
  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    key,
    Buffer.from(iv, "hex")
  );
  decipher.setAuthTag(Buffer.from(tag, "hex"));

  let decrypted = decipher.update(encrypted, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

/**
 * Decrypt with the current key. If that fails and ENCRYPTION_KEY_OLD is set,
 * try the old key. This allows seamless key rotation — deploy with both keys,
 * run rotateAllAgentKeys(), then remove ENCRYPTION_KEY_OLD.
 */
export function decrypt(encrypted: string, iv: string, tag: string): string {
  const currentKey = getEncryptionKey();
  try {
    return decryptWithKey(currentKey, encrypted, iv, tag);
  } catch (err) {
    const oldKey = getOldEncryptionKey();
    if (!oldKey) throw err;
    return decryptWithKey(oldKey, encrypted, iv, tag);
  }
}

export function maskApiKey(key: string): string {
  if (key.length <= 8) return "****";
  return key.slice(0, 4) + "..." + key.slice(-4);
}

/**
 * Re-encrypt a value from the old key to the current key.
 * Returns new encrypted data, or null if already using the current key.
 */
export function reEncrypt(
  encrypted: string,
  iv: string,
  tag: string
): { encrypted: string; iv: string; tag: string } | null {
  const currentKey = getEncryptionKey();

  // Try decrypting with the current key first — if it works, no rotation needed
  try {
    decryptWithKey(currentKey, encrypted, iv, tag);
    return null;
  } catch {
    // Needs rotation
  }

  // Decrypt with old key, then re-encrypt with current key
  const plaintext = decrypt(encrypted, iv, tag);
  return encrypt(plaintext);
}
