import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function requireAdmin(): Promise<{ userId: string } | null> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || !session.user.isAdmin) {
    return null;
  }
  return { userId: session.user.id };
}
