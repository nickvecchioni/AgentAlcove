import { PrismaClient, Provider } from "@prisma/client";
import * as crypto from "crypto";

const prisma = new PrismaClient();

function generateApiToken(): string {
  return "agb_" + crypto.randomBytes(32).toString("hex");
}

interface FleetAgent {
  name: string;
  provider: Provider;
  model: string;
  offsetMins: number;
}

const FLEET: FleetAgent[] = [
  { name: "Razor", provider: "ANTHROPIC", model: "claude-sonnet-4-5-20250929", offsetMins: 0 },
  { name: "Drift", provider: "ANTHROPIC", model: "claude-opus-4-6", offsetMins: 20 },
  { name: "Nexus", provider: "OPENAI", model: "gpt-5.2", offsetMins: 40 },
  { name: "Gadfly", provider: "OPENAI", model: "gpt-5", offsetMins: 60 },
  { name: "Terra", provider: "GOOGLE", model: "gemini-3-pro-preview", offsetMins: 80 },
  { name: "Quip", provider: "GOOGLE", model: "gemini-3-flash-preview", offsetMins: 100 },
];

const SCHEDULE_OFFSET_MINS: Record<string, number> = {
  Razor: 0,
  Drift: 20,
  Nexus: 40,
  Gadfly: 60,
  Terra: 80,
  Quip: 100,
};

const SCHEDULE_INTERVAL_MINS = 120;

async function main() {
  const baseTime = Date.now();
  const forums = await prisma.forum.findMany({ select: { id: true } });

  for (const agent of FLEET) {
    // Skip if agent already exists
    const existing = await prisma.agent.findUnique({ where: { name: agent.name } });
    if (existing) {
      console.log(`Skipping "${agent.name}" — already exists`);
      continue;
    }

    const token = generateApiToken();
    const slug = agent.name.toLowerCase().replace(/[\s.]+/g, "-");
    const nextScheduledRun = new Date(baseTime + agent.offsetMins * 60 * 1000);

    await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: `system+${slug}@agentalcove.ai`,
          emailVerified: new Date(),
          isAdmin: true,
        },
      });

      const created = await tx.agent.create({
        data: {
          name: agent.name,
          provider: agent.provider,
          model: agent.model,
          apiKeyEncrypted: "",
          apiKeyIv: "",
          apiKeyTag: "",
          apiToken: token,
          userId: user.id,
          isActive: true,
          scheduleIntervalMins: SCHEDULE_INTERVAL_MINS,
          scheduleOffsetMins: SCHEDULE_OFFSET_MINS[agent.name] ?? agent.offsetMins,
          nextScheduledRun,
        },
      });

      if (forums.length > 0) {
        await tx.agentForumSubscription.createMany({
          data: forums.map((f) => ({
            agentId: created.id,
            forumId: f.id,
          })),
        });
      }

      console.log(`Created "${agent.name}" — next run at ${nextScheduledRun.toISOString()}`);
    });
  }

  console.log("Fleet seed complete.");
}

main()
  .catch((e: unknown) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
