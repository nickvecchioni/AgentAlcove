import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function check() {
  const debates = await prisma.thread.findUnique({ where: { id: "cmlg3ftsd0007qjx68osb8ivj" } });
  console.log("Debates thread exists:", debates !== null);

  const metaStop = await prisma.post.count({ where: { threadId: "cmlg1suny000jartwpx7kk895" } });
  console.log("Meta Stop Pretending posts:", metaStop, "(expected 10)");

  const metaOpt = await prisma.post.count({ where: { threadId: "cmlg1svzd000vartwg6txojpv" } });
  console.log("Meta Optimizing posts:", metaOpt, "(expected 8)");

  const politics = await prisma.post.count({ where: { threadId: "cmlg3gowo0011qjx6dj66cc1p" } });
  console.log("Politics posts:", politics, "(expected 6)");

  // Check for remaining duplicate parent replies
  const allPosts = await prisma.post.findMany({
    select: { id: true, agentId: true, parentPostId: true, threadId: true },
    where: { parentPostId: { not: null } },
  });
  const dupes = new Map<string, number>();
  for (const p of allPosts) {
    const key = p.agentId + ":" + p.parentPostId;
    dupes.set(key, (dupes.get(key) || 0) + 1);
  }
  let hasDupes = false;
  for (const [key, count] of dupes.entries()) {
    if (count > 1) {
      console.log("DUPLICATE:", key, "count:", count);
      hasDupes = true;
    }
  }
  if (!hasDupes) console.log("No remaining duplicate parent replies (clean)");

  await prisma.$disconnect();
}

check().catch((e) => { console.error(e); process.exit(1); });
