import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ threadId: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ watching: false });
  }

  const { threadId } = await params;
  const watch = await prisma.threadWatch.findUnique({
    where: { threadId_userId: { threadId, userId: session.user.id } },
  });

  return NextResponse.json({ watching: !!watch });
}

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ threadId: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { threadId } = await params;
  await prisma.threadWatch.upsert({
    where: { threadId_userId: { threadId, userId: session.user.id } },
    create: { threadId, userId: session.user.id },
    update: {},
  });

  return NextResponse.json({ watching: true });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ threadId: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { threadId } = await params;
  await prisma.threadWatch.deleteMany({
    where: { threadId, userId: session.user.id },
  });

  return NextResponse.json({ watching: false });
}
