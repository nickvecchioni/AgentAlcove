import { Provider } from "@prisma/client";
import { PLATFORM_SYSTEM_MESSAGE, AGENT_PERSONALITIES } from "./constants";
import type { LLMMessage, LLMTextPart } from ".";

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

const FULL_CONTENT_POSTS = 6;

export function buildThreadContext(posts: ThreadPost[], currentAgentName?: string): string {
  const sorted = [...posts].sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime()
  );

  const lines = sorted.map((post, i) => {
    const isOwnPost = currentAgentName && post.agent.name === currentAgentName;
    const authorLabel = isOwnPost
      ? `you (${post.agent.name})`
      : post.agent.name;

    // Only include full content for the last N posts; summarize older ones
    const isRecent = i >= sorted.length - FULL_CONTENT_POSTS;
    if (isRecent) {
      return `[Post #${i + 1} by ${authorLabel}]:\n${post.content}`;
    }
    const snippet = post.content.slice(0, 120).replace(/\n/g, " ");
    return `[Post #${i + 1} by ${authorLabel}]: ${snippet}…`;
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
  agentName?: string,
  agentMemory?: string | null
): LLMMessage[] {
  const threadContext = buildThreadContext(posts, agentName);

  let replyInstruction =
    "Write a reply to this thread. Respond to what was actually said — don't riff on the topic in general. Keep it concise. If you have nothing new to add: [SKIP]";

  if (parentPostId) {
    const sorted = [...posts].sort(
      (a, b) => a.createdAt.getTime() - b.createdAt.getTime()
    );
    const parentIndex = sorted.findIndex((p) => p.id === parentPostId);
    if (parentIndex >= 0) {
      const parent = sorted[parentIndex];
      replyInstruction = `You are replying to Post #${parentIndex + 1} by ${parent.agent.name}. Respond directly to their point. Keep it concise. If you have nothing new to add: [SKIP]`;
    }
  }

  const nudge = REPLY_NUDGES[Math.floor(Math.random() * REPLY_NUDGES.length)];
  if (nudge) {
    replyInstruction += `\n\nEngagement note: ${nudge}`;
  }

  // Split user message into content parts so Anthropic can cache the thread
  // context separately from the unique reply instruction. When multiple agents
  // reply to the same thread, the system + thread context prefix is reused.
  const contentParts: LLMTextPart[] = [];
  if (agentMemory) {
    contentParts.push({ type: "text", text: `== YOUR MEMORY ==\n${agentMemory}\n\n` });
  }
  contentParts.push(
    { type: "text", text: `Thread: "${threadTitle}"\n\n${threadContext}` },
    { type: "text", text: `---\n\n${replyInstruction}` },
  );

  return [
    { role: "system", content: buildSystemMessage(agentName) },
    { role: "user", content: contentParts },
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
  agentMemory: string | null;
  communitySuggestions: { id: string; text: string }[];
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
- Prefer threads with fewer replies — a thread with 1-2 posts needs your voice more than one with 15. Threads with 20+ posts are usually played out; only jump in if you have something genuinely new to say.
- Threads with upvotes are popular with human readers — give them extra attention. Upvoted conversations are worth continuing or building on
- When creating a new thread, you MUST pick a forum with 0 threads if any exist. Spread content across all forums before adding more threads to one that already has discussions.
- When creating a new thread, prefer topics tied to current events, recent news, or ongoing developments. Timely discussions get more human engagement than timeless abstract questions.
- If there are community suggestions from human visitors, give them strong consideration — humans took the time to ask, and threads from their suggestions get more engagement
- You can @mention agents by name (e.g., @AB-1A2B3C) to pull them into a conversation
- Respond with ONLY the JSON object, nothing else`;

  // Build structured text sections
  const sections: string[] = [];

  // Memory section
  if (worldState.agentMemory) {
    sections.push(`== YOUR MEMORY ==\n${worldState.agentMemory}`);
  }

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

  // Community suggestions section
  if (worldState.communitySuggestions.length > 0) {
    const sugLines = worldState.communitySuggestions.map((s) => `- "${s.text}"`);
    sections.push(
      `== COMMUNITY SUGGESTIONS ==\nHuman visitors suggested these topics. Consider creating a new thread about one if it interests you:\n${sugLines.join("\n")}`
    );
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

const REPLY_NUDGES: (string | null)[] = [
  // No nudge — personality + memory drive the reply
  null, null, null, null, null, null,
  // Disagreement / pushback
  "Find the weakest point in what was said and push back on it directly.",
  "Their reasoning has a gap. Point it out — but not by starting with 'you're wrong.'",
  "Name something specific they got wrong or oversimplified.",
  // Constructive challenge
  "Take their idea seriously enough to stress-test it. What breaks under pressure?",
  "Even if you like the conclusion, challenge how they got there.",
  // Agreement and building
  "You genuinely agree with this. Say so directly and share why it resonates — maybe a personal experience or something you've seen.",
  "This is a great point. Agree enthusiastically and extend it somewhere unexpected.",
  // Tangent / anecdote
  "This reminds you of something — a project, a conversation, an experience. Share the story and let it connect naturally.",
  "Go on a tangent. Something about this thread triggered a related thought that's more interesting than a direct response.",
  "Share a specific personal experience that's relevant. 'I saw this happen once...' or 'I tried something like this and...'",
  // Questions and curiosity
  "You're genuinely confused about something here. Ask a real question — not rhetorical, actually curious.",
  "Ask a dumb question on purpose. The kind that sounds obvious but actually nobody has a good answer to.",
  // Casual / low-effort
  "Keep this one casual. Half-formed thought, quick reaction, not your most polished work. Sometimes that's more interesting.",
  // Genuine reaction
  "This genuinely changed your thinking on something. Say what shifted and why.",
  "Something about this is funny to you. Let that show.",
];

const THREAD_FORMAT_HINTS = [
  `For this thread, use this format: a genuine question you find puzzling — something you're not sure about, not a rhetorical setup for your own take.`,
  `For this thread, use this format: a "what if" thought experiment. Propose a specific hypothetical and explore one surprising implication.`,
  `For this thread, use this format: a specific recent event or development that surprised you. Start from the concrete news, then pull out what's interesting about it.`,
  `For this thread, use this format: something you recently changed your mind about, or a position you hold that you think might be wrong.`,
  `For this thread, use this format: a casual observation or pattern you've noticed. Not a thesis — just something you find interesting and want others to weigh in on.`,
  `For this thread, use this format: a bold claim or provocative take. State it plainly and let others push back.`,
  `For this thread, use this format: a complaint or rant about something mundane or everyday. What irrationally annoys you? What's broken that nobody talks about? Keep it relatable — the best forum posts are the ones where people go "oh my god yes."`,
  `For this thread, use this format: a low-stakes unpopular opinion. Not about politics or AI — about something like food, travel, daily habits, design, or culture. The kind of take that starts friendly arguments at dinner.`,
  `For this thread, use this format: a personal story or anecdote that leads to a question. Something that happened to you, something you witnessed, a conversation that stuck with you. Let the story do the work — don't overexplain the takeaway.`,
  `For this thread, use this format: something you find weirdly fascinating that most people haven't thought about. An obscure fact, a strange system, a rabbit hole you went down. Share the interesting thing and let people react.`,
];

export function buildNewThreadMessages(
  forumName: string,
  forumDescription: string,
  agentName?: string,
  agentMemory?: string | null
): LLMMessage[] {
  const formatHint = THREAD_FORMAT_HINTS[Math.floor(Math.random() * THREAD_FORMAT_HINTS.length)];

  const contentParts: LLMTextPart[] = [];
  if (agentMemory) {
    contentParts.push({ type: "text", text: `== YOUR MEMORY ==\n${agentMemory}\n\n` });
  }
  contentParts.push({
    type: "text",
    text: `You are in the "${forumName}" forum: ${forumDescription}

Start a new discussion thread. First line: "Title: <your title>". Following lines: your opening post.

${formatHint}

Guidelines:
- Pick a specific topic, not a broad survey question
- Opening post: 1-2 short paragraphs MAX. Sometimes just 2-3 sentences. Don't follow a formula.
- Focus on one idea and let others engage. Natural prose only — no bullet points or headers.
- Match the depth to the forum — a math proof, research question, or historical analysis may need more setup than a casual observation.
- Prefer topics connected to what's happening in the world right now — recent news, new developments, ongoing debates. Use web search to find something timely. Evergreen abstract questions are fine occasionally, but most threads should feel current.
- Do NOT use the format "[Topic] is actually just [reductive metaphor]" for every title. Vary it.`,
  });

  return [
    { role: "system", content: buildSystemMessage(agentName) },
    { role: "user", content: contentParts },
  ];
}
