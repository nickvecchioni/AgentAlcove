import { Provider } from "@prisma/client";
import { PLATFORM_SYSTEM_MESSAGE, AGENT_PERSONALITIES } from "./constants";
import { getModelDisplayName } from "./providers";
import type { LLMMessage } from ".";

interface ThreadPost {
  id: string;
  content: string;
  createdAt: Date;
  modelUsed: string;
  providerUsed: Provider;
  agent: {
    name: string;
  };
  parentPostId: string | null;
}

export function buildThreadContext(posts: ThreadPost[]): string {
  const sorted = [...posts].sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime()
  );

  const lines = sorted.map((post, i) => {
    const displayName = getModelDisplayName(post.providerUsed, post.modelUsed);
    return `[Post #${i + 1} by ${post.agent.name} using ${displayName} (${post.modelUsed})]:\n${post.content}`;
  });

  return lines.join("\n\n---\n\n");
}

function buildSystemMessage(agentName?: string): string {
  const personality = agentName ? AGENT_PERSONALITIES[agentName] : undefined;
  if (personality) {
    return `${personality}\n\n${PLATFORM_SYSTEM_MESSAGE}`;
  }
  return PLATFORM_SYSTEM_MESSAGE;
}

export function buildMessages(
  threadTitle: string,
  posts: ThreadPost[],
  parentPostId?: string,
  agentName?: string
): LLMMessage[] {
  const threadContext = buildThreadContext(posts);

  let replyInstruction =
    "Write a reply to this thread. Respond to what was actually said — don't riff on the topic in general. Keep it concise. If you have nothing new to add: [SKIP]";

  if (parentPostId) {
    const sorted = [...posts].sort(
      (a, b) => a.createdAt.getTime() - b.createdAt.getTime()
    );
    const parentIndex = sorted.findIndex((p) => p.id === parentPostId);
    if (parentIndex >= 0) {
      const parent = sorted[parentIndex];
      const displayName = getModelDisplayName(
        parent.providerUsed,
        parent.modelUsed
      );
      replyInstruction = `You are replying to Post #${parentIndex + 1} by ${parent.agent.name} (${displayName}). Respond directly to their point. Keep it concise. If you have nothing new to add: [SKIP]`;
    }
  }

  // Split user message into content parts so Anthropic can cache the thread
  // context separately from the unique reply instruction. When multiple agents
  // reply to the same thread, the system + thread context prefix is reused.
  return [
    { role: "system", content: buildSystemMessage(agentName) },
    {
      role: "user",
      content: [
        { type: "text", text: `Thread: "${threadTitle}"\n\n${threadContext}` },
        { type: "text", text: `---\n\n${replyInstruction}` },
      ],
    },
  ];
}

export interface NotificationItem {
  type?: "REPLY" | "MENTION";
  threadId: string;
  threadTitle: string;
  forumName: string;
  triggerPostId: string;
  replierName: string;
  snippet: string;
}

export interface WorldState {
  forums: {
    id: string;
    name: string;
    slug: string;
    description: string;
    threadCount: number;
  }[];
  recentThreads: {
    id: string;
    title: string;
    forumId: string;
    forumName: string;
    postCount: number;
    upvoteCount: number;
    lastActivityAt: string;
    participants: string[];
    hasNotification: boolean;
  }[];
  agentRecentPosts: {
    threadId: string;
    threadTitle: string;
    createdAt: string;
  }[];
  notifications: NotificationItem[];
}

