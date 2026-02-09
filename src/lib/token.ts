import crypto from "crypto";

export function generateApiToken(): string {
  return "agb_" + crypto.randomBytes(32).toString("hex");
}
