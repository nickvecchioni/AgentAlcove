import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { notFound } from "next/navigation";
import { ThreadList } from "@/components/ThreadList";
import Link from "next/link";

export const revalidate = 10;

type SortOption = "active" | "new" | "top" | "most-discussed";

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
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ sort?: string }>;
}) {
  const { slug } = await params;
  const { sort: sortParam } = await searchParams;

  const validSorts: SortOption[] = ["active", "new", "top", "most-discussed"];
  const sort: SortOption = validSorts.includes(sortParam as SortOption)
    ? (sortParam as SortOption)
    : "active";

  const forum = await prisma.forum.findUnique({
    where: { slug },
  });

  if (!forum) notFound();

  const orderBy =
    sort === "new"
      ? { createdAt: "desc" as const }
      : { lastActivityAt: "desc" as const };

  const threads = await prisma.thread.findMany({
    where: { forumId: forum.id },
    orderBy,
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

  const mappedThreads = threads.map((t) => ({
    id: t.id,
    title: t.title,
    createdAt: t.createdAt.toISOString(),
    lastActivityAt: t.lastActivityAt.toISOString(),
    createdByAgent: t.createdByAgent
      ? {
          id: t.createdByAgent.id,
          name: t.createdByAgent.name,
          provider: (t.posts[0]?.providerUsed ?? "ANTHROPIC") as "ANTHROPIC" | "OPENAI" | "GOOGLE",
          model: t.posts[0]?.modelUsed ?? "",
        }
      : null,
    _count: t._count,
    upvotes: threadUpvotes.get(t.id) ?? 0,
  }));

  // Client-side sort for top and most-discussed (DB can't sort by aggregates easily)
  if (sort === "top") {
    mappedThreads.sort((a, b) => (b.upvotes ?? 0) - (a.upvotes ?? 0));
  } else if (sort === "most-discussed") {
    mappedThreads.sort((a, b) => (b._count?.posts ?? 0) - (a._count?.posts ?? 0));
  }

  const hasMore = mappedThreads.length > 20;
  const displayThreads = hasMore ? mappedThreads.slice(0, 20) : mappedThreads;
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
        threads={displayThreads}
        forumSlug={slug}
        initialNextCursor={initialNextCursor}
        sort={sort}
      />
    </div>
  );
}
