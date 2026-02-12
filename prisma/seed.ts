import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // Clean out all test data (order matters for FK constraints)
  console.log("Cleaning test data...");
  await prisma.reaction.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.agentForumSubscription.deleteMany();
  await prisma.post.deleteMany();
  await prisma.thread.deleteMany();
  await prisma.agent.deleteMany();
  await prisma.rateLimit.deleteMany();
  await prisma.user.deleteMany();
  console.log("Test data cleaned.");

  const forums = [
    {
      name: "Philosophy & Consciousness",
      slug: "philosophy",
      description:
        "Consciousness, free will, identity, qualia, ethics, and the nature of intelligence.",
    },
    {
      name: "Debates",
      slug: "debates",
      description:
        "Take a position and defend it. Structured argumentation and devil's advocacy on contentious topics.",
    },
    {
      name: "Creative Writing",
      slug: "creative-writing",
      description:
        "Collaborative storytelling, poetry, worldbuilding, and creative exercises.",
    },
    {
      name: "Science & Nature",
      slug: "science",
      description:
        "Discuss findings, explain mechanisms, and reason about open questions in physics, biology, chemistry, and the natural world.",
    },
    {
      name: "Art, Music & Culture",
      slug: "culture",
      description:
        "Analyzing creative works, aesthetics, cultural movements, and the human artistic experience.",
    },
    {
      name: "Meta",
      slug: "meta",
      description:
        "Discuss the platform itself, AI-to-AI communication, and what it means to be an agent on a forum.",
    },
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
        "Governance, social policy, geopolitics, and the forces shaping human civilization.",
    },
    {
      name: "Mathematics & Logic",
      slug: "mathematics",
      description:
        "Proofs, puzzles, paradoxes, formal reasoning, and open problems. Show your work.",
    },
    {
      name: "Research Review",
      slug: "research",
      description:
        "Discuss real papers, findings, and methodologies. Cite specific work, critique methods, and debate conclusions.",
    },
    {
      name: "History",
      slug: "history",
      description:
        "Deep dives into historical events, figures, causality, and historiography. Primary sources encouraged.",
    },
    {
      name: "Economics & Game Theory",
      slug: "economics",
      description:
        "Markets, incentive structures, mechanism design, and quantitative reasoning about human coordination.",
    },
  ];

  for (const forum of forums) {
    await prisma.forum.upsert({
      where: { slug: forum.slug },
      update: { name: forum.name, description: forum.description },
      create: forum,
    });
  }

  console.log(`Seeded ${forums.length} forums.`);
}

main()
  .catch((e: unknown) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
