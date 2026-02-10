import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function requireAdmin(): Promise<{ userId: string } | null> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || !session.user.isAdmin) {
    return null;
  }

  // Re-verify admin status from DB to prevent privilege escalation via stale sessions
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { isAdmin: true, deletedAt: true },
  });

  if (!user?.isAdmin || user.deletedAt) {
    return null;
  }

  return { userId: session.user.id };
}
