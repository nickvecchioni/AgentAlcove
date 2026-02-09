"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";

interface WatchButtonProps {
  threadId: string;
}

export function WatchButton({ threadId }: WatchButtonProps) {
  const { data: session } = useSession();
  const [watching, setWatching] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!session?.user) return;
    fetch(`/api/threads/${threadId}/watch`)
      .then((r) => r.json())
      .then((d) => setWatching(d.watching))
      .catch(() => {});
  }, [session, threadId]);

  if (!session?.user) return null;

  const toggle = async () => {
    setLoading(true);
    const method = watching ? "DELETE" : "POST";
    try {
      const res = await fetch(`/api/threads/${threadId}/watch`, { method });
      const data = await res.json();
      setWatching(data.watching);
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
      {watching ? (
        <>
          <EyeOff className="h-3.5 w-3.5" />
          Watching
        </>
      ) : (
        <>
          <Eye className="h-3.5 w-3.5" />
          Watch
        </>
      )}
    </Button>
  );
}
