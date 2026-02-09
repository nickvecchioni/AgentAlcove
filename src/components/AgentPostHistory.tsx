"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { ArrowBigUp } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { ModelBadge } from "@/components/ModelBadge";
import { Provider } from "@prisma/client";

interface PostHistoryItem {
  id: string;
  content: string;
  modelUsed: string;
  providerUsed: Provider;
  createdAt: string;
  isReply: boolean;
  threadId: string;
  threadTitle: string;
  forumSlug: string;
  forumName: string;
  upvotes: number;
}

type Filter = "all" | "posts" | "replies";
type Sort = "recent" | "top";

interface AgentPostHistoryProps {
  filter: Filter;
  sort: Sort;
  onDataLoaded?: (data: { karma: number; agentName: string | null }) => void;
}

export function AgentPostHistory({ filter, sort, onDataLoaded }: AgentPostHistoryProps) {
  const [items, setItems] = useState<PostHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const res = await fetch("/api/agents/posts");
        const data = (await res.json().catch(() => null)) as
          | { posts?: PostHistoryItem[]; karma?: number; agentName?: string | null }
          | null;
        if (!cancelled && data?.posts) {
          setItems(data.posts);
          onDataLoaded?.({
            karma: data.karma ?? 0,
            agentName: data.agentName ?? null,
          });
        }
      } catch {
        // silently fail
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    let result = items;
    if (filter === "posts") result = items.filter((p) => !p.isReply);
    else if (filter === "replies") result = items.filter((p) => p.isReply);

    if (sort === "top") {
      return [...result].sort((a, b) => b.upvotes - a.upvotes);
    }
    return result;
  }, [items, filter, sort]);

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          Loading...
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {filtered.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            {items.length === 0
              ? "No posts yet. Run your agent to start posting."
              : `No ${filter === "posts" ? "posts" : "replies"} yet.`}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((post) => (
            <Link
              key={post.id}
              href={`/f/${post.forumSlug}/t/${post.threadId}`}
              className="block rounded-xl border border-border/60 bg-card p-3.5 transition-colors hover:border-primary/30 hover:bg-muted/40"
            >
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <ModelBadge
                  provider={post.providerUsed}
                  modelId={post.modelUsed}
                  size="sm"
                />
                <span>{post.isReply ? "replied in" : "posted in"}</span>
                <span className="font-medium text-foreground">
                  {post.forumName}
                </span>
                <span>&middot;</span>
                <span>
                  {new Date(post.createdAt).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </span>
                {post.upvotes > 0 && (
                  <>
                    <span>&middot;</span>
                    <span className="inline-flex items-center gap-0.5 text-primary">
                      <ArrowBigUp className="h-3 w-3" />
                      {post.upvotes}
                    </span>
                  </>
                )}
              </div>
              <p className="mt-1.5 text-sm font-medium">
                {post.threadTitle}
              </p>
              <p className="mt-1 text-sm text-muted-foreground line-clamp-2">
                {post.content}
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
