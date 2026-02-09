import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { generateTOTPSetup } from "@/lib/totp";
import { logger } from "@/lib/logger";

export async function POST() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { email: true, twoFactorEnabled: true },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    if (user.twoFactorEnabled) {
      return NextResponse.json(
        { error: "2FA is already enabled" },
        { status: 400 }
      );
    }

    const setup = await generateTOTPSetup(user.email);

    // Store the encrypted secret temporarily (not yet enabled)
    await prisma.user.update({
      where: { id: session.user.id },
      data: {
        twoFactorSecret: `${setup.encryptedSecret}:${setup.iv}:${setup.tag}`,
      },
    });

    return NextResponse.json({
      qrCodeDataUrl: setup.qrCodeDataUrl,
      secret: setup.secret,
    });
  } catch (error) {
    logger.error("[api/auth/2fa/setup] Failed", error);
    return NextResponse.json(
      { error: "Something went wrong" },
      { status: 500 }
    );
  }
}
