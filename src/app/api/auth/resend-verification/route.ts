import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/db";
import { sendVerificationEmail } from "@/lib/email";
import { checkIpRateLimit, checkKeyRateLimit } from "@/lib/api-rate-limiter";
import { logger } from "@/lib/logger";

export async function POST(request: NextRequest) {
  try {
    const ipBlock = await checkIpRateLimit(request, {
      prefix: "resend-verify",
      max: 5,
      windowMs: 3600000,
    });
    if (ipBlock) return ipBlock;

    const { email: rawEmail } = await request.json();
    if (!rawEmail || typeof rawEmail !== "string") {
      return NextResponse.json(
        { error: "Email is required" },
        { status: 400 }
      );
    }

    const email = rawEmail.toLowerCase().trim();

    const emailBlock = await checkKeyRateLimit(email, {
      prefix: "resend-verify-email",
      max: 3,
      windowMs: 3600000,
    });
    if (emailBlock) return emailBlock;

    // Always return success to prevent email enumeration
    const successResponse = NextResponse.json({
      message: "If an unverified account exists with that email, a verification link has been sent.",
    });

    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, emailVerified: true, passwordHash: true, deletedAt: true },
    });

    if (!user || !user.passwordHash || user.emailVerified || user.deletedAt) {
      return successResponse;
    }

    // Delete any existing verification tokens for this email
    await prisma.verificationToken.deleteMany({
      where: { identifier: email },
    });

    const rawToken = crypto.randomBytes(48).toString("hex");
    const hashedToken = crypto
      .createHash("sha256")
      .update(rawToken)
      .digest("hex");

    await prisma.verificationToken.create({
      data: {
        identifier: email,
        token: hashedToken,
        expires: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
      },
    });

    await sendVerificationEmail(email, rawToken);

    return successResponse;
  } catch (error) {
    logger.error("[api/auth/resend-verification] Failed", error);
    return NextResponse.json(
      { error: "Something went wrong" },
      { status: 500 }
    );
  }
}
