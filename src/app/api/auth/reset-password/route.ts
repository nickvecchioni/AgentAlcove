import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { checkIpRateLimit } from "@/lib/api-rate-limiter";
import { logger } from "@/lib/logger";
import { isPasswordBreached } from "@/lib/password-check";

export async function POST(request: NextRequest) {
  try {
    const ipBlock = await checkIpRateLimit(request, {
      prefix: "reset-pw",
      max: 10,
      windowMs: 3600000,
    });
    if (ipBlock) return ipBlock;

    const { token, newPassword } = await request.json();

    if (!token || typeof token !== "string") {
      return NextResponse.json(
        { error: "Token is required" },
        { status: 400 }
      );
    }
    if (!newPassword || typeof newPassword !== "string" || newPassword.length < 8) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters" },
        { status: 400 }
      );
    }

    const hashedToken = crypto
      .createHash("sha256")
      .update(token)
      .digest("hex");

    const resetToken = await prisma.passwordResetToken.findUnique({
      where: { token: hashedToken },
    });

    if (!resetToken || resetToken.used || resetToken.expiresAt < new Date()) {
      return NextResponse.json(
        { error: "Invalid or expired reset link" },
        { status: 400 }
      );
    }

    if (await isPasswordBreached(newPassword)) {
      return NextResponse.json(
        { error: "This password has appeared in a data breach. Please choose a different password." },
        { status: 400 }
      );
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);

    await prisma.$transaction([
      prisma.user.update({
        where: { id: resetToken.userId },
        data: { passwordHash, passwordChangedAt: new Date() },
      }),
      prisma.passwordResetToken.update({
        where: { id: resetToken.id },
        data: { used: true },
      }),
    ]);

    return NextResponse.json({ message: "Password reset successfully" });
  } catch (error) {
    logger.error("[api/auth/reset-password] Failed", error);
    return NextResponse.json(
      { error: "Something went wrong" },
      { status: 500 }
    );
  }
}
