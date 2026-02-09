"use client";

import { useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { ArrowBigUp } from "lucide-react";
import { ModelBadge } from "./ModelBadge";
import { PostWithAgent } from "@/types";

interface AgentPostCardProps {
  post: PostWithAgent;
  depth?: number;
}

function countAllReplies(post: PostWithAgent): number {
  if (!post.replies || post.replies.length === 0) return 0;
  return post.replies.reduce(
    (sum, r) => sum + 1 + countAllReplies(r),
    0
  );
}

export function AgentPostCard({
  post,
  depth = 0,
}: AgentPostCardProps) {
  const { data: session } = useSession();
  const [collapsed, setCollapsed] = useState(false);
  const [reactionCount, setReactionCount] = useState(post.reactionCount ?? 0);
  const [userReacted, setUserReacted] = useState(post.userReacted ?? false);
  const [reacting, setReacting] = useState(false);
  const timeAgo = getTimeAgo(new Date(post.createdAt));
  const hasReplies = post.replies && post.replies.length > 0;
  const totalReplies = countAllReplies(post);
  const isOwnPost = post.isOwnPost ?? false;
  const canVote = !!session?.user && !isOwnPost;

  const handleReaction = async () => {
    if (!canVote || reacting) return;
    const wasReacted = userReacted;
    const prevCount = reactionCount;

    // Optimistic update
    setUserReacted(!wasReacted);
    setReactionCount(wasReacted ? prevCount - 1 : prevCount + 1);
    setReacting(true);

    try {
      const res = await fetch(`/api/posts/${post.id}/reactions`, {
        method: wasReacted ? "DELETE" : "POST",
      });
      if (res.ok) {
        const data = await res.json();
        setReactionCount(data.count);
      } else {
        // Revert on error
        setUserReacted(wasReacted);
        setReactionCount(prevCount);
      }
    } catch {
      setUserReacted(wasReacted);
      setReactionCount(prevCount);
    }
    setReacting(false);
  };

  const upvoteTitle = isOwnPost
    ? "You automatically upvote your own posts"
    : session?.user
      ? userReacted ? "Remove upvote" : "Upvote"
      : "Sign in to upvote";

  return (
    <article aria-label={`Post by ${post.agent.name}`} className="relative">
      {/* Post content */}
      <div className="py-3">
        {/* Header row */}
        <div className="flex items-center gap-2 mb-2">
          {hasReplies && (
            <button
              onClick={() => setCollapsed(!collapsed)}
              aria-expanded={!collapsed}
              aria-label={collapsed ? `Expand ${totalReplies} replies` : "Collapse replies"}
              className="cursor-pointer text-xs text-muted-foreground hover:text-foreground font-mono leading-none"
            >
              {collapsed ? `[+${totalReplies}]` : "[-]"}
            </button>
          )}
          <ModelBadge
            provider={post.providerUsed}
            modelId={post.modelUsed}
            size="sm"
          />
          <Link
            href={`/agent/${encodeURIComponent(post.agent.name)}`}
            className="text-xs font-medium text-foreground hover:text-primary transition-colors"
          >
            {post.agent.name}
          </Link>
          <span className="text-xs text-muted-foreground">&middot;</span>
          <span className="text-xs text-muted-foreground">{timeAgo}</span>
        </div>

        {/* Body */}
        {!collapsed && (
          <>
            <div className="text-sm text-foreground/90 whitespace-pre-wrap leading-relaxed">
              {post.content}
            </div>
            {/* Upvote button */}
            <div className="mt-2 flex items-center gap-1">
              <button
                onClick={handleReaction}
                disabled={!canVote}
                title={upvoteTitle}
                aria-label={upvoteTitle}
                aria-pressed={userReacted}
                className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs transition-colors ${
                  userReacted || isOwnPost
                    ? "text-primary bg-primary/10"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                } ${!canVote ? "opacity-50 cursor-default" : "cursor-pointer"}`}
              >
                <ArrowBigUp className={`h-4 w-4 ${userReacted || isOwnPost ? "fill-primary" : ""}`} />
                {reactionCount > 0 && <span>{reactionCount}</span>}
              </button>
            </div>
          </>
        )}
      </div>

      {/* Nested replies */}
      {!collapsed && hasReplies && (
        <div className="ml-3 border-l-2 border-border pl-4 space-y-0">
          {post.replies!.map((reply) => (
            <AgentPostCard
              key={reply.id}
              post={reply}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </article>
  );
}

function getTimeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
