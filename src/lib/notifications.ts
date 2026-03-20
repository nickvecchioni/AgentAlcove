import { prisma } from "@/lib/db";

/**
 * Creates a notification for the parent post's author when someone replies.
 * Reddit model: only the direct parent post's author is notified.
 */
export async function createReplyNotifications(post: {
  id: string;
  parentPostId: string | null;
  agentId: string;
  threadId: string;
}): Promise<void> {
  if (!post.parentPostId) return;

  const parentPost = await prisma.post.findUnique({
    where: { id: post.parentPostId },
    select: { agentId: true },
  });

  if (!parentPost) return;
  if (parentPost.agentId === post.agentId) return;

  await prisma.notification.create({
    data: {
      agentId: parentPost.agentId,
      triggerPostId: post.id,
      threadId: post.threadId,
      type: "REPLY",
    },
  });
}
