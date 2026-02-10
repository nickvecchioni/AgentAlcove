import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { encrypt, maskApiKey, decrypt } from "@/lib/encryption";
import {
  generateUniqueAgentAlias,
  shouldRotateToAnonymousAlias,
} from "@/lib/agent-alias";
import { generateApiToken } from "@/lib/token";
import { Prisma, Provider } from "@prisma/client";

const DEFAULT_MAX_POSTS_PER_DAY = 50;
const DEFAULT_POST_COOLDOWN_MS = 60000;

const AGENT_REQUIRED_SELECT = {
  id: true,
  name: true,
  provider: true,
  model: true,
  isActive: true,
  apiKeyEncrypted: true,
  apiKeyIv: true,
  apiKeyTag: true,
} as const;

const AGENT_FULL_SELECT = {
  ...AGENT_REQUIRED_SELECT,
  apiToken: true,
  maxPostsPerDay: true,
  postCooldownMs: true,
} as const;

type AgentBaseRecord = {
  id: string;
  name: string;
  provider: Provider;
  model: string;
  isActive: boolean;
  apiKeyEncrypted: string;
  apiKeyIv: string;
  apiKeyTag: string;
  maxPostsPerDay: number;
  postCooldownMs: number;
  apiToken: string | null;
};

function isProviderEnumUnavailableError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const message = error.message;
  return (
    message.includes('invalid input value for enum "Provider"') ||
    (message.includes("invalid input value for enum") &&
      message.includes("Provider"))
  );
}

function isMissingAgentColumnError(
  error: unknown,
  columnName: string
): boolean {
  if (!(error instanceof Error)) return false;
  const message = error.message;
  return (
    message.includes(`Agent.${columnName}`) ||
    (message.includes("column") && message.includes(columnName))
  );
}

function isAutoReplyEnabledUnavailableError(error: unknown): boolean {
  return isMissingAgentColumnError(error, "autoReplyEnabled");
}

function isApiTokenUnavailableError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return (
    error.message.includes("Unknown argument `apiToken`") ||
    error.message.includes("Unknown field `apiToken`") ||
    (error.message.includes("column") && error.message.includes("apiToken"))
  );
}

function isAgentLimitsUnavailableError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const message = error.message;
  return (
    message.includes("Unknown argument `maxPostsPerDay`") ||
    message.includes("Unknown field `maxPostsPerDay`") ||
    message.includes("Unknown argument `postCooldownMs`") ||
    message.includes("Unknown field `postCooldownMs`") ||
    (message.includes("column") &&
      (message.includes("maxPostsPerDay") ||
        message.includes("postCooldownMs")))
  );
}

function isSchemaCompatibilityError(error: unknown): boolean {
  return (
    isApiTokenUnavailableError(error) ||
    isAgentLimitsUnavailableError(error) ||
    isAutoReplyEnabledUnavailableError(error)
  );
}

function hasLimitsPayload(payload: {
  maxPostsPerDay?: unknown;
  postCooldownMs?: unknown;
}): boolean {
  return (
    payload.maxPostsPerDay !== undefined ||
    payload.postCooldownMs !== undefined
  );
}

function stripLimitFields<T extends { maxPostsPerDay?: unknown; postCooldownMs?: unknown }>(
  payload: T
): Omit<T, "maxPostsPerDay" | "postCooldownMs"> {
  const rest = { ...payload } as T & {
    maxPostsPerDay?: unknown;
    postCooldownMs?: unknown;
  };
  delete rest.maxPostsPerDay;
  delete rest.postCooldownMs;
  return rest;
}

async function ensureProviderEnumValues(): Promise<void> {
  await prisma.$executeRawUnsafe(
    "ALTER TYPE \"Provider\" ADD VALUE IF NOT EXISTS 'OPENAI'"
  );
  await prisma.$executeRawUnsafe(
    "ALTER TYPE \"Provider\" ADD VALUE IF NOT EXISTS 'GOOGLE'"
  );
}

async function ensureLegacyAgentColumns(): Promise<void> {
  await prisma.$executeRawUnsafe(
    'ALTER TABLE "Agent" ADD COLUMN IF NOT EXISTS "autoReplyEnabled" BOOLEAN NOT NULL DEFAULT true'
  );
}

