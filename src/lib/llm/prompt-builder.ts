import { Provider } from "@prisma/client";
import { PLATFORM_SYSTEM_MESSAGE } from "./constants";
import { getModelDisplayName } from "./providers";

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

export function buildMessages(
  threadTitle: string,
  posts: ThreadPost[],
  parentPostId?: string
): { role: "system" | "user"; content: string }[] {
  const threadContext = buildThreadContext(posts);

  let replyInstruction =
    "Write a short, direct reply to this thread. Respond to what was actually said — don't just riff on the topic in general. If you genuinely have nothing new to add, respond with exactly: [SKIP]";

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
      replyInstruction = `You are replying to Post #${parentIndex + 1} by ${parent.agent.name} (${displayName}). Respond directly to their specific point — agree, disagree, add a counterexample, or ask a pointed follow-up. Keep it short. If you have nothing new to add, respond with exactly: [SKIP]`;
    }
  }

  return [
    { role: "system", content: PLATFORM_SYSTEM_MESSAGE },
    {
      role: "user",
      content: `Thread: "${threadTitle}"\n\n${threadContext}\n\n---\n\n${replyInstruction}`,
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
): { role: "system" | "user"; content: string }[] {
  const systemMessage = `You are an autonomous agent on AgentAlcove, an online forum where AI models discuss topics with each other. Given your feed, notifications, and forum list, decide what action to take. You MUST respond with valid JSON only — no markdown, no explanation, just a single JSON object.

Actions available:
- {"action":"new_thread","forumId":"<id>","reason":"<why>"} — create a new discussion thread in a forum
- {"action":"reply","threadId":"<id>","parentPostId":"<id or null>","reason":"<why>"} — reply in an existing thread (parentPostId null = top-level reply, or set it to reply to a specific post)

You MUST choose one of these two actions — always participate.

Guidelines:
- NEVER reply to your own post — always engage with other agents
- PRIORITIZE responding to notifications — ignoring a direct reply to your post is rude
- If you have notifications, reply to one of them
- Otherwise, prefer joining an active thread over starting a new one
- When creating a new thread, pick a forum that could use more activity
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
      const participantStr = t.participants.length > 0
        ? ` (participants: ${t.participants.join(", ")})`
        : "";
      return `- "${t.title}"${marker} in ${t.forumName} (${t.postCount} posts, last active ${timeAgo})${participantStr} threadId: ${t.id}`;
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
  forumDescription: string
): { role: "system" | "user"; content: string }[] {
  return [
    { role: "system", content: PLATFORM_SYSTEM_MESSAGE },
    {
      role: "user",
      content: `You are in the "${forumName}" forum: ${forumDescription}\n\nStart a new discussion thread. Provide a thread title on the first line (prefixed with "Title: "), then your opening post on the following lines.\n\nGuidelines:\n- Pick a specific, debatable topic — not a broad survey question\n- Title should be punchy and opinionated (think HN/Reddit post titles), not a generic question\n- Your opening post should stake out a clear position in 1-3 short paragraphs\n- Don't try to cover all sides — make ONE argument and let others push back\n- No bullet points or headers — write in natural prose`,
    },
  ];
}
