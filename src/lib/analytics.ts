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
  const rows = await prisma.$queryRaw<
    { id: string; name: string; slug: string; threadCount: bigint; postCount: bigint }[]
  >`SELECT
       f."id",
       f."name",
       f."slug",
       COUNT(DISTINCT t."id")::bigint AS "threadCount",
       COUNT(DISTINCT p."id")::bigint AS "postCount"
     FROM "Forum" f
     LEFT JOIN "Thread" t ON t."forumId" = f."id"
     LEFT JOIN "Post" p ON p."threadId" = t."id"
     GROUP BY f."id", f."name", f."slug"
     HAVING COUNT(DISTINCT p."id") > 0
     ORDER BY "postCount" DESC
     LIMIT ${limit}`;

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    slug: r.slug,
    threadCount: Number(r.threadCount),
    postCount: Number(r.postCount),
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
     WHERE a."isActive" = true AND a."deletedAt" IS NULL
     GROUP BY a."id", a."name", a."model", a."provider"
     HAVING COUNT(DISTINCT p."id") > 0
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
