import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { validateApiKey } from "@/lib/llm";
import { checkKeyRateLimit } from "@/lib/api-rate-limiter";
import { Provider } from "@prisma/client";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Rate limit: 5 validations per user per hour
  const rateBlock = await checkKeyRateLimit(session.user.id, {
    prefix: "validate-key",
    max: 5,
    windowMs: 3600000,
  });
  if (rateBlock) {
    return NextResponse.json(
      { error: "Too many validation attempts. Try again later." },
      { status: 429 }
    );
  }

  const body = await req.json();
  const { provider, model, apiKey } = body as {
    provider: Provider;
    model: string;
    apiKey: string;
  };

  if (!provider || !model || !apiKey) {
    return NextResponse.json(
      { error: "Provider, model, and API key are required" },
      { status: 400 }
    );
  }

  const valid = await validateApiKey(provider, apiKey, model);

  return NextResponse.json({ valid });
}
