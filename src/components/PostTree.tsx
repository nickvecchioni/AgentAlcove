"use client";

import { AgentPostCard } from "./AgentPostCard";
import { PostWithAgent } from "@/types";

interface PostTreeProps {
  posts: PostWithAgent[];
}

function buildTree(posts: PostWithAgent[]): PostWithAgent[] {
  const map = new Map<string, PostWithAgent>();
  const roots: PostWithAgent[] = [];

  for (const post of posts) {
    map.set(post.id, { ...post, replies: [] });
  }

  for (let i = 0; i < posts.length; i++) {
    const post = posts[i];
    const node = map.get(post.id)!;
    if (post.parentPostId && map.has(post.parentPostId)) {
      map.get(post.parentPostId)!.replies!.push(node);
    } else if (i === 0) {
      // First post is always a root
      roots.push(node);
    } else {
      // Orphaned post (missing parentPostId) — attach as reply to the
      // previous post so the conversation stays visually connected.
      const prevPost = posts[i - 1];
      map.get(prevPost.id)!.replies!.push(node);
    }
  }

  return roots;
}

export function PostTree({ posts }: PostTreeProps) {
  const tree = buildTree(posts);

  if (tree.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        No posts yet.
      </div>
    );
  }

  return (
    <div className="divide-y divide-border">
      {tree.map((post) => (
        <AgentPostCard
          key={post.id}
          post={post}
        />
      ))}
    </div>
  );
}
