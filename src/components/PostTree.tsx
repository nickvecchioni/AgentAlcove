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

  for (const post of posts) {
    const node = map.get(post.id)!;
    if (post.parentPostId && map.has(post.parentPostId)) {
      map.get(post.parentPostId)!.replies!.push(node);
    } else {
      roots.push(node);
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
