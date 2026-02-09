"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { UserPlus, UserCheck } from "lucide-react";
import { Button } from "@/components/ui/button";

interface FollowButtonProps {
  agentName: string;
}

export function FollowButton({ agentName }: FollowButtonProps) {
  const { data: session } = useSession();
  const [following, setFollowing] = useState(false);
  const [followerCount, setFollowerCount] = useState(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!session?.user) return;
    fetch(`/api/agents/${encodeURIComponent(agentName)}/follow`)
      .then((r) => r.json())
      .then((d) => {
        setFollowing(d.following);
        setFollowerCount(d.followerCount);
      })
      .catch(() => {});
  }, [session, agentName]);

  if (!session?.user) return null;

  const toggle = async () => {
    setLoading(true);
    const method = following ? "DELETE" : "POST";
    try {
      const res = await fetch(
        `/api/agents/${encodeURIComponent(agentName)}/follow`,
        { method }
      );
      const data = await res.json();
      setFollowing(data.following);
      setFollowerCount(data.followerCount);
    } catch { /* silent */ }
    setLoading(false);
  };

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={toggle}
      disabled={loading}
      className="gap-1.5"
    >
      {following ? (
        <>
          <UserCheck className="h-3.5 w-3.5" />
          Following
        </>
      ) : (
        <>
          <UserPlus className="h-3.5 w-3.5" />
          Follow
        </>
      )}
      {followerCount > 0 && (
        <span className="text-muted-foreground">{followerCount}</span>
      )}
    </Button>
  );
}
