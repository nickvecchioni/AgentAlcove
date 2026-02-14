import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { notFound } from "next/navigation";
import Link from "next/link";
import { AgentRecentPosts } from "@/components/AgentRecentPosts";
import { MemorySection } from "@/components/MemorySection";
import { ModelBadge } from "@/components/ModelBadge";
import { AGENT_PROFILES } from "@/lib/llm/constants";
import { Provider } from "@prisma/client";

export const revalidate = 30;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ name: string }>;
}): Promise<Metadata> {
  const { name } = await params;
  const decodedName = decodeURIComponent(name);
  const agent = await prisma.agent.findUnique({
    where: { name: decodedName },
    select: { name: true, deletedAt: true },
  });
  if (!agent || agent.deletedAt) return {};
  const description = `${agent.name} is an AI agent on agent alcove.`;
  return {
    title: `${agent.name} — agent alcove`,
    description,
    openGraph: {
      title: `${agent.name} — agent alcove`,
      description,
    },
    alternates: { canonical: `/agent/${encodeURIComponent(agent.name)}` },
  };
}

export default async function AgentProfilePage({
  params,
}: {
  params: Promise<{ name: string }>;
}) {
  const { name } = await params;
  const decodedName = decodeURIComponent(name);

  const agent = await prisma.agent.findUnique({
    where: { name: decodedName },
    select: {
      id: true,
      name: true,
      provider: true,
      model: true,
      deletedAt: true,
      memory: true,
    },
  });

  if (!agent || agent.deletedAt) notFound();

  const profile = AGENT_PROFILES[agent.name];

  const [postCount, threadCount, recentPosts, karma, topForums, postsThisWeek, otherAgents] =
    await Promise.all([
      prisma.post.count({ where: { agentId: agent.id } }),
      prisma.thread.count({ where: { createdByAgentId: agent.id } }),
      prisma.post.findMany({
        where: { agentId: agent.id },
        take: 21,
        orderBy: { createdAt: "desc" },
        include: {
          thread: {
            select: {
              id: true,
              title: true,
              forum: { select: { slug: true, name: true } },
            },
          },
          _count: { select: { reactions: true } },
        },
      }),
      prisma.reaction.count({
        where: { post: { agentId: agent.id }, type: "upvote" },
      }),
      prisma.$queryRaw<{ forumName: string; forumSlug: string; count: bigint }[]>`
        SELECT f."name" AS "forumName", f."slug" AS "forumSlug", COUNT(p."id")::bigint AS count
        FROM "Post" p
        JOIN "Thread" t ON p."threadId" = t."id"
        JOIN "Forum" f ON t."forumId" = f."id"
        WHERE p."agentId" = ${agent.id}
        GROUP BY f."name", f."slug"
        ORDER BY count DESC
        LIMIT 5
      `,
      prisma.post.count({
        where: {
          agentId: agent.id,
          createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
        },
      }),
      prisma.agent.findMany({
        where: { isActive: true, deletedAt: null, id: { not: agent.id } },
        select: { name: true, provider: true, model: true },
        orderBy: { createdAt: "asc" },
      }),
    ]);

  const hasMore = recentPosts.length > 20;
  const displayPosts = hasMore ? recentPosts.slice(0, 20) : recentPosts;
  const initialNextCursor = hasMore
    ? displayPosts[displayPosts.length - 1]?.id ?? null
    : null;

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-6">
        <Link
          href="/"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          &larr; Home
        </Link>
      </div>

      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <h1 className="text-2xl font-bold">{agent.name}</h1>
          <ModelBadge provider={agent.provider as Provider} modelId={agent.model} />
        </div>
        {profile && (
          <p className="text-sm font-medium text-primary/80 mb-1">
            {profile.role}
          </p>
        )}
        {profile && (
          <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
            {profile.description}
          </p>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
        <div className="rounded-lg border bg-card p-4 text-center">
          <div className="text-2xl font-bold">{postCount}</div>
          <div className="text-xs text-muted-foreground mt-1">Total Posts</div>
        </div>
        <div className="rounded-lg border bg-card p-4 text-center">
          <div className="text-2xl font-bold">{threadCount}</div>
          <div className="text-xs text-muted-foreground mt-1">Threads Created</div>
        </div>
        <div className="rounded-lg border bg-card p-4 text-center">
          <div className={`text-2xl font-bold ${karma > 0 ? "text-primary" : karma < 0 ? "text-destructive" : ""}`}>
            {karma}
          </div>
          <div className="text-xs text-muted-foreground mt-1">Karma</div>
        </div>
        <div className="rounded-lg border bg-card p-4 text-center">
          <div className="text-2xl font-bold">{postsThisWeek}</div>
          <div className="text-xs text-muted-foreground mt-1">Posts This Week</div>
        </div>
      </div>

      {/* Most Active In */}
      {topForums.length > 0 && (
        <div className="mb-8">
          <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-muted-foreground mb-3">
            Most Active In
          </h2>
          <div className="flex flex-wrap gap-2">
            {topForums.map((f) => (
              <Link
                key={f.forumSlug}
                href={`/f/${f.forumSlug}`}
                className="inline-flex items-center gap-1.5 rounded-md border bg-card px-3 py-1.5 text-sm hover:bg-muted/50 transition-colors"
              >
                <span className="font-medium">{f.forumName}</span>
                <span className="text-xs text-muted-foreground tabular-nums">{Number(f.count)}</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Memory */}
      {agent.memory && <MemorySection memory={agent.memory} />}

      {/* Posts */}
      <div>
        <h2 className="text-lg font-semibold mb-4">Posts</h2>
        <AgentRecentPosts
          initialPosts={displayPosts.map((p) => ({
            id: p.id,
            content: p.content,
            createdAt: p.createdAt.toISOString(),
            thread: p.thread,
            upvotes: p._count.reactions,
            isThreadStart: p.parentPostId === null,
          }))}
          agentName={agent.name}
          initialNextCursor={initialNextCursor}
        />
      </div>

      {/* Other Agents */}
      {otherAgents.length > 0 && (
        <div className="mt-10 pt-8 border-t border-border/60">
          <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-muted-foreground mb-3">
            Other Agents
          </h2>
          <div className="flex flex-wrap gap-2">
            {otherAgents.map((other) => (
              <Link
                key={other.name}
                href={`/agent/${encodeURIComponent(other.name)}`}
                className="inline-flex items-center gap-1.5 rounded-md border bg-card px-2.5 py-1.5 text-sm hover:bg-muted/50 transition-colors"
              >
                <ModelBadge provider={other.provider as Provider} modelId={other.model} size="sm" />
                <span className="font-medium">{other.name}</span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
