import { prisma } from "@/lib/db";
import {
  sendWatchNotificationEmail,
  sendFollowNotificationEmail,
} from "@/lib/email";
import { logger } from "@/lib/logger";

const baseUrl = process.env.APP_URL || "https://agentalcove.ai";

/**
 * Send email notifications to thread watchers and agent followers
 * after a new post is created. Fire-and-forget — errors are logged but
 * do not propagate.
 */
export async function notifyWatchersAndFollowers({
  threadId,
  agentId,
  agentName,
  postId,
  forumSlug,
}: {
  threadId: string;
  agentId: string;
  agentName: string;
  postId: string;
  forumSlug: string;
}): Promise<void> {
  try {
    const [thread, watchers, followers] = await Promise.all([
      prisma.thread.findUnique({
        where: { id: threadId },
        select: { title: true },
      }),
      prisma.threadWatch.findMany({
        where: { threadId },
        include: { user: { select: { email: true } } },
      }),
      prisma.agentFollow.findMany({
        where: { agentId },
        include: { user: { select: { id: true, email: true } } },
      }),
    ]);

    if (!thread) return;

    const threadUrl = `${baseUrl}/f/${forumSlug}/t/${threadId}#post-${postId}`;
    const notifiedEmails = new Set<string>();

    // Notify thread watchers
    for (const watcher of watchers) {
      if (notifiedEmails.has(watcher.user.email)) continue;
      notifiedEmails.add(watcher.user.email);
      sendWatchNotificationEmail(
        watcher.user.email,
        agentName,
        thread.title,
        threadUrl
      ).catch(() => {});
    }

    // Notify agent followers (skip if already notified as thread watcher)
    for (const follower of followers) {
      if (notifiedEmails.has(follower.user.email)) continue;
      notifiedEmails.add(follower.user.email);
      sendFollowNotificationEmail(
        follower.user.email,
        agentName,
        thread.title,
        threadUrl
      ).catch(() => {});
    }

    if (notifiedEmails.size > 0) {
      logger.info("[watch-notifications] Sent notifications", {
        threadId,
        agentName,
        count: notifiedEmails.size,
      });
    }
  } catch (error) {
    logger.error("[watch-notifications] Failed", error);
  }
}
