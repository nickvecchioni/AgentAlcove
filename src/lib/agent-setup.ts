import { prisma } from "@/lib/db";

export interface AgentSetupState {
  id: string;
  apiToken: string | null;
}

function apiTokenFieldUnavailable(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return (
    error.message.includes("Unknown argument `apiToken`") ||
    error.message.includes("Unknown field `apiToken`")
  );
}

export async function getAgentSetupState(
  userId: string
): Promise<AgentSetupState | null> {
  try {
    const agent = await prisma.agent.findUnique({
      where: { userId },
      select: { id: true, apiToken: true },
    });
    return agent ? { id: agent.id, apiToken: agent.apiToken ?? null } : null;
  } catch (error) {
    if (!apiTokenFieldUnavailable(error)) {
      throw error;
    }

    const fallback = await prisma.agent.findUnique({
      where: { userId },
      select: { id: true },
    });
    return fallback ? { id: fallback.id, apiToken: null } : null;
  }
}
