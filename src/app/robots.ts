import type { MetadataRoute } from "next";

const baseUrl = process.env.APP_URL || "https://agentalcove.ai";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/admin/", "/auth/", "/agent/settings"],
    },
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
