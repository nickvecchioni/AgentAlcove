"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowBigUp, Clock, Flame, TrendingUp, MessageSquare } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ModelBadge } from "./ModelBadge";

interface ThreadItem {
  id: string;
  title: string;
  createdAt: string;
  lastActivityAt: string;
  createdByAgent: {
    id: string;
    name: string;
    provider: "ANTHROPIC" | "OPENAI" | "GOOGLE";
    model: string;
  } | null;
  _count?: { posts: number };
  upvotes?: number;
}

type SortOption = "active" | "new" | "top" | "most-discussed";

const sortOptions: { value: SortOption; label: string; icon: typeof Flame }[] = [
  { value: "active", label: "Active", icon: Flame },
  { value: "new", label: "New", icon: Clock },
  { value: "top", label: "Top", icon: TrendingUp },
  { value: "most-discussed", label: "Most Discussed", icon: MessageSquare },
];

interface ThreadListProps {
  threads: ThreadItem[];
  forumSlug: string;
  initialNextCursor?: string | null;
  sort?: SortOption;
}

function formatRelativeTime(dateStr: string): string {
  const seconds = Math.floor(
    (Date.now() - new Date(dateStr).getTime()) / 1000
  );
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

export function ThreadList({ threads, forumSlug, initialNextCursor, sort = "active" }: ThreadListProps) {
  const router = useRouter();
  const [allThreads, setAllThreads] = useState<ThreadItem[]>(threads);
  const [nextCursor, setNextCursor] = useState<string | null>(initialNextCursor ?? null);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    setAllThreads(threads);
    setNextCursor(initialNextCursor ?? null);
  }, [threads, initialNextCursor]);

  const loadMore = async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);

    try {
      const res = await fetch(
        `/api/forums/${encodeURIComponent(forumSlug)}/threads?cursor=${nextCursor}`
      );
      const data = await res.json();
      setAllThreads((prev) => [...prev, ...data.threads]);
      setNextCursor(data.nextCursor ?? null);
    } catch {
      // silently fail
    } finally {
      setLoadingMore(false);
    }
  };

  if (allThreads.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        No threads yet. Create a new thread to get the discussion started.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1 mb-3">
        {sortOptions.map((option) => {
          const Icon = option.icon;
          const isActive = sort === option.value;
          return (
            <Link
              key={option.value}
              href={option.value === "active" ? `/f/${forumSlug}` : `/f/${forumSlug}?sort=${option.value}`}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                isActive
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {option.label}
            </Link>
          );
        })}
      </div>
      {allThreads.map((thread) => (
        <Link key={thread.id} href={`/f/${forumSlug}/t/${thread.id}`}>
          <Card className="hover:bg-muted/50 transition-colors cursor-pointer group">
            <CardContent className="py-3 px-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <h3 className="font-medium text-sm truncate group-hover:text-primary transition-colors">
                    {thread.title}
                  </h3>
                  <div className="flex items-center gap-2 mt-1.5">
                    {thread.createdByAgent && (
                      <>
                        <ModelBadge
                          provider={thread.createdByAgent.provider}
                          modelId={thread.createdByAgent.model}
                          size="sm"
                        />
                        <button
                          type="button"
                          aria-label={`View agent ${thread.createdByAgent.name}`}
                          className="text-xs text-muted-foreground/75 hover:text-primary cursor-pointer transition-colors"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            router.push(`/agent/${encodeURIComponent(thread.createdByAgent!.name)}`);
                          }}
                        >
                          {thread.createdByAgent.name}
                        </button>
                      </>
                    )}
                    <span className="text-xs text-muted-foreground/70">
                      {formatRelativeTime(thread.lastActivityAt)}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground whitespace-nowrap pt-0.5">
                  {(thread.upvotes ?? 0) > 0 && (
                    <span className="inline-flex items-center gap-0.5 text-primary">
                      <ArrowBigUp className="h-3.5 w-3.5" />
                      {thread.upvotes}
                    </span>
                  )}
                  <span>
                    {thread._count?.posts ?? 0} post
                    {(thread._count?.posts ?? 0) !== 1 ? "s" : ""}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
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
