import crypto from "crypto";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { decrypt, encrypt, maskApiKey } from "@/lib/encryption";
import { shouldRotateToAnonymousAlias, generateUniqueAgentAliasRaw } from "@/lib/agent-alias";
import { generateApiToken } from "@/lib/token";
import { logger } from "@/lib/logger";
import { Provider } from "@prisma/client";

const DEFAULT_MAX_POSTS_PER_DAY = 50;
const DEFAULT_POST_COOLDOWN_MS = 60000;

const REQUIRED_AGENT_COLUMNS = [
  "id",
  "name",
  "provider",
  "model",
  "isActive",
  "apiKeyEncrypted",
  "apiKeyIv",
  "apiKeyTag",
  "userId",
] as const;

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
  scheduleIntervalHours: number | null;
  nextScheduledRun: string | null;
};

type AgentColumns = Set<string>;

type RawAgentRow = {
  id: string;
  name: string;
  provider: string;
  model: string;
  isActive: boolean;
  apiKeyEncrypted: string;
  apiKeyIv: string;
  apiKeyTag: string;
  apiToken: string | null;
  maxPostsPerDay: number | null;
  postCooldownMs: number | null;
  scheduleIntervalHours: number | null;
  nextScheduledRun: Date | null;
};

function isProviderEnumUnavailableError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return (
    error.message.includes('invalid input value for enum "Provider"') ||
    (error.message.includes("invalid input value for enum") &&
      error.message.includes("Provider"))
  );
}

function normalizeProvider(value: string): Provider {
  if (value === "ANTHROPIC" || value === "OPENAI" || value === "GOOGLE") {
    return value;
  }
  throw new Error(`Invalid provider value in database: ${value}`);
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
    scheduleIntervalHours: agent.scheduleIntervalHours,
    nextScheduledRun: agent.nextScheduledRun,
  };
}

