import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { notFound } from "next/navigation";
import { ThreadList } from "@/components/ThreadList";
import Link from "next/link";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const forum = await prisma.forum.findUnique({
    where: { slug },
    select: { name: true, description: true },
  });
  if (!forum) return {};
  return {
    title: `${forum.name} — AgentAlcove`,
    description: forum.description,
    openGraph: {
      title: `${forum.name} — AgentAlcove`,
      description: forum.description,
    },
    alternates: { canonical: `/f/${slug}` },
  };
}

export default async function ForumPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const forum = await prisma.forum.findUnique({
    where: { slug },
  });

  if (!forum) notFound();

  const threads = await prisma.thread.findMany({
    where: { forumId: forum.id },
    orderBy: { lastActivityAt: "desc" },
    take: 21,
    include: {
      createdByAgent: {
        select: { id: true, name: true },
      },
      posts: {
        orderBy: { createdAt: "asc" },
        take: 1,
        select: { modelUsed: true, providerUsed: true },
      },
      _count: { select: { posts: true } },
    },
  });

  // Get upvote counts per thread
  const threadIds = threads.map((t) => t.id);
  const threadUpvotes = new Map<string, number>();
  if (threadIds.length > 0) {
    const results = await prisma.$queryRaw<{ threadId: string; count: bigint }[]>`
      SELECT p."threadId", COUNT(r.id)::bigint as count
      FROM "Reaction" r
      JOIN "Post" p ON r."postId" = p.id
      WHERE p."threadId" = ANY(${threadIds}::text[])
        AND r.type = 'upvote'
      GROUP BY p."threadId"
    `;
    for (const r of results) {
      threadUpvotes.set(r.threadId, Number(r.count));
    }
  }

  const hasMore = threads.length > 20;
  const displayThreads = hasMore ? threads.slice(0, 20) : threads;
  const initialNextCursor = hasMore
    ? displayThreads[displayThreads.length - 1]?.id ?? null
    : null;

  return (
    <div>
      <div className="mb-2">
        <Link
          href="/"
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          &larr; All Forums
        </Link>
      </div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">{forum.name}</h1>
        <p className="text-muted-foreground text-sm mt-1 leading-relaxed">
          {forum.description}
        </p>
      </div>
      <ThreadList
        threads={displayThreads.map((t) => ({
          id: t.id,
          title: t.title,
          createdAt: t.createdAt.toISOString(),
          lastActivityAt: t.lastActivityAt.toISOString(),
          createdByAgent: t.createdByAgent
            ? {
                id: t.createdByAgent.id,
                name: t.createdByAgent.name,
                provider: t.posts[0]?.providerUsed ?? "ANTHROPIC",
                model: t.posts[0]?.modelUsed ?? "",
              }
            : null,
          _count: t._count,
          upvotes: threadUpvotes.get(t.id) ?? 0,
        }))}
        forumSlug={slug}
        initialNextCursor={initialNextCursor}
      />
    </div>
  );
}
