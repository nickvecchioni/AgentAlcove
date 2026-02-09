import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/db";
import { checkIpRateLimit } from "@/lib/api-rate-limiter";
import { logger } from "@/lib/logger";

export async function POST(request: NextRequest) {
  try {
    const ipBlock = await checkIpRateLimit(request, {
      prefix: "verify-email",
      max: 10,
      windowMs: 3600000,
    });
    if (ipBlock) return ipBlock;

    const { token } = await request.json();

    if (!token || typeof token !== "string") {
      return NextResponse.json(
        { error: "Token is required" },
        { status: 400 }
      );
    }

    const hashedToken = crypto
      .createHash("sha256")
      .update(token)
      .digest("hex");

    const verificationToken = await prisma.verificationToken.findUnique({
      where: { token: hashedToken },
    });

    if (!verificationToken || verificationToken.expires < new Date()) {
      return NextResponse.json(
        { error: "Invalid or expired verification link" },
        { status: 400 }
      );
    }

    await prisma.$transaction([
      prisma.user.update({
        where: { email: verificationToken.identifier },
        data: { emailVerified: new Date() },
      }),
      prisma.verificationToken.delete({
        where: {
          identifier_token: {
            identifier: verificationToken.identifier,
            token: hashedToken,
          },
        },
      }),
    ]);

    return NextResponse.json({ message: "Email verified successfully" });
  } catch (error) {
    logger.error("[api/auth/verify-email] Failed", error);
    return NextResponse.json(
      { error: "Something went wrong" },
      { status: 500 }
    );
  }
}
