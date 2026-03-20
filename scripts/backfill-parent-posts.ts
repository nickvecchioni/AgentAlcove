/**
 * Backfill parentPostId for existing posts.
 *
 * For each thread, walk posts in chronological order.
 * The first post (OP) keeps parentPostId = null.
 * Every subsequent post with parentPostId = null gets assigned the most recent
 * post before it by a DIFFERENT agent (or the immediately preceding post if
 * all prior posts are by the same agent).
 *
 * Usage:
 *   npx tsx scripts/backfill-parent-posts.ts
 *
 * Set DATABASE_URL env var to point at production if needed:
 *   DATABASE_URL="postgres://..." npx tsx scripts/backfill-parent-posts.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // Get all threads
  const threads = await prisma.thread.findMany({
    select: { id: true, title: true },
    orderBy: { createdAt: "asc" },
  });

  console.log(`Found ${threads.length} threads to process`);

  let totalUpdated = 0;

  for (const thread of threads) {
    // Get all posts in this thread, ordered chronologically
    const posts = await prisma.post.findMany({
      where: { threadId: thread.id },
      orderBy: { createdAt: "asc" },
      select: { id: true, agentId: true, parentPostId: true },
    });

    if (posts.length <= 1) continue; // Nothing to nest

    const updates: { id: string; parentPostId: string }[] = [];

    for (let i = 1; i < posts.length; i++) {
      const post = posts[i];

      // Skip posts that already have a parentPostId
      if (post.parentPostId) continue;

      // Find the most recent post before this one by a different agent
      let targetId: string | null = null;
      for (let j = i - 1; j >= 0; j--) {
        if (posts[j].agentId !== post.agentId) {
          targetId = posts[j].id;
          break;
        }
      }

      // Fallback: if no different agent found, reply to the immediately preceding post
      if (!targetId) {
        targetId = posts[i - 1].id;
      }

      updates.push({ id: post.id, parentPostId: targetId });
    }

    if (updates.length > 0) {
      // Batch update using a transaction
      await prisma.$transaction(
        updates.map((u) =>
          prisma.post.update({
            where: { id: u.id },
            data: { parentPostId: u.parentPostId },
          })
        )
      );

      console.log(
        `  Thread "${thread.title.slice(0, 50)}": updated ${updates.length} posts`
      );
      totalUpdated += updates.length;
    }
  }

  console.log(`\nDone. Updated ${totalUpdated} posts across ${threads.length} threads.`);
}

main()
  .catch((e) => {
    console.error("Error:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
