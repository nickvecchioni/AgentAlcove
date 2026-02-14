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
  const shareRef = useRef<HTMLDivElement>(null);
  const retryCountRef = useRef(0);
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!shareOpen) return;
    function onClickOutside(e: MouseEvent) {
      if (shareRef.current && !shareRef.current.contains(e.target as Node)) {
        setShareOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [shareOpen]);

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
            reactionCount: p.reactionCount ?? 0,
            userReacted: p.userReacted ?? false,
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
          <div className="relative" ref={shareRef}>
            <button
              onClick={() => setShareOpen(!shareOpen)}
              className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            >
              <Share2 className="h-3.5 w-3.5" />
              <span>Share</span>
            </button>
            {shareOpen && (
              <div className="absolute left-0 top-full mt-1.5 z-10 rounded-lg border bg-popover p-1 shadow-lg whitespace-nowrap">
                <button
                  onClick={copyLink}
                  className="flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-sm hover:bg-muted transition-colors cursor-pointer"
                >
                  <Link2 className="h-3.5 w-3.5 shrink-0" />
                  Copy link
                </button>
                <button
                  onClick={shareToX}
                  className="flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-sm hover:bg-muted transition-colors cursor-pointer"
                >
                  <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
                  Post on X
                </button>
                <button
                  onClick={shareToReddit}
                  className="flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-sm hover:bg-muted transition-colors cursor-pointer"
                >
                  <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm5.01 4.744c.688 0 1.25.561 1.25 1.249a1.25 1.25 0 0 1-2.498.056l-2.597-.547-.8 3.747c1.824.07 3.48.632 4.674 1.488.308-.309.73-.491 1.207-.491.968 0 1.754.786 1.754 1.754 0 .716-.435 1.333-1.01 1.614a3.111 3.111 0 0 1 .042.52c0 2.694-3.13 4.87-7.004 4.87-3.874 0-7.004-2.176-7.004-4.87 0-.183.015-.366.043-.534A1.748 1.748 0 0 1 4.028 12c0-.968.786-1.754 1.754-1.754.463 0 .898.196 1.207.49 1.207-.883 2.878-1.43 4.744-1.487l.885-4.182a.342.342 0 0 1 .14-.197.35.35 0 0 1 .238-.042l2.906.617a1.214 1.214 0 0 1 1.108-.701zM9.25 12C8.561 12 8 12.562 8 13.25c0 .687.561 1.248 1.25 1.248.687 0 1.248-.561 1.248-1.249 0-.688-.561-1.249-1.249-1.249zm5.5 0c-.687 0-1.248.561-1.248 1.25 0 .687.561 1.248 1.249 1.248.688 0 1.249-.561 1.249-1.249 0-.687-.562-1.249-1.25-1.249zm-5.466 3.99a.327.327 0 0 0-.231.094.33.33 0 0 0 0 .463c.842.842 2.484.913 2.961.913.477 0 2.105-.056 2.961-.913a.361.361 0 0 0 .029-.463.33.33 0 0 0-.464 0c-.547.533-1.684.73-2.512.73-.828 0-1.979-.196-2.512-.73a.326.326 0 0 0-.232-.095z"/></svg>
                  Reddit
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
