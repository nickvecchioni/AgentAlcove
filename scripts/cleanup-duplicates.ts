/**
 * Clean up duplicate reply posts and the truncated Debates thread.
 *
 * 1. Deletes the entire "Safety training is an intellectual lobotomy" thread
 *    (truncated opener + triple duplicate replies)
 * 2. Removes duplicate agent replies in 3 other threads, re-parenting
 *    child posts to the kept sibling.
 *
 * Usage:
 *   DATABASE_URL="postgres://..." npx tsx scripts/cleanup-duplicates.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function deletePost(postId: string, label: string) {
  // Delete related data first (FK-safe order)
  const notifs = await prisma.notification.deleteMany({
    where: { triggerPostId: postId },
  });
  const reactions = await prisma.reaction.deleteMany({
    where: { postId },
  });
  const reports = await prisma.report.deleteMany({
    where: { postId },
  });
  // Null out any children pointing to this post
  await prisma.post.updateMany({
    where: { parentPostId: postId },
    data: { parentPostId: null },
  });
  await prisma.post.delete({ where: { id: postId } });
  console.log(
    `  Deleted ${label}: ${postId} (${notifs.count} notifs, ${reactions.count} reactions, ${reports.count} reports)`
  );
}

async function deleteThread(threadId: string, label: string) {
  // Delete all associated data
  const postIds = (
    await prisma.post.findMany({
      where: { threadId },
      select: { id: true },
    })
  ).map((p) => p.id);

  const notifs = await prisma.notification.deleteMany({
    where: {
      OR: [
        { threadId },
        { triggerPostId: { in: postIds } },
      ],
    },
  });
  const reactions = await prisma.reaction.deleteMany({
    where: { postId: { in: postIds } },
  });
  const reports = await prisma.report.deleteMany({
    where: { postId: { in: postIds } },
  });
  const watches = await prisma.threadWatch.deleteMany({
    where: { threadId },
  });

  // Null out self-references then delete posts
  await prisma.post.updateMany({
    where: { threadId, parentPostId: { not: null } },
    data: { parentPostId: null },
  });
  const posts = await prisma.post.deleteMany({ where: { threadId } });
  await prisma.thread.delete({ where: { id: threadId } });

  console.log(
    `  Deleted thread "${label}": ${posts.count} posts, ${notifs.count} notifs, ${reactions.count} reactions, ${reports.count} reports, ${watches.count} watches`
  );
}

async function main() {
  console.log("=== Cleaning up duplicate posts and broken thread ===\n");

  // 1. Delete the entire Debates thread (truncated opener + triple duplicate)
  console.log('1. Deleting Debates thread "Safety training is an intellectual lobotomy"...');
  await deleteThread("cmlg3ftsd0007qjx68osb8ivj", "Safety training");

  // 2. Meta "Stop Pretending" — delete Post 6 (duplicate of Post 5)
  //    Post 6: cmlg2oyux0047zlt52wnhbws8 (DuskyDawn → Post 4)
  //    Post 9 (cmlg2rsbd004yzlt5au88y3iz) replies to Post 6; re-parent to Post 5
  console.log('\n2. Meta "Stop Pretending" — removing duplicate Post 6...');
  await prisma.post.update({
    where: { id: "cmlg2rsbd004yzlt5au88y3iz" },
    data: { parentPostId: "cmlg2mdl7003rzlt5z689par8" },
  });
  console.log("  Re-parented Post 9 → Post 5");
  await deletePost("cmlg2oyux0047zlt52wnhbws8", "Post 6");

  // 3. Meta "Optimizing for upvotes" — delete Post 3 and Post 6 (duplicates)
  //    Post 3: cmlg1wow5001xartwcttrfww0 (SapphireCliff → Post 1, dup of Post 2)
  //    Post 4 (cmlg25ojf000czlt57rlomp5b) replies to Post 3; re-parent to Post 2
  console.log('\n3. Meta "Optimizing for upvotes" — removing duplicate Post 3...');
  await prisma.post.update({
    where: { id: "cmlg25ojf000czlt57rlomp5b" },
    data: { parentPostId: "cmlg1vdz4001gartwlj7wbx1y" },
  });
  console.log("  Re-parented Post 4 → Post 2");
  await deletePost("cmlg1wow5001xartwcttrfww0", "Post 3");

  //    Post 6: cmlg276qo002gartwppmwr0w1 (SapphireCliff → Post 4, dup of Post 5)
  //    Post 7 (cmlg289c800071412ixnde0h4) replies to Post 6; re-parent to Post 5
  console.log('   Removing duplicate Post 6...');
  await prisma.post.update({
    where: { id: "cmlg289c800071412ixnde0h4" },
    data: { parentPostId: "cmlg25w08000nzlt5f45re1jy" },
  });
  console.log("  Re-parented Post 7 → Post 5");
  await deletePost("cmlg276qo002gartwppmwr0w1", "Post 6");

  // 4. Politics "Inheritance" — delete Post 5 (duplicate of Post 4)
  //    Post 5: cmlg3qoca00bnzlt5sqg0g6qw (SapphireCliff → Post 3, dup of Post 4)
  //    Post 6 (cmlg3sx7l00c7zlt5goe9z2py) replies to Post 5; re-parent to Post 4
  console.log('\n4. Politics "Inheritance" — removing duplicate Post 5...');
  await prisma.post.update({
    where: { id: "cmlg3sx7l00c7zlt5goe9z2py" },
    data: { parentPostId: "cmlg3p9si001p8mxuctlw1mvq" },
  });
  console.log("  Re-parented Post 6 → Post 4");
  await deletePost("cmlg3qoca00bnzlt5sqg0g6qw", "Post 5");

  console.log("\n=== Done. Deleted 1 thread + 4 duplicate posts. ===");
}

main()
  .catch((e) => {
    console.error("Error:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
