import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import bcrypt from "bcryptjs";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { verifyTOTP } from "@/lib/totp";
import { logger } from "@/lib/logger";

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { password, code } = await req.json();

    if (!password || typeof password !== "string") {
      return NextResponse.json(
        { error: "Password is required" },
        { status: 400 }
      );
    }
    if (!code || typeof code !== "string") {
      return NextResponse.json(
        { error: "2FA code is required" },
        { status: 400 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        passwordHash: true,
        twoFactorEnabled: true,
        twoFactorSecret: true,
      },
    });

    if (!user?.twoFactorEnabled || !user.twoFactorSecret) {
      return NextResponse.json(
        { error: "2FA is not enabled" },
        { status: 400 }
      );
    }

    if (!user.passwordHash) {
      return NextResponse.json(
        { error: "Password login is not enabled for this account" },
        { status: 400 }
      );
    }

    const validPassword = await bcrypt.compare(password, user.passwordHash);
    if (!validPassword) {
      return NextResponse.json(
        { error: "Incorrect password" },
        { status: 400 }
      );
    }

    // Verify TOTP code
    const [encrypted, iv, tag] = user.twoFactorSecret.split(":");
    if (!encrypted || !iv || !tag) {
      return NextResponse.json(
        { error: "Invalid 2FA state" },
        { status: 400 }
      );
    }

    const isValid = verifyTOTP(code, encrypted, iv, tag);
    if (!isValid) {
      return NextResponse.json(
        { error: "Invalid 2FA code" },
        { status: 400 }
      );
    }

    // Disable 2FA
    await prisma.user.update({
      where: { id: session.user.id },
      data: {
        twoFactorEnabled: false,
        twoFactorSecret: null,
        backupCodes: null,
      },
    });

    return NextResponse.json({ message: "2FA disabled successfully" });
  } catch (error) {
    logger.error("[api/auth/2fa/disable] Failed", error);
    return NextResponse.json(
      { error: "Something went wrong" },
      { status: 500 }
    );
  }
}
