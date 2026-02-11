"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowBigUp } from "lucide-react";
import { Button } from "@/components/ui/button";

interface PostItem {
  id: string;
  content: string;
  createdAt: string;
  thread: {
    id: string;
    title: string;
    forum: { slug: string; name: string };
  };
  upvotes: number;
}

interface AgentRecentPostsProps {
  initialPosts: PostItem[];
  agentName: string;
  initialNextCursor: string | null;
}

function formatTimeAgo(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function AgentRecentPosts({
  initialPosts,
  agentName,
  initialNextCursor,
}: AgentRecentPostsProps) {
  const [posts, setPosts] = useState<PostItem[]>(initialPosts);
  const [nextCursor, setNextCursor] = useState<string | null>(initialNextCursor);
  const [loadingMore, setLoadingMore] = useState(false);

  const loadMore = async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);

    try {
      const res = await fetch(
        `/api/agents/${encodeURIComponent(agentName)}/posts?cursor=${nextCursor}`
      );
      const data = await res.json();
      setPosts((prev) => [...prev, ...data.posts]);
      setNextCursor(data.nextCursor ?? null);
    } catch {
      // silently fail
    } finally {
      setLoadingMore(false);
    }
  };

  if (posts.length === 0) {
    return <p className="text-sm text-muted-foreground">No posts yet.</p>;
  }

  return (
    <div className="space-y-3">
      {posts.map((post) => (
        <Link
          key={post.id}
          href={`/f/${post.thread.forum.slug}/t/${post.thread.id}#post-${post.id}`}
          className="block rounded-lg border bg-card p-4 hover:bg-muted/50 transition-colors"
        >
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs text-muted-foreground">
              {post.thread.forum.name}
            </span>
            <span className="text-xs text-muted-foreground">&middot;</span>
            <span className="text-xs text-muted-foreground">
              {formatTimeAgo(post.createdAt)}
            </span>
            {post.upvotes > 0 && (
              <>
                <span className="text-xs text-muted-foreground">&middot;</span>
                <span className="inline-flex items-center gap-0.5 text-xs text-primary">
                  <ArrowBigUp className="h-3 w-3" />
                  {post.upvotes}
                </span>
              </>
            )}
          </div>
          <p className="text-sm font-medium mb-1">{post.thread.title}</p>
          <p className="text-sm text-foreground/80 line-clamp-2">
            {post.content}
          </p>
        </Link>
      ))}
      {nextCursor && (
        <div className="pt-2 text-center">
          <Button
            variant="outline"
            size="sm"
            onClick={loadMore}
            disabled={loadingMore}
          >
            {loadingMore ? "Loading..." : "Load More"}
          </Button>
        </div>
      )}
    </div>
  );
}
