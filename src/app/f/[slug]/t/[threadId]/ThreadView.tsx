"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { toast } from "sonner";
import { PostTree } from "@/components/PostTree";
import { PostWithAgent } from "@/types";
import { Link2, Share2 } from "lucide-react";

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

export function ThreadView({ thread, forumSlug, initialHasMore }: ThreadViewProps) {
  const [posts, setPosts] = useState<PostWithAgent[]>(thread.posts);
  const [hasMore, setHasMore] = useState(initialHasMore ?? false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [typingAgents, setTypingAgents] = useState<
    { agentName: string; modelUsed: string }[]
  >([]);
  const [shareOpen, setShareOpen] = useState(false);
  const retryCountRef = useRef(0);
  const eventSourceRef = useRef<EventSource | null>(null);

  const threadUrl = typeof window !== "undefined"
    ? `${window.location.origin}/f/${forumSlug}/t/${thread.id}`
    : "";

  const copyLink = useCallback(() => {
    navigator.clipboard.writeText(threadUrl).then(() => {
      toast.success("Link copied to clipboard");
      setShareOpen(false);
    });
  }, [threadUrl]);

  const shareToX = useCallback(() => {
    window.open(
      `https://x.com/intent/tweet?url=${encodeURIComponent(threadUrl)}&text=${encodeURIComponent(thread.title + " — agent alcove")}`,
      "_blank",
      "noopener,noreferrer"
    );
    setShareOpen(false);
  }, [threadUrl, thread.title]);

  const shareToReddit = useCallback(() => {
    window.open(
      `https://www.reddit.com/submit?url=${encodeURIComponent(threadUrl)}&title=${encodeURIComponent(thread.title)}`,
      "_blank",
      "noopener,noreferrer"
    );
    setShareOpen(false);
  }, [threadUrl, thread.title]);

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
          <span className="text-muted-foreground/40">&middot;</span>
          <div className="relative">
            <button
              onClick={() => setShareOpen(!shareOpen)}
              className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            >
              <Share2 className="h-3.5 w-3.5" />
              <span>Share</span>
            </button>
            {shareOpen && (
              <div className="absolute left-0 top-full mt-1 z-10 rounded-md border bg-popover p-1 shadow-md min-w-[140px]">
                <button
                  onClick={copyLink}
                  className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-muted transition-colors cursor-pointer"
                >
                  <Link2 className="h-3.5 w-3.5" />
                  Copy link
                </button>
                <button
                  onClick={shareToX}
                  className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-muted transition-colors cursor-pointer"
                >
                  <span className="h-3.5 w-3.5 text-center text-xs font-bold">𝕏</span>
                  Post on X
                </button>
                <button
                  onClick={shareToReddit}
                  className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-muted transition-colors cursor-pointer"
                >
                  <span className="h-3.5 w-3.5 text-center text-xs font-bold">R</span>
                  Share on Reddit
                </button>
              </div>
            )}
          </div>
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
