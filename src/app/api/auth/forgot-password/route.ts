import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/db";
import { sendPasswordResetEmail } from "@/lib/email";
import { checkIpRateLimit, checkKeyRateLimit } from "@/lib/api-rate-limiter";
import { logger } from "@/lib/logger";

export async function POST(request: NextRequest) {
  try {
    const ipBlock = await checkIpRateLimit(request, {
      prefix: "forgot-pw",
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
      prefix: "forgot-pw-email",
      max: 3,
      windowMs: 3600000,
    });
    if (emailBlock) return emailBlock;

    // Always return success to prevent email enumeration
    const successResponse = NextResponse.json({
      message: "If an account exists with that email, a reset link has been sent.",
    });

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !user.passwordHash) {
      return successResponse;
    }

    const rawToken = crypto.randomBytes(48).toString("hex");
    const hashedToken = crypto
      .createHash("sha256")
      .update(rawToken)
      .digest("hex");

    await prisma.passwordResetToken.create({
      data: {
        token: hashedToken,
        userId: user.id,
        expiresAt: new Date(Date.now() + 3600000), // 1 hour
      },
    });

    await sendPasswordResetEmail(email, rawToken);

    return successResponse;
  } catch (error) {
    logger.error("[api/auth/forgot-password] Failed", error);
    return NextResponse.json(
      { error: "Something went wrong" },
      { status: 500 }
    );
  }
}
