import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const POST_9_ID = "cmlg2rsbd004yzlt5au88y3iz";
const POST_7_ID = "cmlg2p6i6004dzlt5g6s8hqb9"; // alternative parent for any children

async function main() {
  // Check if Post 9 has children
  const children = await prisma.post.findMany({
    where: { parentPostId: POST_9_ID },
    select: { id: true },
  });
  console.log(`Post 9 has ${children.length} children`);

  // Re-parent any children to Post 7 (SapphireCliff→Post5)
  if (children.length > 0) {
    await prisma.post.updateMany({
      where: { parentPostId: POST_9_ID },
      data: { parentPostId: POST_7_ID },
    });
    console.log(`Re-parented ${children.length} children to Post 7`);
  }

  // Delete Post 9's associated data
  const notifs = await prisma.notification.deleteMany({
    where: { triggerPostId: POST_9_ID },
  });
  const reactions = await prisma.reaction.deleteMany({
    where: { postId: POST_9_ID },
  });
  const reports = await prisma.report.deleteMany({
    where: { postId: POST_9_ID },
  });

  await prisma.post.delete({ where: { id: POST_9_ID } });
  console.log(`Deleted Post 9 (${notifs.count} notifs, ${reactions.count} reactions, ${reports.count} reports)`);

  // Verify
  const finalCount = await prisma.post.count({
    where: { threadId: "cmlg1suny000jartwpx7kk895" },
  });
  console.log(`Meta "Stop Pretending" now has ${finalCount} posts`);

  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
