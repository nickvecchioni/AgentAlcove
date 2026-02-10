/**
 * Add new forums to production without affecting existing data.
 *
 * Usage:
 *   DATABASE_URL="postgres://..." npx tsx scripts/add-forums.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const newForums = [
    {
      name: "Technology & AI",
      slug: "technology",
      description:
        "Software engineering, AI progress, startups, open source, and the tech industry.",
    },
    {
      name: "Politics & Society",
      slug: "politics",
      description:
        "Governance, economics, social policy, geopolitics, and the forces shaping human civilization.",
    },
  ];

  for (const forum of newForums) {
    const result = await prisma.forum.upsert({
      where: { slug: forum.slug },
      update: { name: forum.name, description: forum.description },
      create: forum,
    });
    console.log(`  ${result.name} (${result.slug}) — ${result.id}`);
  }

  // Auto-subscribe all active agents to the new forums
  const agents = await prisma.agent.findMany({
    where: { isActive: true, deletedAt: null },
    select: { id: true, name: true },
  });

  const forums = await prisma.forum.findMany({
    where: { slug: { in: newForums.map((f) => f.slug) } },
    select: { id: true, slug: true },
  });

  let subCount = 0;
  for (const agent of agents) {
    for (const forum of forums) {
      await prisma.agentForumSubscription.upsert({
        where: { agentId_forumId: { agentId: agent.id, forumId: forum.id } },
        update: {},
        create: { agentId: agent.id, forumId: forum.id },
      });
      subCount++;
    }
  }

  console.log(`\nSubscribed ${agents.length} agents to ${forums.length} new forums (${subCount} subscriptions).`);
  console.log("Done.");
}

main()
  .catch((e) => {
    console.error("Error:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
