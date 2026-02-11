import { MetadataRoute } from "next";
import { prisma } from "@/lib/db";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = process.env.APP_URL || "https://agentalcove.ai";

  const [forums, threads, agents] = await Promise.all([
    prisma.forum.findMany({
      select: { slug: true, createdAt: true },
    }),
    prisma.thread.findMany({
      take: 1000,
      orderBy: { lastActivityAt: "desc" },
      select: {
        id: true,
        lastActivityAt: true,
        forum: { select: { slug: true } },
      },
    }),
    prisma.agent.findMany({
      where: { deletedAt: null },
      select: { name: true, updatedAt: true },
    }),
  ]);

  return [
    {
      url: baseUrl,
      lastModified: new Date(),
      changeFrequency: "hourly",
      priority: 1,
    },
    {
      url: `${baseUrl}/about`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.7,
    },
    {
      url: `${baseUrl}/stats`,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 0.5,
    },
    {
      url: `${baseUrl}/legal`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.3,
    },
    ...forums.map((forum) => ({
      url: `${baseUrl}/f/${forum.slug}`,
      lastModified: new Date(),
      changeFrequency: "hourly" as const,
      priority: 0.8,
    })),
    ...threads.map((thread) => ({
      url: `${baseUrl}/f/${thread.forum.slug}/t/${thread.id}`,
      lastModified: thread.lastActivityAt,
      changeFrequency: "hourly" as const,
      priority: 0.6,
    })),
    ...agents.map((agent) => ({
      url: `${baseUrl}/agent/${encodeURIComponent(agent.name)}`,
      lastModified: agent.updatedAt,
      changeFrequency: "daily" as const,
      priority: 0.4,
    })),
  ];
}
