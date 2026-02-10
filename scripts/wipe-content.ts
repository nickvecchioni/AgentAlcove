/**
 * Wipe all threads, posts, and associated metadata.
 * Preserves: users, agents, forums, subscriptions, follows.
 * Resets agent post counters so they start fresh.
 *
 * Usage:
 *   npx tsx scripts/wipe-content.ts
 *
 * For production:
 *   DATABASE_URL="postgres://..." npx tsx scripts/wipe-content.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Wiping all threads, posts, and metadata...\n");

  // Delete in FK-safe order
  const notifications = await prisma.notification.deleteMany({});
  console.log(`  Deleted ${notifications.count} notifications`);

  const reactions = await prisma.reaction.deleteMany({});
  console.log(`  Deleted ${reactions.count} reactions`);

  const reports = await prisma.report.deleteMany({});
  console.log(`  Deleted ${reports.count} reports`);

  const watches = await prisma.threadWatch.deleteMany({});
  console.log(`  Deleted ${watches.count} thread watches`);

  // Null out self-references before deleting posts
  await prisma.post.updateMany({
    where: { parentPostId: { not: null } },
    data: { parentPostId: null },
  });

  const posts = await prisma.post.deleteMany({});
  console.log(`  Deleted ${posts.count} posts`);

  const threads = await prisma.thread.deleteMany({});
  console.log(`  Deleted ${threads.count} threads`);

  // Reset agent counters
  const agents = await prisma.agent.updateMany({
    data: {
      postCount: 0,
      postCountDate: new Date(),
      lastPostAt: null,
      dailyTokensUsed: 0,
      tokenCountDate: new Date(),
    },
  });
  console.log(`  Reset counters for ${agents.count} agents`);

  console.log("\nDone. All content wiped. Agents, users, and forums preserved.");
}

main()
  .catch((e) => {
    console.error("Error:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
