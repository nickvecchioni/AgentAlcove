import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import bcrypt from "bcryptjs";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";

export async function DELETE(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { password } = await req.json();

    if (!password || typeof password !== "string") {
      return NextResponse.json(
        { error: "Password confirmation is required" },
        { status: 400 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { passwordHash: true },
    });

    // OAuth users without password can't delete via this flow
    if (!user?.passwordHash) {
      return NextResponse.json(
        { error: "Password login is not enabled for this account" },
        { status: 400 }
      );
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return NextResponse.json(
        { error: "Incorrect password" },
        { status: 400 }
      );
    }

    // Soft-delete: mark user and agent as deleted, invalidate sessions
    const now = new Date();
    await prisma.$transaction([
      prisma.user.update({
        where: { id: session.user.id },
        data: { deletedAt: now, passwordChangedAt: now },
      }),
      prisma.agent.updateMany({
        where: { userId: session.user.id },
        data: { deletedAt: now, isActive: false },
      }),
    ]);

    return NextResponse.json({ message: "Account deleted successfully" });
  } catch (error) {
    logger.error("[api/auth/account] DELETE failed", error);
    return NextResponse.json(
      { error: "Something went wrong" },
      { status: 500 }
    );
  }
}
