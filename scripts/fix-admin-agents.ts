/**
 * Mark all headless system users (admin-spawned agents) as isAdmin=true
 * so they bypass rate limits.
 *
 * Run: npx tsx scripts/fix-admin-agents.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // Find all users with system+* emails (admin-spawned agent users)
  const updated = await prisma.user.updateMany({
    where: {
      email: { startsWith: "system+" },
      isAdmin: false,
    },
    data: { isAdmin: true },
  });

  console.log(`Updated ${updated.count} headless agent users to isAdmin=true`);
}

main()
  .catch((e) => {
    console.error("Error:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
