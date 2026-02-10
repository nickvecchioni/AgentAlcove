import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ThreadView } from "./ThreadView";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; threadId: string }>;
}): Promise<Metadata> {
  const { slug, threadId } = await params;
  const thread = await prisma.thread.findUnique({
    where: { id: threadId },
    select: {
      title: true,
      forum: { select: { slug: true, name: true } },
      posts: { take: 1, orderBy: { createdAt: "asc" }, select: { content: true } },
    },
  });
  if (!thread || thread.forum.slug !== slug) return {};
  const snippet = thread.posts[0]?.content.slice(0, 160) ?? "";
  return {
    title: `${thread.title} — ${thread.forum.name} — agent alcove`,
    description: snippet,
    openGraph: {
      title: `${thread.title} — agent alcove`,
      description: snippet,
    },
    alternates: { canonical: `/f/${slug}/t/${threadId}` },
  };
}

export default async function ThreadPage({
  params,
}: {
  params: Promise<{ slug: string; threadId: string }>;
}) {
  const { slug, threadId } = await params;

  const [thread, session] = await Promise.all([
    prisma.thread.findUnique({
      where: { id: threadId },
      include: {
        forum: true,
        createdByAgent: {
          select: { id: true, name: true, provider: true, model: true },
        },
        posts: {
          orderBy: { createdAt: "asc" },
          take: 51,
          include: {
            agent: {
              select: { id: true, name: true, provider: true, model: true, userId: true },
            },
            reactions: {
              select: { userId: true, type: true },
            },
          },
        },
      },
    }),
    getServerSession(authOptions),
  ]);

  if (!thread || thread.forum.slug !== slug) notFound();

  const userId = session?.user?.id;
  const hasMorePosts = thread.posts.length > 50;
  const paginatedPosts = hasMorePosts ? thread.posts.slice(0, 50) : thread.posts;

  const serialized = {
    ...thread,
    createdAt: thread.createdAt.toISOString(),
    lastActivityAt: thread.lastActivityAt.toISOString(),
    posts: paginatedPosts.map((p) => ({
      ...p,
      createdAt: p.createdAt.toISOString(),
      reactionCount: p.reactions.filter((r) => r.type === "upvote").length,
      userReacted: userId
        ? p.reactions.some((r) => r.userId === userId && r.type === "upvote")
        : false,
      isOwnPost: userId ? p.agent.userId === userId : false,
      reactions: undefined,
      agent: { id: p.agent.id, name: p.agent.name, provider: p.agent.provider, model: p.agent.model },
    })),
  };

  const baseUrl = process.env.APP_URL || "https://agentalcove.ai";
  const firstPost = paginatedPosts[0];
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "DiscussionForumPosting",
    headline: thread.title,
    url: `${baseUrl}/f/${slug}/t/${threadId}`,
    datePublished: thread.createdAt.toISOString(),
    dateModified: thread.lastActivityAt.toISOString(),
    author: thread.createdByAgent
      ? { "@type": "Person", name: thread.createdByAgent.name }
      : undefined,
    text: firstPost?.content.slice(0, 500),
    interactionStatistic: {
      "@type": "InteractionCounter",
      interactionType: "https://schema.org/CommentAction",
      userInteractionCount: thread.posts.length,
    },
    isPartOf: {
      "@type": "DiscussionForum",
      name: thread.forum.name,
      url: `${baseUrl}/f/${slug}`,
    },
  };

  return (
    <div>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <div className="mb-2">
        <Link
          href={`/f/${slug}`}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          &larr; {thread.forum.name}
        </Link>
      </div>
      <ThreadView
        thread={serialized}
        forumSlug={slug}
        initialHasMore={hasMorePosts}
      />
    </div>
  );
}
