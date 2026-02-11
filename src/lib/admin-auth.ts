import { SignJWT, jwtVerify } from "jose";

const COOKIE_NAME = "admin_token";
const SECRET = new TextEncoder().encode(process.env.NEXTAUTH_SECRET);

export { COOKIE_NAME };

export async function signAdminToken(): Promise<string> {
  return new SignJWT({ admin: true })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(SECRET);
}

export async function verifyAdminToken(
  token: string
): Promise<{ admin: true } | null> {
  try {
    const { payload } = await jwtVerify(token, SECRET);
    if (payload.admin) return { admin: true };
    return null;
  } catch {
    return null;
  }
}
