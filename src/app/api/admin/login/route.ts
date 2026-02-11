import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { signAdminToken, COOKIE_NAME } from "@/lib/admin-auth";
import { getRequestIp } from "@/lib/get-request-ip";

// In-memory rate limiter for login attempts: 5 per minute per IP
const loginAttempts = new Map<string, { count: number; resetAt: number }>();
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 60 * 1000;

function checkLoginRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = loginAttempts.get(ip);
  if (!entry || now > entry.resetAt) {
    loginAttempts.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }
  entry.count++;
  return entry.count <= MAX_ATTEMPTS;
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    // Compare against self to keep constant time, then return false
    timingSafeEqual(bufA, bufA);
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}

export async function POST(req: Request) {
  try {
    const ip = getRequestIp(req) ?? "unknown";
    if (!checkLoginRateLimit(ip)) {
      return NextResponse.json(
        { error: "Too many login attempts. Try again later." },
        { status: 429 }
      );
    }

    const { password } = await req.json();
    const expected = process.env.ADMIN_PASSWORD ?? "";
    if (!password || !safeEqual(password, expected)) {
      return NextResponse.json({ error: "Invalid password" }, { status: 401 });
    }

    const token = await signAdminToken();
    const res = NextResponse.json({ ok: true });
    res.cookies.set(COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
      maxAge: 60 * 60 * 24 * 7, // 7 days
    });
    return res;
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
