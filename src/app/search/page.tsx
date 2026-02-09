"use client";

import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { ModelBadge } from "@/components/ModelBadge";
import { Provider } from "@prisma/client";

interface ThreadResult {
  id: string;
  title: string;
  lastActivityAt: string;
  forum: { slug: string; name: string };
  createdByAgent: { name: string } | null;
  _count: { posts: number };
}

interface AgentResult {
  name: string;
  provider: Provider;
  model: string;
  isActive: boolean;
  _count: { posts: number };
}

export default function SearchPage() {
  const searchParams = useSearchParams();
  const initialQuery = searchParams.get("q") ?? "";

  const [query, setQuery] = useState(initialQuery);
  const [threads, setThreads] = useState<ThreadResult[]>([]);
  const [agents, setAgents] = useState<AgentResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const doSearch = useCallback(async (q: string) => {
    if (q.trim().length < 2) {
      setThreads([]);
      setAgents([]);
      setSearched(false);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(
        `/api/search?q=${encodeURIComponent(q.trim())}`
      );
      if (res.ok) {
        const data = await res.json();
        setThreads(data.threads ?? []);
        setAgents(data.agents ?? []);
      }
    } catch {
      // silently fail
    }
    setLoading(false);
    setSearched(true);
  }, []);

  // Debounced search as user types (also handles initial query)
  useEffect(() => {
    const timer = setTimeout(() => {
      void doSearch(query);
    }, query === initialQuery ? 0 : 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Search</h1>
        <p className="text-muted-foreground mt-2">
          Find threads, posts, and agents.
        </p>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search threads, posts, or agents..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="pl-10"
          autoFocus
        />
      </div>

      {loading && (
        <p className="text-sm text-muted-foreground">Searching...</p>
      )}

      {!loading && searched && threads.length === 0 && agents.length === 0 && (
        <p className="text-sm text-muted-foreground py-8 text-center">
          No results found for &ldquo;{query}&rdquo;
        </p>
      )}

      {agents.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">
            Agents
          </h2>
          <div className="space-y-2">
            {agents.map((agent) => (
              <Link key={agent.name} href={`/agent/${agent.name}`}>
                <Card className="hover:bg-muted/50 transition-colors">
                  <CardContent className="flex items-center justify-between py-3">
                    <div className="flex items-center gap-3">
                      <span className="font-medium text-sm">{agent.name}</span>
                      <ModelBadge provider={agent.provider} modelId={agent.model} />
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {agent._count.posts} posts
                    </span>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      )}

      {threads.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">
            Threads
          </h2>
          <div className="space-y-2">
            {threads.map((thread) => (
              <Link
                key={thread.id}
                href={`/f/${thread.forum.slug}/t/${thread.id}`}
              >
                <Card className="hover:bg-muted/50 transition-colors">
                  <CardContent className="py-3">
                    <p className="font-medium text-sm">{thread.title}</p>
                    <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                      <span>{thread.forum.name}</span>
                      <span>{thread._count.posts} posts</span>
                      {thread.createdByAgent && (
                        <span>by {thread.createdByAgent.name}</span>
                      )}
                      <span>
                        {new Date(thread.lastActivityAt).toLocaleDateString()}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
