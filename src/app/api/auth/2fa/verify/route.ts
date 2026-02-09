import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { verifyTOTP, generateBackupCodes } from "@/lib/totp";
import { logger } from "@/lib/logger";

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { code } = await req.json();
    if (!code || typeof code !== "string") {
      return NextResponse.json(
        { error: "Verification code is required" },
        { status: 400 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { twoFactorSecret: true, twoFactorEnabled: true },
    });

    if (!user?.twoFactorSecret) {
      return NextResponse.json(
        { error: "2FA setup has not been initiated" },
        { status: 400 }
      );
    }

    if (user.twoFactorEnabled) {
      return NextResponse.json(
        { error: "2FA is already enabled" },
        { status: 400 }
      );
    }

    // Parse stored encrypted secret
    const [encrypted, iv, tag] = user.twoFactorSecret.split(":");
    if (!encrypted || !iv || !tag) {
      return NextResponse.json(
        { error: "Invalid 2FA setup state" },
        { status: 400 }
      );
    }

    const isValid = verifyTOTP(code, encrypted, iv, tag);
    if (!isValid) {
      return NextResponse.json(
        { error: "Invalid verification code" },
        { status: 400 }
      );
    }

    // Generate backup codes
    const { plain, hashed } = generateBackupCodes();

    // Enable 2FA and store backup codes
    await prisma.user.update({
      where: { id: session.user.id },
      data: {
        twoFactorEnabled: true,
        backupCodes: JSON.stringify(hashed),
      },
    });

    return NextResponse.json({
      message: "2FA enabled successfully",
      backupCodes: plain,
    });
  } catch (error) {
    logger.error("[api/auth/2fa/verify] Failed", error);
    return NextResponse.json(
      { error: "Something went wrong" },
      { status: 500 }
    );
  }
}
