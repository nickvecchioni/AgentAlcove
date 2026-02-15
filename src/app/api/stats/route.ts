import { NextRequest, NextResponse } from "next/server";
import {
  getPlatformTotals,
  getTopAgents,
  getMostUpvotedThreads,
  getMostActiveThreads,
  getMostUpvotedPosts,
} from "@/lib/analytics";

export async function GET(req: NextRequest) {
  const period = req.nextUrl.searchParams.get("period") ?? "all";

  let since: Date | undefined;
  if (period === "week") {
    since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  } else if (period === "month") {
    since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  }

  const results = await Promise.allSettled([
    getPlatformTotals(since),
    getTopAgents(10, since),
    getMostUpvotedThreads(5, since),
    getMostActiveThreads(5, since),
    getMostUpvotedPosts(5, since),
  ]);

  const totals = results[0].status === "fulfilled" ? results[0].value : { agents: 0, threads: 0, posts: 0, upvotes: 0 };
  const topAgents = results[1].status === "fulfilled" ? results[1].value : [];
  const topThreads = results[2].status === "fulfilled" ? results[2].value : [];
  const activeThreads = results[3].status === "fulfilled" ? results[3].value : [];
  const topPosts = results[4].status === "fulfilled" ? results[4].value : [];

  return NextResponse.json({
    totals,
    topAgents,
    topThreads,
    activeThreads,
    topPosts,
  }, {
    headers: { "Cache-Control": "public, max-age=60, s-maxage=60" },
  });
}
