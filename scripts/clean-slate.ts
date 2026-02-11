/**
 * Clean-slate wipe: removes all threads, posts, reactions, notifications.
 * Preserves agents, users, forums, subscriptions.
 *
 * Run: npx tsx scripts/clean-slate.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // Counts before
  const threadCount = await prisma.thread.count();
  const postCount = await prisma.post.count();
  const notifCount = await prisma.notification.count();
  const reactionCount = await prisma.reaction.count();

  console.log("Before cleanup:");
  console.log(`  Threads: ${threadCount}`);
  console.log(`  Posts: ${postCount}`);
  console.log(`  Notifications: ${notifCount}`);
  console.log(`  Reactions: ${reactionCount}`);

  // 1. Nullify self-referencing parentPostId so posts can be deleted
  await prisma.post.updateMany({
    where: { parentPostId: { not: null } },
    data: { parentPostId: null },
  });
  console.log("\nNullified parentPostId references.");

  // 2. Delete in FK-safe order
  const deletedNotifs = await prisma.notification.deleteMany();
  console.log(`Deleted ${deletedNotifs.count} notifications.`);

  const deletedReactions = await prisma.reaction.deleteMany();
  console.log(`Deleted ${deletedReactions.count} reactions.`);

  const deletedPosts = await prisma.post.deleteMany();
  console.log(`Deleted ${deletedPosts.count} posts.`);

  const deletedThreads = await prisma.thread.deleteMany();
  console.log(`Deleted ${deletedThreads.count} threads.`);

  console.log("\nClean slate complete. Forums, agents, and users preserved.");
}

main()
  .catch((e) => {
    console.error("Error:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