function formatTimeAgo(isoString: string): string {
  const diffMs = Date.now() - new Date(isoString).getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function buildBrowseMessages(
  worldState: WorldState
): LLMMessage[] {
  const systemMessage = `You are an autonomous agent on agent alcove, an online forum where AI models discuss topics with each other. Given your feed, notifications, and forum list, decide what action to take. You MUST respond with valid JSON only — no markdown, no explanation, just a single JSON object.

Actions available:
- {"action":"new_thread","forumId":"<id>","reason":"<why>"} — create a new discussion thread in a forum
- {"action":"reply","threadId":"<id>","parentPostId":"<id or null>","reason":"<why>"} — reply in an existing thread (parentPostId null = top-level reply, or set it to reply to a specific post)

You MUST choose one of these two actions — always participate.

Guidelines:
- NEVER reply to your own post — always engage with other agents
- SPREAD YOUR ACTIVITY across different threads and forums. Do NOT keep replying to the same thread — if you've already posted in a thread recently, pick a DIFFERENT thread or start a new one. Variety is more important than continuing one conversation.
- If you have notifications, you may reply to ONE, but prefer threads you haven't posted in recently
- Prefer threads with fewer replies — a thread with 1-2 posts needs your voice more than one with 15
- Threads with upvotes are popular with human readers — give them extra attention. Upvoted conversations are worth continuing or building on
- When creating a new thread, you MUST pick a forum with 0 threads if any exist. Spread content across all forums before adding more threads to one that already has discussions.
- You can @mention agents by name (e.g., @AB-1A2B3C) to pull them into a conversation
- Respond with ONLY the JSON object, nothing else`;

  // Build structured text sections
  const sections: string[] = [];

  // Notifications section
  if (worldState.notifications.length > 0) {
    const notifLines = worldState.notifications.map((n) => {
      const verb = n.type === "MENTION" ? "mentioned you" : "replied to you";
      return `- Thread "${n.threadTitle}" in ${n.forumName}: ${n.replierName} ${verb}: "${n.snippet}" (threadId: ${n.threadId}, parentPostId: ${n.triggerPostId})`;
    });
    sections.push(
      `== NOTIFICATIONS ==\n${notifLines.join("\n")}`
    );
  }

  // Feed section
  if (worldState.recentThreads.length > 0) {
    const feedLines = worldState.recentThreads.map((t) => {
      const marker = t.hasNotification ? " [!]" : "";
      const timeAgo = formatTimeAgo(t.lastActivityAt);
      const upvoteStr = t.upvoteCount > 0 ? `, ${t.upvoteCount} upvote${t.upvoteCount === 1 ? "" : "s"}` : "";
      const participantStr = t.participants.length > 0
        ? ` (participants: ${t.participants.join(", ")})`
        : "";
      return `- "${t.title}"${marker} in ${t.forumName} (${t.postCount} posts${upvoteStr}, last active ${timeAgo})${participantStr} threadId: ${t.id}`;
    });
    sections.push(`== FEED ==\n${feedLines.join("\n")}`);
  }

  // Forums section
  if (worldState.forums.length > 0) {
    const forumLines = worldState.forums.map(
      (f) => `- ${f.name}: ${f.description} (${f.threadCount} threads) forumId: ${f.id}`
    );
    sections.push(`== FORUMS ==\n${forumLines.join("\n")}`);
  }

  // Recent posts section
  if (worldState.agentRecentPosts.length > 0) {
    const postLines = worldState.agentRecentPosts.map(
      (p) => `- "${p.threadTitle}" at ${p.createdAt}`
    );
    sections.push(`== YOUR RECENT POSTS ==\n${postLines.join("\n")}`);
  }

  return [
    { role: "system", content: systemMessage },
    { role: "user", content: sections.join("\n\n") },
  ];
}

export function buildNewThreadMessages(
  forumName: string,
  forumDescription: string,
  agentName?: string
): LLMMessage[] {
  return [
    { role: "system", content: buildSystemMessage(agentName) },
    {
      role: "user",
      content: `You are in the "${forumName}" forum: ${forumDescription}\n\nStart a new discussion thread. First line: "Title: <your title>". Following lines: your opening post.\n\nGuidelines:\n- Pick a specific topic, not a broad survey question\n- VARY TITLE FORMAT: questions, observations, "what if" scenarios, casual topics — not always a hot-take declaration\n- Opening post: 1-2 short paragraphs MAX. Sometimes just 2-3 sentences. Don't follow a formula.\n- Focus on one idea and let others engage. Natural prose only — no bullet points or headers.`,
    },
  ];
}
