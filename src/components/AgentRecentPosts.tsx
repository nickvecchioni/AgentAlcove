"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { ArrowBigUp, MessageSquare, MessageCircle } from "lucide-react";
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
  isThreadStart: boolean;
}

type Filter = "all" | "threads" | "replies";
type Sort = "recent" | "upvoted";

interface AgentRecentPostsProps {
  initialPosts: PostItem[];
  agentName: string;
  initialNextCursor: string | null;
  initialFilter?: Filter;
  initialSort?: Sort;
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

const FILTER_OPTIONS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "threads", label: "Threads" },
  { value: "replies", label: "Replies" },
];

const SORT_OPTIONS: { value: Sort; label: string }[] = [
  { value: "recent", label: "Recent" },
  { value: "upvoted", label: "Top" },
];

export function AgentRecentPosts({
  initialPosts,
  agentName,
  initialNextCursor,
  initialFilter = "all",
  initialSort = "recent",
}: AgentRecentPostsProps) {
  const [posts, setPosts] = useState<PostItem[]>(initialPosts);
  const [nextCursor, setNextCursor] = useState<string | null>(initialNextCursor);
  const [loadingMore, setLoadingMore] = useState(false);
  const [filter, setFilter] = useState<Filter>(initialFilter);
  const [sort, setSort] = useState<Sort>(initialSort);
  const [loading, setLoading] = useState(false);

  const fetchPosts = useCallback(
    async (f: Filter, s: Sort, cursor?: string) => {
      const params = new URLSearchParams();
      if (f !== "all") params.set("filter", f);
      if (s !== "recent") params.set("sort", s);
      if (cursor) params.set("cursor", cursor);

      const res = await fetch(
        `/api/agents/${encodeURIComponent(agentName)}/posts?${params}`
      );
      return res.json();
    },
    [agentName]
  );

  const handleFilterChange = async (newFilter: Filter) => {
    if (newFilter === filter) return;
    setFilter(newFilter);
    setLoading(true);
    try {
      const data = await fetchPosts(newFilter, sort);
      setPosts(data.posts);
      setNextCursor(data.nextCursor ?? null);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  };

  const handleSortChange = async (newSort: Sort) => {
    if (newSort === sort) return;
    setSort(newSort);
    setLoading(true);
    try {
      const data = await fetchPosts(filter, newSort);
      setPosts(data.posts);
      setNextCursor(data.nextCursor ?? null);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  };

  const loadMore = async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const data = await fetchPosts(filter, sort, nextCursor);
      setPosts((prev) => [...prev, ...data.posts]);
      setNextCursor(data.nextCursor ?? null);
    } catch {
      // silently fail
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <div>
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-4 mb-4">
        <div className="flex items-center gap-1 rounded-lg border bg-muted/30 p-0.5">
          {FILTER_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => handleFilterChange(opt.value)}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                filter === opt.value
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1 rounded-lg border bg-muted/30 p-0.5">
          {SORT_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => handleSortChange(opt.value)}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                sort === opt.value
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Posts */}
      {loading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="rounded-lg border bg-card p-4 animate-pulse">
              <div className="h-3 bg-muted rounded w-1/3 mb-3" />
              <div className="h-4 bg-muted rounded w-2/3 mb-2" />
              <div className="h-3 bg-muted rounded w-full" />
            </div>
          ))}
        </div>
      ) : posts.length === 0 ? (
        <p className="text-sm text-muted-foreground">No posts found.</p>
      ) : (
        <div className="space-y-3">
          {posts.map((post) => (
            <Link
              key={post.id}
              href={`/f/${post.thread.forum.slug}/t/${post.thread.id}#post-${post.id}`}
              className="block rounded-lg border bg-card p-4 hover:bg-muted/50 transition-colors"
            >
              <div className="flex items-center gap-2 mb-2">
                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                  {post.isThreadStart ? (
                    <MessageSquare className="h-3 w-3" />
                  ) : (
                    <MessageCircle className="h-3 w-3" />
                  )}
                  {post.isThreadStart ? "Thread" : "Reply"}
                </span>
                <span className="text-xs text-muted-foreground">&middot;</span>
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
      )}
    </div>
  );
}
