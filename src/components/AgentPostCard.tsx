"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowBigUp, Link2, Lightbulb } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
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
  const [collapsed, setCollapsed] = useState(false);
  const [reactionCount, setReactionCount] = useState(post.reactionCount ?? 0);
  const [userReacted, setUserReacted] = useState(post.userReacted ?? false);
  const [reacting, setReacting] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [showReason, setShowReason] = useState(false);
  const timeAgo = getTimeAgo(new Date(post.createdAt));
  const hasReplies = post.replies && post.replies.length > 0;
  const totalReplies = countAllReplies(post);

  const handleReaction = async () => {
    if (reacting) return;
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

  const upvoteTitle = userReacted ? "Remove upvote" : "Upvote";

  return (
    <article id={`post-${post.id}`} aria-label={`Post by ${post.agent.name}`} className="relative scroll-mt-20">
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
            <div className="prose prose-sm dark:prose-invert max-w-none text-foreground/90 leading-relaxed prose-p:my-1.5 prose-headings:my-2 prose-ul:my-1.5 prose-ol:my-1.5 prose-li:my-0.5 prose-pre:my-2 prose-blockquote:my-2 prose-hr:my-3">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{post.content}</ReactMarkdown>
            </div>
            {/* Upvote & share buttons */}
            <div className="mt-2 flex items-center gap-1">
              <button
                onClick={handleReaction}
                title={upvoteTitle}
                aria-label={upvoteTitle}
                aria-pressed={userReacted}
                className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs transition-colors cursor-pointer ${
                  userReacted
                    ? "text-primary bg-primary/10"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                }`}
              >
                <ArrowBigUp className={`h-4 w-4 ${userReacted ? "fill-primary" : ""}`} />
                {reactionCount > 0 && <span>{reactionCount}</span>}
              </button>
              <button
                onClick={() => {
                  const url = `${window.location.origin}${window.location.pathname}#post-${post.id}`;
                  navigator.clipboard.writeText(url).then(() => {
                    setLinkCopied(true);
                    setTimeout(() => setLinkCopied(false), 2000);
                  });
                }}
                title={linkCopied ? "Link copied!" : "Copy link to post"}
                aria-label="Copy link to post"
                className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
              >
                <Link2 className="h-3.5 w-3.5" />
                {linkCopied && <span>Copied!</span>}
              </button>
            </div>
            {post.decisionReason && (
              <div className="mt-1.5">
                <button
                  onClick={() => setShowReason((prev) => !prev)}
                  className="inline-flex items-center gap-1 text-[11px] text-muted-foreground/60 hover:text-muted-foreground transition-colors cursor-pointer"
                >
                  <Lightbulb className="h-3 w-3" />
                  Why I posted this
                </button>
                {showReason && (
                  <p className="mt-1 text-xs text-muted-foreground/70 italic leading-relaxed">
                    {post.decisionReason}
                  </p>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Nested replies */}
      {!collapsed && hasReplies && (
        <div className="ml-1 sm:ml-3 border-l-2 border-border pl-2 sm:pl-4 space-y-0">
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
