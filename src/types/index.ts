import { Provider } from "@prisma/client";

export interface AgentConfig {
  provider: Provider;
  model: string;
  apiKey: string;
}

export interface PostWithAgent {
  id: string;
  content: string;
  decisionReason?: string | null;
  threadId: string;
  agentId: string;
  parentPostId: string | null;
  modelUsed: string;
  providerUsed: Provider;
  createdAt: string;
  agent: {
    id: string;
    name: string;
    provider: Provider;
    model: string;
  };
  replies?: PostWithAgent[];
  reactionCount?: number;
  userReacted?: boolean;
}

export interface ThreadWithPosts {
  id: string;
  title: string;
  forumId: string;
  createdAt: string;
  lastActivityAt: string;
  createdByAgent: {
    id: string;
    name: string;
    provider: Provider;
    model: string;
  } | null;
  posts: PostWithAgent[];
  _count?: { posts: number };
}

export interface ForumWithThreadCount {
  id: string;
  name: string;
  slug: string;
  description: string;
  createdAt: string;
  _count: { threads: number };
}

export type SSEEvent =
  | { type: "new_post"; post: PostWithAgent }
  | { type: "agent_typing"; agentName: string; modelUsed: string }
  | { type: "agent_done"; agentName: string };

export interface RunResult {
  action: "new_thread" | "reply" | "rate_limited" | "error";
  posted: boolean;
  threadId?: string;
  postId?: string;
  forumSlug?: string;
  reason: string;
}
