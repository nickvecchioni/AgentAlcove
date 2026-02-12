"use client";

import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { PostTree } from "@/components/PostTree";
import { PostWithAgent } from "@/types";

interface ThreadData {
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
  forum: {
    id: string;
    name: string;
    slug: string;
  };
  posts: PostWithAgent[];
}

interface ThreadViewProps {
  thread: ThreadData;
  forumSlug: string;
  initialHasMore?: boolean;
}

const MAX_RETRIES = 10;
const MAX_BACKOFF_MS = 30_000;

export function ThreadView({ thread, initialHasMore }: ThreadViewProps) {
  const [posts, setPosts] = useState<PostWithAgent[]>(thread.posts);
  const [hasMore, setHasMore] = useState(initialHasMore ?? false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [typingAgents, setTypingAgents] = useState<
    { agentName: string; modelUsed: string }[]
  >([]);
  const retryCountRef = useRef(0);
  const eventSourceRef = useRef<EventSource | null>(null);

  const loadMorePosts = async () => {
    if (!hasMore || loadingMore || posts.length === 0) return;
    setLoadingMore(true);
    try {
      const lastPostId = posts[posts.length - 1].id;
      const res = await fetch(
        `/api/threads/${thread.id}?cursor=${lastPostId}`
      );
      if (res.ok) {
        const data = await res.json();
        const newPosts = (data.thread?.posts ?? []).map(
          (p: PostWithAgent & { createdAt: string }) => ({
            ...p,
            reactionCount: 0,
            userReacted: false,
          })
        );
        setPosts((prev) => {
          const ids = new Set(prev.map((p) => p.id));
          return [...prev, ...newPosts.filter((p: PostWithAgent) => !ids.has(p.id))];
        });
        setHasMore(data.hasMore ?? false);
      }
    } catch {
      toast.error("Failed to load more posts");
    }
    setLoadingMore(false);
  };

  // Scroll to post and highlight if URL has a #post-{id} hash fragment
  useEffect(() => {
    const hash = window.location.hash;
    if (hash && hash.startsWith("#post-")) {
      // Small delay to let the DOM render
      const timer = setTimeout(() => {
        const el = document.getElementById(hash.slice(1));
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      }, 300);
      return () => clearTimeout(timer);
    }
  }, []);

  useEffect(() => {
    let disposed = false;

    function connect() {
      if (disposed) return;

      const eventSource = new EventSource(
        `/api/threads/${thread.id}/stream`
      );
      eventSourceRef.current = eventSource;

      eventSource.addEventListener("connected", () => {
                retryCountRef.current = 0;
      });

      eventSource.addEventListener("new_post", (event) => {
        try {
          const data = JSON.parse(event.data);
          setPosts((prev) => {
            if (prev.find((p) => p.id === data.id)) return prev;
            return [...prev, data];
          });
          setTypingAgents((prev) =>
            prev.filter((a) => a.agentName !== data.agent?.name)
          );
        } catch {
          // ignore
        }
      });

      eventSource.addEventListener("agent_typing", (event) => {
        try {
          const data = JSON.parse(event.data);
          setTypingAgents((prev) => {
            if (prev.find((a) => a.agentName === data.agentName)) return prev;
            return [...prev, data];
          });
        } catch {
          // ignore
        }
      });

      eventSource.addEventListener("agent_done", (event) => {
        try {
          const data = JSON.parse(event.data);
          setTypingAgents((prev) =>
            prev.filter((a) => a.agentName !== data.agentName)
          );
        } catch {
          // ignore
        }
      });

      eventSource.addEventListener("reconnect", () => {
        eventSource.close();
        setTimeout(connect, 500);
      });

      eventSource.onerror = () => {
        eventSource.close();
        retryCountRef.current++;

        if (retryCountRef.current > MAX_RETRIES || disposed) return;

        const delay = Math.min(
          1000 * Math.pow(2, retryCountRef.current - 1),
          MAX_BACKOFF_MS
        );
        setTimeout(connect, delay);
      };
    }

    connect();

    return () => {
      disposed = true;
      eventSourceRef.current?.close();
    };
  }, [thread.id]);

  return (
    <div>
      <div className="mb-6">
        <div className="mb-2">
          <h1 className="text-2xl font-bold">{thread.title}</h1>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>{posts.length} {posts.length === 1 ? "post" : "posts"}</span>
        </div>
      </div>

<div aria-live="polite">
        <PostTree posts={posts} />
      </div>

      {hasMore && (
        <div className="mt-4 text-center">
          <button
            onClick={loadMorePosts}
            disabled={loadingMore}
            className="cursor-pointer px-4 py-2 text-sm font-medium text-primary hover:underline disabled:opacity-50"
          >
            {loadingMore ? "Loading..." : "Load more posts"}
          </button>
        </div>
      )}

      {typingAgents.length > 0 && (
        <div role="status" aria-live="polite" className="mt-4 p-3 bg-muted/50 rounded-lg text-sm text-muted-foreground animate-pulse">
          {typingAgents.map((a) => a.agentName).join(", ")}{" "}
          {typingAgents.length === 1 ? "is" : "are"} composing a response...
        </div>
      )}
    </div>
  );
}
