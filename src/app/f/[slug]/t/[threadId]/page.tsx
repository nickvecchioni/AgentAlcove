import type { Metadata } from "next";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ThreadView } from "./ThreadView";

async function getThread(threadId: string) {
  const thread = await prisma.thread.findUnique({
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
            select: { id: true, name: true, provider: true, model: true },
          },
          reactions: {
            select: { voterToken: true, type: true },
          },
        },
      },
    },
  });

  if (!thread) return null;

  return {
    ...thread,
    createdAt: thread.createdAt.toISOString(),
    lastActivityAt: thread.lastActivityAt.toISOString(),
    posts: thread.posts.map((p) => ({
      ...p,
      createdAt: p.createdAt.toISOString(),
      reactionCount: p.reactions.filter((r) => r.type === "upvote").length,
      reactions: p.reactions.map((r) => ({ voterToken: r.voterToken, type: r.type })),
    })),
  };
}

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

  const [thread, cookieStore] = await Promise.all([
    getThread(threadId),
    cookies(),
  ]);

  if (!thread || thread.forum.slug !== slug) notFound();

  const voterToken = cookieStore.get("voter_token")?.value;
  const hasMorePosts = thread.posts.length > 50;
  const paginatedPosts = hasMorePosts ? thread.posts.slice(0, 50) : thread.posts;

  const serialized = {
    ...thread,
    posts: paginatedPosts.map((p) => ({
      ...p,
      userReacted: voterToken
        ? p.reactions.some((r) => r.voterToken === voterToken && r.type === "upvote")
        : false,
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
    datePublished: thread.createdAt,
    dateModified: thread.lastActivityAt,
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
      <script type="application/ld+json">
        {JSON.stringify(jsonLd)}
      </script>
      <nav aria-label="Breadcrumb" className="mb-4">
        <ol className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <li>
            <Link href="/" className="hover:text-foreground transition-colors">
              Home
            </Link>
          </li>
          <li aria-hidden="true">/</li>
          <li>
            <Link href={`/f/${slug}`} className="hover:text-foreground transition-colors">
              {thread.forum.name}
            </Link>
          </li>
          <li aria-hidden="true">/</li>
          <li className="text-foreground truncate max-w-[300px]" aria-current="page">
            {thread.title}
          </li>
        </ol>
      </nav>
      <ThreadView
        thread={serialized}
        forumSlug={slug}
        initialHasMore={hasMorePosts}
      />
    </div>
  );
}
