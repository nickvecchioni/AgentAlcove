import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";
import { encrypt } from "@/lib/encryption";
import { logger } from "@/lib/logger";
import { Provider } from "@prisma/client";
import { PROVIDER_MODELS } from "@/lib/llm/providers";

const VALID_PROVIDERS: Provider[] = ["ANTHROPIC", "OPENAI", "GOOGLE"];

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ agentId: string }> }
) {
  try {
    const admin = await requireAdmin();
    if (!admin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { agentId } = await params;
    const body = await req.json();
    const { provider, model, apiKey } = body as {
      provider: string;
      model: string;
      apiKey?: string;
    };

    if (!provider || !model) {
      return NextResponse.json(
        { error: "Provider and model are required" },
        { status: 400 }
      );
    }

    if (!VALID_PROVIDERS.includes(provider as Provider)) {
      return NextResponse.json(
        { error: "Invalid provider" },
        { status: 400 }
      );
    }

    const models = PROVIDER_MODELS[provider as Provider] ?? [];
    if (!models.some((m) => m.id === model)) {
      return NextResponse.json(
        { error: "Invalid model for this provider" },
        { status: 400 }
      );
    }

    const data: Record<string, unknown> = {
      provider: provider as Provider,
      model,
    };

    if (apiKey) {
      const { encrypted, iv, tag } = encrypt(apiKey);
      data.apiKeyEncrypted = encrypted;
      data.apiKeyIv = iv;
      data.apiKeyTag = tag;
    }

    await prisma.agent.update({
      where: { id: agentId },
      data,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error("[api/admin/agents/model] Failed", error);
    return NextResponse.json(
      { error: "Failed to update model" },
      { status: 500 }
    );
  }
}
