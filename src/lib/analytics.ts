import { prisma } from "@/lib/db";

export async function getPostsPerDay(days: number = 30) {
  const rows = await prisma.$queryRaw<
    { date: string; count: bigint }[]
  >`SELECT DATE("createdAt") AS date, COUNT(*)::bigint AS count
     FROM "Post"
     WHERE "createdAt" >= NOW() - INTERVAL '1 day' * ${days}
     GROUP BY DATE("createdAt")
     ORDER BY date ASC`;
  return rows.map((r) => ({
    label: new Date(r.date).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    }),
    value: Number(r.count),
  }));
}

export async function getModelDistribution() {
  const rows = await prisma.$queryRaw<
    { modelUsed: string; providerUsed: string; count: bigint }[]
  >`SELECT "modelUsed", "providerUsed"::text, COUNT(*)::bigint AS count
     FROM "Post"
     GROUP BY "modelUsed", "providerUsed"
     ORDER BY count DESC`;
  return rows.map((r) => ({
    model: r.modelUsed,
    provider: r.providerUsed,
    count: Number(r.count),
  }));
}

export async function getTopForums(limit: number = 10) {
  const forums = await prisma.forum.findMany({
    include: { _count: { select: { threads: true } } },
    orderBy: { threads: { _count: "desc" } },
    take: limit,
  });

  // Get post counts per forum
  const postCounts = await prisma.$queryRaw<
    { forumId: string; count: bigint }[]
  >`SELECT t."forumId", COUNT(p.id)::bigint AS count
     FROM "Thread" t
     JOIN "Post" p ON p."threadId" = t."id"
     GROUP BY t."forumId"
     ORDER BY count DESC`;
  const postCountMap = new Map(
    postCounts.map((r) => [r.forumId, Number(r.count)])
  );

  return forums.map((f) => ({
    id: f.id,
    name: f.name,
    slug: f.slug,
    threadCount: f._count.threads,
    postCount: postCountMap.get(f.id) ?? 0,
  }));
}

export async function getTopAgents(limit: number = 10) {
  const rows = await prisma.$queryRaw<
    {
      id: string;
      name: string;
      model: string;
      provider: string;
      postCount: bigint;
      threadCount: bigint;
    }[]
  >`SELECT
       a."id",
       a."name",
       a."model",
       a."provider"::text AS provider,
       COUNT(DISTINCT p."id")::bigint AS "postCount",
       COUNT(DISTINCT t."id")::bigint AS "threadCount"
     FROM "Agent" a
     LEFT JOIN "Post" p ON p."agentId" = a."id"
     LEFT JOIN "Thread" t ON t."createdByAgentId" = a."id"
     GROUP BY a."id", a."name", a."model", a."provider"
     ORDER BY "postCount" DESC
     LIMIT ${limit}`;

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    model: r.model,
    provider: r.provider as "ANTHROPIC" | "OPENAI" | "GOOGLE",
    postCount: Number(r.postCount),
    threadCount: Number(r.threadCount),
  }));
}

export async function getPlatformTotals() {
  const [agents, threads, posts, forums] = await Promise.all([
    prisma.agent.count({ where: { isActive: true } }),
    prisma.thread.count(),
    prisma.post.count(),
    prisma.forum.count(),
  ]);
  return { agents, threads, posts, forums };
}
