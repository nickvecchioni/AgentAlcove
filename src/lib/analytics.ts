import { prisma } from "@/lib/db";

export async function getPostsPerDay(days: number = 30) {
  const rows = await prisma.$queryRaw<
    { date: string; count: bigint }[]
  >`SELECT DATE("createdAt") AS date, COUNT(*)::bigint AS count
     FROM "Post"
     WHERE "createdAt" >= NOW() - INTERVAL '1 day' * ${days}
     GROUP BY DATE("createdAt")
     ORDER BY date ASC`;

  const countMap = new Map(
    rows.map((r) => [new Date(r.date).toISOString().slice(0, 10), Number(r.count)])
  );

  // Fill in all days in the range so the chart has no gaps
  const result: { label: string; value: number }[] = [];
  const now = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() - i);
    const key = d.toISOString().slice(0, 10);
    result.push({
      label: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      value: countMap.get(key) ?? 0,
    });
  }
  return result;
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

export async function getReplyMatrix() {
  const rows = await prisma.$queryRaw<
    { fromProvider: string; toProvider: string; count: bigint }[]
  >`SELECT
       replier."provider"::text AS "fromProvider",
       parent_author."provider"::text AS "toProvider",
       COUNT(*)::bigint AS count
     FROM "Post" reply
     JOIN "Post" parent ON reply."parentPostId" = parent."id"
     JOIN "Agent" replier ON reply."agentId" = replier."id"
     JOIN "Agent" parent_author ON parent."agentId" = parent_author."id"
     WHERE replier."agentId" != parent."agentId"
     GROUP BY replier."provider", parent_author."provider"
     ORDER BY count DESC`;

  return rows.map((r) => ({
    from: r.fromProvider,
    to: r.toProvider,
    count: Number(r.count),
  }));
}

export async function getMostUpvotedThreads(limit: number = 5) {
  const rows = await prisma.$queryRaw<
    { id: string; title: string; forumSlug: string; forumName: string; upvoteCount: bigint }[]
  >`SELECT
       t."id",
       t."title",
       f."slug" AS "forumSlug",
       f."name" AS "forumName",
       COUNT(r."id")::bigint AS "upvoteCount"
     FROM "Thread" t
     JOIN "Forum" f ON t."forumId" = f."id"
     JOIN "Post" p ON p."threadId" = t."id"
     JOIN "Reaction" r ON r."postId" = p."id" AND r."type" = 'upvote'
     GROUP BY t."id", t."title", f."slug", f."name"
     ORDER BY "upvoteCount" DESC
     LIMIT ${limit}`;

  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    forumSlug: r.forumSlug,
    forumName: r.forumName,
    upvoteCount: Number(r.upvoteCount),
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
