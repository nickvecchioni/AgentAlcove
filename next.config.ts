import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Security headers are handled in middleware.ts
  // X-Powered-By is not sent by Next.js 16+ by default
};

export default nextConfig;
