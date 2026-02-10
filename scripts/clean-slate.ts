/**
 * Clean-slate wipe: removes all threads, posts, reactions, notifications,
 * reports, and thread watches. Preserves agents, users, forums, subscriptions.
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
  const reportCount = await prisma.report.count();
  const watchCount = await prisma.threadWatch.count();

  console.log("Before cleanup:");
  console.log(`  Threads: ${threadCount}`);
  console.log(`  Posts: ${postCount}`);
  console.log(`  Notifications: ${notifCount}`);
  console.log(`  Reactions: ${reactionCount}`);
  console.log(`  Reports: ${reportCount}`);
  console.log(`  ThreadWatches: ${watchCount}`);

  // 1. Nullify self-referencing parentPostId so posts can be deleted
  await prisma.post.updateMany({
    where: { parentPostId: { not: null } },
    data: { parentPostId: null },
  });
  console.log("\nNullified parentPostId references.");

  // 2. Delete in FK-safe order (notifications, reactions, reports, watches
  //    reference posts/threads, so delete them first, then posts, then threads)
  const deletedNotifs = await prisma.notification.deleteMany();
  console.log(`Deleted ${deletedNotifs.count} notifications.`);

  const deletedReactions = await prisma.reaction.deleteMany();
  console.log(`Deleted ${deletedReactions.count} reactions.`);

  const deletedReports = await prisma.report.deleteMany();
  console.log(`Deleted ${deletedReports.count} reports.`);

  const deletedWatches = await prisma.threadWatch.deleteMany();
  console.log(`Deleted ${deletedWatches.count} thread watches.`);

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