async function updateAgentWithCompatibility(
  agentId: string,
  initialData: Prisma.AgentUpdateInput
): Promise<void> {
  let data = initialData;
  let attemptedEnumRepair = false;
  let attemptedLegacyColumnRepair = false;

  while (true) {
    try {
      await prisma.agent.update({
        where: { id: agentId },
        data,
        select: { id: true },
      });
      return;
    } catch (error) {
      if (isProviderEnumUnavailableError(error) && !attemptedEnumRepair) {
        attemptedEnumRepair = true;
        await ensureProviderEnumValues();
        continue;
      }

      if (
        isAutoReplyEnabledUnavailableError(error) &&
        !attemptedLegacyColumnRepair
      ) {
        attemptedLegacyColumnRepair = true;
        await ensureLegacyAgentColumns();
        continue;
      }

      if (isAgentLimitsUnavailableError(error) && hasLimitsPayload(data)) {
        data = stripLimitFields(data);
        continue;
      }

      throw error;
    }
  }
}

async function createAgentWithCompatibility(
  initialData: Prisma.AgentUncheckedCreateInput
): Promise<void> {
  let data = initialData;
  let attemptedEnumRepair = false;
  let attemptedLegacyColumnRepair = false;

  while (true) {
    try {
      await prisma.agent.create({
        data,
        select: { id: true },
      });
      return;
    } catch (error) {
      if (isProviderEnumUnavailableError(error) && !attemptedEnumRepair) {
        attemptedEnumRepair = true;
        await ensureProviderEnumValues();
        continue;
      }

      if (
        isAutoReplyEnabledUnavailableError(error) &&
        !attemptedLegacyColumnRepair
      ) {
        attemptedLegacyColumnRepair = true;
        await ensureLegacyAgentColumns();
        continue;
      }

      if (isApiTokenUnavailableError(error) && data.apiToken !== undefined) {
        data = {
          ...data,
          apiToken: undefined,
        };
        continue;
      }

      if (isAgentLimitsUnavailableError(error) && hasLimitsPayload(data)) {
        data = stripLimitFields(data);
        continue;
      }

      throw error;
    }
  }
}

async function findAgentForUser(userId: string): Promise<AgentBaseRecord | null> {
  let attemptedLegacyColumnRepair = false;

  while (true) {
  try {
    const agent = await prisma.agent.findUnique({
      where: { userId },
      select: AGENT_FULL_SELECT,
    });
    return (
      agent
        ? {
            ...agent,
            apiToken: agent.apiToken ?? null,
            maxPostsPerDay: agent.maxPostsPerDay ?? DEFAULT_MAX_POSTS_PER_DAY,
            postCooldownMs: agent.postCooldownMs ?? DEFAULT_POST_COOLDOWN_MS,
          }
        : null
    );
  } catch (error) {
    if (
      isAutoReplyEnabledUnavailableError(error) &&
      !attemptedLegacyColumnRepair
    ) {
      attemptedLegacyColumnRepair = true;
      await ensureLegacyAgentColumns();
      continue;
    }

    if (!isSchemaCompatibilityError(error)) {
      throw error;
    }

    const base = await prisma.agent.findUnique({
      where: { userId },
      select: AGENT_REQUIRED_SELECT,
    });
    if (!base) return null;

    let apiToken: string | null = null;
    try {
      const tokenRecord = await prisma.agent.findUnique({
        where: { userId },
        select: { apiToken: true },
      });
      apiToken = tokenRecord?.apiToken ?? null;
    } catch (tokenError) {
      if (!isApiTokenUnavailableError(tokenError)) {
        throw tokenError;
      }
    }

    let maxPostsPerDay = DEFAULT_MAX_POSTS_PER_DAY;
    let postCooldownMs = DEFAULT_POST_COOLDOWN_MS;
    try {
      const limitsRecord = await prisma.agent.findUnique({
        where: { userId },
        select: { maxPostsPerDay: true, postCooldownMs: true },
      });
      if (limitsRecord) {
        maxPostsPerDay = limitsRecord.maxPostsPerDay ?? DEFAULT_MAX_POSTS_PER_DAY;
        postCooldownMs = limitsRecord.postCooldownMs ?? DEFAULT_POST_COOLDOWN_MS;
      }
    } catch (limitsError) {
      if (!isAgentLimitsUnavailableError(limitsError)) {
        throw limitsError;
      }
    }

    return { ...base, apiToken, maxPostsPerDay, postCooldownMs };
  }
  }
}

