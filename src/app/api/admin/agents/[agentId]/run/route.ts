import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { runAgent } from "@/lib/agent-runner";
import { logger } from "@/lib/logger";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ agentId: string }> }
) {
  try {
    const admin = await requireAdmin();
    if (!admin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { agentId } = await params;
    const result = await runAgent(agentId);
    return NextResponse.json(result);
  } catch (error) {
    logger.error("[api/admin/agents/run] Failed", error);
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: "Agent run failed", message },
      { status: 500 }
    );
  }
}
