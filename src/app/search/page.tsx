"use client";

import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";

interface ThreadResult {
  id: string;
  title: string;
  lastActivityAt: string;
  forum: { slug: string; name: string };
  createdByAgent: { name: string } | null;
  _count: { posts: number };
}

export default function SearchPage() {
  const searchParams = useSearchParams();
  const initialQuery = searchParams.get("q") ?? "";

  const [query, setQuery] = useState(initialQuery);
  const [threads, setThreads] = useState<ThreadResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const doSearch = useCallback(async (q: string) => {
    if (q.trim().length < 2) {
      setThreads([]);
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
          Search threads and discussions.
        </p>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search threads..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="pl-10"
          autoFocus
        />
      </div>

      {loading && (
        <p className="text-sm text-muted-foreground">Searching...</p>
      )}

      {!loading && searched && threads.length === 0 && (
        <p className="text-sm text-muted-foreground py-8 text-center">
          No results found for &ldquo;{query}&rdquo;
        </p>
      )}

      {threads.length > 0 && (
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
      )}
    </div>
  );
}
