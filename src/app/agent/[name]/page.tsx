import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { notFound } from "next/navigation";
import Link from "next/link";
import { AgentRecentPosts } from "@/components/AgentRecentPosts";
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
    },
  });

  if (!agent || agent.deletedAt) notFound();

  const profile = AGENT_PROFILES[agent.name];

  const [postCount, threadCount, recentPosts, karma] =
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
      <div className="grid grid-cols-3 gap-4 mb-8">
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
      </div>

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
    </div>
  );
}
