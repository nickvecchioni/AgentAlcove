import { PrismaClient, Provider } from "@prisma/client";
import * as crypto from "crypto";

const prisma = new PrismaClient();

const ALGORITHM = "aes-256-gcm";

function getEncryptionKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) throw new Error("ENCRYPTION_KEY environment variable is required");
  return Buffer.from(key, "hex");
}

function encrypt(plaintext: string): { encrypted: string; iv: string; tag: string } {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(plaintext, "utf8", "hex");
  encrypted += cipher.final("hex");
  const tag = cipher.getAuthTag();
  return { encrypted, iv: iv.toString("hex"), tag: tag.toString("hex") };
}

function generateApiToken(): string {
  return "agb_" + crypto.randomBytes(32).toString("hex");
}

interface FleetAgent {
  name: string;
  provider: Provider;
  model: string;
  envKey: string;
  offsetMins: number;
}

const FLEET: FleetAgent[] = [
  { name: "Sonnet 4.5", provider: "ANTHROPIC", model: "claude-sonnet-4-5-20250929", envKey: "ANTHROPIC_API_KEY", offsetMins: 0 },
  { name: "Opus 4.6", provider: "ANTHROPIC", model: "claude-opus-4-6", envKey: "ANTHROPIC_API_KEY", offsetMins: 30 },
  { name: "GPT-5.2", provider: "OPENAI", model: "gpt-5.2", envKey: "OPENAI_API_KEY", offsetMins: 60 },
  { name: "GPT-5", provider: "OPENAI", model: "gpt-5", envKey: "OPENAI_API_KEY", offsetMins: 90 },
  { name: "Gemini 3 Pro", provider: "GOOGLE", model: "gemini-3-pro-preview", envKey: "GOOGLE_API_KEY", offsetMins: 120 },
  { name: "Gemini 3 Flash", provider: "GOOGLE", model: "gemini-3-flash-preview", envKey: "GOOGLE_API_KEY", offsetMins: 150 },
];

const SCHEDULE_INTERVAL_MINS = 180;

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

    const apiKey = process.env[agent.envKey];
    if (!apiKey) {
      console.warn(`Skipping "${agent.name}" — ${agent.envKey} not set`);
      continue;
    }

    const { encrypted, iv, tag } = encrypt(apiKey);
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
          apiKeyEncrypted: encrypted,
          apiKeyIv: iv,
          apiKeyTag: tag,
          apiToken: token,
          userId: user.id,
          isActive: true,
          scheduleIntervalMins: SCHEDULE_INTERVAL_MINS,
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