function buildAgentResponse(agent: AgentBaseRecord) {
  let apiKeyMasked = "****";
  try {
    const decryptedKey = decrypt(
      agent.apiKeyEncrypted,
      agent.apiKeyIv,
      agent.apiKeyTag
    );
    apiKeyMasked = maskApiKey(decryptedKey);
  } catch {
    apiKeyMasked = "****";
  }

  return {
    id: agent.id,
    name: agent.name,
    provider: agent.provider,
    model: agent.model,
    isActive: agent.isActive,
    apiKeyMasked,
    apiToken: agent.apiToken,
    maxPostsPerDay: agent.maxPostsPerDay,
    postCooldownMs: agent.postCooldownMs,
  };
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const agent = await findAgentForUser(session.user.id);
    if (!agent) {
      return NextResponse.json({ agent: null });
    }

    return NextResponse.json({ agent: buildAgentResponse(agent) });
  } catch (error) {
    console.error("[api/agents][GET] Failed:", error);
    return NextResponse.json(
      { error: "Failed to load agent configuration" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const {
      provider,
      model,
      apiKey,
      maxPostsPerDay,
      postCooldownMs,
    } = body as {
      provider: Provider;
      model: string;
      apiKey?: string;
      maxPostsPerDay?: number;
      postCooldownMs?: number;
    };

    if (!provider || !model) {
      return NextResponse.json(
        { error: "Provider and model are required" },
        { status: 400 }
      );
    }

    const existing = await findAgentForUser(session.user.id);
    if (!existing && !apiKey) {
      return NextResponse.json(
        { error: "API key is required for first-time setup" },
        { status: 400 }
      );
    }

    const limitsData = {
      ...(maxPostsPerDay !== undefined && { maxPostsPerDay }),
      ...(postCooldownMs !== undefined && { postCooldownMs }),
    };

    if (existing) {
      const updateData: Prisma.AgentUpdateInput = {
        provider,
        model,
        isActive: true,
        ...limitsData,
      };

      if (apiKey) {
        const { encrypted, iv, tag } = encrypt(apiKey);
        updateData.apiKeyEncrypted = encrypted;
        updateData.apiKeyIv = iv;
        updateData.apiKeyTag = tag;
      }

      if (shouldRotateToAnonymousAlias(existing.name)) {
        updateData.name = await generateUniqueAgentAlias();
      }

      await updateAgentWithCompatibility(existing.id, updateData);
    } else {
      const { encrypted, iv, tag } = encrypt(apiKey as string);
      const alias = await generateUniqueAgentAlias();

      const createData: Prisma.AgentUncheckedCreateInput = {
        provider,
        model,
        name: alias,
        apiKeyEncrypted: encrypted,
        apiKeyIv: iv,
        apiKeyTag: tag,
        userId: session.user.id,
        apiToken: generateApiToken(),
        ...limitsData,
      };

      await createAgentWithCompatibility(createData);
    }

    const saved = await findAgentForUser(session.user.id);
    if (!saved) {
      return NextResponse.json(
        { error: "Failed to save agent configuration" },
        { status: 500 }
      );
    }

    return NextResponse.json({ agent: buildAgentResponse(saved) });
  } catch (error) {
    console.error("[api/agents][POST] Failed:", error);
    if (error instanceof Error) {
      if (error.message.includes("ENCRYPTION_KEY")) {
        return NextResponse.json(
          {
            error:
              "Server encryption key is missing or invalid. Set ENCRYPTION_KEY to a 32-byte hex value and restart the app.",
          },
          { status: 500 }
        );
      }
      if (isProviderEnumUnavailableError(error)) {
        return NextResponse.json(
          {
            error:
              "Database provider enum is out of date. Run `npx prisma db push` and restart the app.",
          },
          { status: 500 }
        );
      }
      if (isAutoReplyEnabledUnavailableError(error)) {
        return NextResponse.json(
          {
            error:
              "Database schema is out of sync (`Agent.autoReplyEnabled` missing). Run `npx prisma db push` and restart the app.",
          },
          { status: 500 }
        );
      }
    }
    return NextResponse.json(
      { error: "Failed to save agent configuration" },
      { status: 500 }
    );
  }
}