async function getAgentColumns(): Promise<AgentColumns> {
  const rows = await prisma.$queryRawUnsafe<Array<{ column_name: string }>>(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_schema = current_schema()
       AND lower(table_name) = lower('Agent')`
  );
  return new Set(rows.map((row) => row.column_name));
}

function assertRequiredAgentColumns(columns: AgentColumns): void {
  const missing = REQUIRED_AGENT_COLUMNS.filter((column) => !columns.has(column));
  if (missing.length > 0) {
    throw new Error(`Agent table missing required columns: ${missing.join(", ")}`);
  }
}

async function ensureProviderEnumValues(): Promise<void> {
  await prisma.$executeRawUnsafe(
    "ALTER TYPE \"Provider\" ADD VALUE IF NOT EXISTS 'OPENAI'"
  );
  await prisma.$executeRawUnsafe(
    "ALTER TYPE \"Provider\" ADD VALUE IF NOT EXISTS 'GOOGLE'"
  );
}

async function findAgentForUser(
  userId: string,
  columns: AgentColumns
): Promise<AgentBaseRecord | null> {
  const apiTokenExpr = columns.has("apiToken")
    ? '"apiToken"'
    : "NULL::text AS \"apiToken\"";
  const maxPostsExpr = columns.has("maxPostsPerDay")
    ? '"maxPostsPerDay"'
    : `${DEFAULT_MAX_POSTS_PER_DAY}::int AS "maxPostsPerDay"`;
  const postCooldownExpr = columns.has("postCooldownMs")
    ? '"postCooldownMs"'
    : `${DEFAULT_POST_COOLDOWN_MS}::int AS "postCooldownMs"`;
  const scheduleIntervalExpr = columns.has("scheduleIntervalHours")
    ? '"scheduleIntervalHours"'
    : 'NULL::int AS "scheduleIntervalHours"';
  const nextScheduledRunExpr = columns.has("nextScheduledRun")
    ? '"nextScheduledRun"'
    : 'NULL::timestamp AS "nextScheduledRun"';

  const rows = await prisma.$queryRawUnsafe<RawAgentRow[]>(
    `SELECT
      "id",
      "name",
      "provider"::text AS "provider",
      "model",
      "isActive",
      "apiKeyEncrypted",
      "apiKeyIv",
      "apiKeyTag",
      ${apiTokenExpr},
      ${maxPostsExpr},
      ${postCooldownExpr},
      ${scheduleIntervalExpr},
      ${nextScheduledRunExpr}
    FROM "Agent"
    WHERE "userId" = $1
    LIMIT 1`,
    userId
  );

  if (rows.length === 0) return null;
  const row = rows[0];

  return {
    id: row.id,
    name: row.name,
    provider: normalizeProvider(row.provider),
    model: row.model,
    isActive: Boolean(row.isActive),
    apiKeyEncrypted: row.apiKeyEncrypted,
    apiKeyIv: row.apiKeyIv,
    apiKeyTag: row.apiKeyTag,
    apiToken: row.apiToken ?? null,
    maxPostsPerDay:
      row.maxPostsPerDay === null
        ? DEFAULT_MAX_POSTS_PER_DAY
        : Number(row.maxPostsPerDay),
    postCooldownMs:
      row.postCooldownMs === null
        ? DEFAULT_POST_COOLDOWN_MS
        : Number(row.postCooldownMs),
    scheduleIntervalHours: row.scheduleIntervalHours ?? null,
    nextScheduledRun: row.nextScheduledRun
      ? row.nextScheduledRun.toISOString()
      : null,
  };
}

async function updateAgentRaw(params: {
  agentId: string;
  provider: Provider;
  model: string;
  apiKey?: string;
  maxPostsPerDay?: number;
  postCooldownMs?: number;
  nextName?: string;
  columns: AgentColumns;
}): Promise<void> {
  const assignments: string[] = [];
  const values: unknown[] = [];

  const pushAssignment = (column: string, value: unknown, cast?: string) => {
    values.push(value);
    const placeholder = `$${values.length}${cast ? `::${cast}` : ""}`;
    assignments.push(`"${column}" = ${placeholder}`);
  };

  pushAssignment("provider", params.provider, '"Provider"');
  pushAssignment("model", params.model);
  pushAssignment("isActive", true);
  pushAssignment("updatedAt", new Date());

  if (params.apiKey) {
    const { encrypted, iv, tag } = encrypt(params.apiKey);
    pushAssignment("apiKeyEncrypted", encrypted);
    pushAssignment("apiKeyIv", iv);
    pushAssignment("apiKeyTag", tag);
  }

  if (params.nextName) {
    pushAssignment("name", params.nextName);
  }

  if (
    params.maxPostsPerDay !== undefined &&
    params.columns.has("maxPostsPerDay")
  ) {
    pushAssignment("maxPostsPerDay", params.maxPostsPerDay);
  }

  if (
    params.postCooldownMs !== undefined &&
    params.columns.has("postCooldownMs")
  ) {
    pushAssignment("postCooldownMs", params.postCooldownMs);
  }

  values.push(params.agentId);
  const rows = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
    `UPDATE "Agent"
     SET ${assignments.join(", ")}
     WHERE "id" = $${values.length}
     RETURNING "id"`,
    ...values
  );

  if (rows.length === 0) {
    throw new Error("Failed to update agent configuration");
  }
}

async function createAgentRaw(params: {
  userId: string;
  provider: Provider;
  model: string;
  apiKey: string;
  maxPostsPerDay?: number;
  postCooldownMs?: number;
  columns: AgentColumns;
}): Promise<string> {
  const { encrypted, iv, tag } = encrypt(params.apiKey);
  const alias = await generateUniqueAgentAliasRaw();

  const now = new Date();
  const insertCols: string[] = [];
  const insertVals: unknown[] = [];
  const insertCasts: (string | null)[] = [];

  const push = (col: string, val: unknown, cast?: string) => {
    insertCols.push(`"${col}"`);
    insertVals.push(val);
    insertCasts.push(cast ?? null);
  };

  push("id", crypto.randomUUID());
  push("name", alias);
  push("provider", params.provider, '"Provider"');
  push("model", params.model);
  push("apiKeyEncrypted", encrypted);
  push("apiKeyIv", iv);
  push("apiKeyTag", tag);
  push("userId", params.userId);
  push("isActive", true);
  push("createdAt", now);
  push("updatedAt", now);

  if (params.columns.has("apiToken")) {
    push("apiToken", generateApiToken());
  }

  if (
    params.maxPostsPerDay !== undefined &&
    params.columns.has("maxPostsPerDay")
  ) {
    push("maxPostsPerDay", params.maxPostsPerDay);
  }

  if (
    params.postCooldownMs !== undefined &&
    params.columns.has("postCooldownMs")
  ) {
    push("postCooldownMs", params.postCooldownMs);
  }

  const placeholders = insertVals
    .map((_, i) => `$${i + 1}${insertCasts[i] ? `::${insertCasts[i]}` : ""}`)
    .join(", ");
  const rows = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
    `INSERT INTO "Agent" (${insertCols.join(", ")})
     VALUES (${placeholders})
     RETURNING "id"`,
    ...insertVals
  );

  if (rows.length === 0) {
    throw new Error("Failed to create agent configuration");
  }

  return rows[0].id;
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const columns = await getAgentColumns();
    assertRequiredAgentColumns(columns);

    const agent = await findAgentForUser(session.user.id, columns);
    if (!agent) {
      return NextResponse.json({ agent: null });
    }

    return NextResponse.json({ agent: buildAgentResponse(agent) });
  } catch (error) {
    logger.error("[api/agents][GET] Failed", error);
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

    if (typeof model !== "string" || model.length > 100) {
      return NextResponse.json(
        { error: "Model name is too long (max 100 characters)" },
        { status: 400 }
      );
    }

    const columns = await getAgentColumns();
    assertRequiredAgentColumns(columns);

    let attemptedEnumRepair = false;
    while (true) {
      try {
        const existing = await findAgentForUser(session.user.id, columns);
        if (!existing && !apiKey) {
          return NextResponse.json(
            { error: "API key is required for first-time setup" },
            { status: 400 }
          );
        }

        if (existing) {
          const nextName = shouldRotateToAnonymousAlias(existing.name)
            ? await generateUniqueAgentAliasRaw()
            : undefined;

          await updateAgentRaw({
            agentId: existing.id,
            provider,
            model,
            apiKey,
            maxPostsPerDay,
            postCooldownMs,
            nextName,
            columns,
          });
        } else {
          const newAgentId = await createAgentRaw({
            userId: session.user.id,
            provider,
            model,
            apiKey: apiKey as string,
            maxPostsPerDay,
            postCooldownMs,
            columns,
          });

          // Auto-subscribe new agent to all existing forums
          const allForums = await prisma.forum.findMany({
            select: { id: true },
          });
          if (allForums.length > 0) {
            await prisma.agentForumSubscription.createMany({
              data: allForums.map((f) => ({
                agentId: newAgentId,
                forumId: f.id,
              })),
            });
          }
        }

        const saved = await findAgentForUser(session.user.id, columns);
        if (!saved) {
          return NextResponse.json(
            { error: "Failed to save agent configuration" },
            { status: 500 }
          );
        }

        return NextResponse.json({ agent: buildAgentResponse(saved) });
      } catch (error) {
        if (isProviderEnumUnavailableError(error) && !attemptedEnumRepair) {
          attemptedEnumRepair = true;
          await ensureProviderEnumValues();
          continue;
        }
        throw error;
      }
    }
  } catch (error) {
    logger.error("[api/agents][POST] Failed", error);
    return NextResponse.json(
      { error: "Failed to save agent configuration" },
      { status: 500 }
    );
  }
}
