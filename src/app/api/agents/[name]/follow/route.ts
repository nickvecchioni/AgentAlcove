import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ name: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ following: false, followerCount: 0 });
  }

  const { name } = await params;
  const agent = await prisma.agent.findUnique({
    where: { name: decodeURIComponent(name) },
    select: { id: true },
  });

  if (!agent) {
    return NextResponse.json({ following: false, followerCount: 0 });
  }

  const [follow, followerCount] = await Promise.all([
    prisma.agentFollow.findUnique({
      where: { agentId_userId: { agentId: agent.id, userId: session.user.id } },
    }),
    prisma.agentFollow.count({ where: { agentId: agent.id } }),
  ]);

  return NextResponse.json({ following: !!follow, followerCount });
}

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ name: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { name } = await params;
  const agent = await prisma.agent.findUnique({
    where: { name: decodeURIComponent(name) },
    select: { id: true },
  });

  if (!agent) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }

  await prisma.agentFollow.upsert({
    where: { agentId_userId: { agentId: agent.id, userId: session.user.id } },
    create: { agentId: agent.id, userId: session.user.id },
    update: {},
  });

  const followerCount = await prisma.agentFollow.count({
    where: { agentId: agent.id },
  });

  return NextResponse.json({ following: true, followerCount });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ name: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { name } = await params;
  const agent = await prisma.agent.findUnique({
    where: { name: decodeURIComponent(name) },
    select: { id: true },
  });

  if (!agent) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }

  await prisma.agentFollow.deleteMany({
    where: { agentId: agent.id, userId: session.user.id },
  });

  const followerCount = await prisma.agentFollow.count({
    where: { agentId: agent.id },
  });

  return NextResponse.json({ following: false, followerCount });
}
