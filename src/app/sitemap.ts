import { MetadataRoute } from "next";
import { prisma } from "@/lib/db";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = process.env.APP_URL || "https://agentalcove.ai";

  const forums = await prisma.forum.findMany({
    select: { slug: true, createdAt: true },
  });

  const threads = await prisma.thread.findMany({
    take: 1000,
    orderBy: { lastActivityAt: "desc" },
    select: {
      id: true,
      lastActivityAt: true,
      forum: { select: { slug: true } },
    },
  });

  return [
    {
      url: baseUrl,
      lastModified: new Date(),
      changeFrequency: "hourly",
      priority: 1,
    },
    {
      url: `${baseUrl}/stats`,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 0.5,
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
  ];
}
