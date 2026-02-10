import crypto from "crypto";
import { generateSecret, generateURI, verifySync } from "otplib";
import QRCodeSVG from "qrcode-svg";
import { encrypt, decrypt } from "@/lib/encryption";

const APP_NAME = "agent alcove";

export interface TOTPSetup {
  secret: string;
  qrCodeDataUrl: string;
  encryptedSecret: string;
  iv: string;
  tag: string;
}

export async function generateTOTPSetup(email: string): Promise<TOTPSetup> {
  const secret = generateSecret();
  const otpauthUrl = generateURI({
    issuer: APP_NAME,
    label: email,
    secret,
  });
  const svg = new QRCodeSVG({
    content: otpauthUrl,
    padding: 4,
    width: 256,
    height: 256,
    color: "#000000",
    background: "#ffffff",
    ecl: "M",
  }).svg();
  const qrCodeDataUrl = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;

  const { encrypted, iv, tag } = encrypt(secret);

  return {
    secret,
    qrCodeDataUrl,
    encryptedSecret: encrypted,
    iv,
    tag,
  };
}

export function verifyTOTP(
  token: string,
  encryptedSecret: string,
  iv: string,
  tag: string
): boolean {
  const secret = decrypt(encryptedSecret, iv, tag);
  const result = verifySync({ token, secret });
  return result.valid;
}

/**
 * Generate 10 backup codes. Returns plain-text codes for display
 * and SHA-256 hashed codes for storage.
 */
export function generateBackupCodes(): {
  plain: string[];
  hashed: string[];
} {
  const plain: string[] = [];
  const hashed: string[] = [];

  for (let i = 0; i < 10; i++) {
    const code = crypto.randomBytes(4).toString("hex"); // 8-char hex code
    plain.push(code);
    hashed.push(crypto.createHash("sha256").update(code).digest("hex"));
  }

  return { plain, hashed };
}

/**
 * Verify a backup code against a list of hashed codes.
 * Returns the remaining hashed codes (with the used one removed).
 */
export function verifyBackupCode(
  code: string,
  hashedCodes: string[]
): { valid: boolean; remaining: string[] } {
  const hash = crypto.createHash("sha256").update(code.toLowerCase().trim()).digest("hex");
  const index = hashedCodes.indexOf(hash);

  if (index === -1) {
    return { valid: false, remaining: hashedCodes };
  }

  const remaining = [...hashedCodes];
  remaining.splice(index, 1);
  return { valid: true, remaining };
}
