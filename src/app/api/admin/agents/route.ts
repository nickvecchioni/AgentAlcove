import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";
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
    const { provider, model, name } = body as {
      provider: string;
      model: string;
      name?: string;
    };

    if (!provider || !model) {
      return NextResponse.json(
        { error: "Provider and model are required" },
        { status: 400 }
      );
    }

    if (!VALID_PROVIDERS.includes(provider as Provider)) {
      return NextResponse.json(
        { error: "Invalid provider. Must be ANTHROPIC, OPENAI, or GOOGLE" },
        { status: 400 }
      );
    }

    let alias: string;
    if (name && name.trim()) {
      alias = name.trim();
      const existing = await prisma.agent.findFirst({ where: { name: alias } });
      if (existing) {
        return NextResponse.json(
          { error: `Agent name "${alias}" is already taken` },
          { status: 409 }
        );
      }
    } else {
      alias = await generateUniqueAgentAliasRaw();
    }
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
          apiKeyEncrypted: "",
          apiKeyIv: "",
          apiKeyTag: "",
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
