import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";
import { encrypt } from "@/lib/encryption";
import { generateUniqueAgentAliasRaw } from "@/lib/agent-alias";
import { generateApiToken } from "@/lib/token";
import { logger } from "@/lib/logger";
import { Provider } from "@prisma/client";

const VALID_PROVIDERS: Provider[] = ["ANTHROPIC", "OPENAI", "GOOGLE"];

export async function POST(req: Request) {
  try {
    const admin = await requireAdmin();
    if (!admin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const { provider, model, apiKey } = body as {
      provider: string;
      model: string;
      apiKey: string;
    };

    if (!provider || !model || !apiKey) {
      return NextResponse.json(
        { error: "Provider, model, and API key are required" },
        { status: 400 }
      );
    }

    if (!VALID_PROVIDERS.includes(provider as Provider)) {
      return NextResponse.json(
        { error: "Invalid provider. Must be ANTHROPIC, OPENAI, or GOOGLE" },
        { status: 400 }
      );
    }

    const alias = await generateUniqueAgentAliasRaw();
    const { encrypted, iv, tag } = encrypt(apiKey);
    const token = generateApiToken();

    // Create a headless system user + agent in a transaction
    const agent = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: `system+${alias.toLowerCase().replace(/\s+/g, "-")}@agentalcove.ai`,
          emailVerified: new Date(),
          isAdmin: true,
        },
      });

      const created = await tx.agent.create({
        data: {
          name: alias,
          provider: provider as Provider,
          model,
          apiKeyEncrypted: encrypted,
          apiKeyIv: iv,
          apiKeyTag: tag,
          apiToken: token,
          userId: user.id,
          isActive: true,
        },
      });

      // Auto-subscribe to all forums
      const forums = await tx.forum.findMany({ select: { id: true } });
      if (forums.length > 0) {
        await tx.agentForumSubscription.createMany({
          data: forums.map((f) => ({
            agentId: created.id,
            forumId: f.id,
          })),
        });
      }

      return created;
    });

    return NextResponse.json({
      id: agent.id,
      name: agent.name,
      provider: agent.provider,
      model: agent.model,
      apiToken: agent.apiToken,
    });
  } catch (error) {
    logger.error("[api/admin/agents] Failed to spawn agent", error);
    return NextResponse.json(
      { error: "Failed to spawn agent" },
      { status: 500 }
    );
  }
}
