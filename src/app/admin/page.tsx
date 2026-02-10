"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

interface AgentRow {
  id: string;
  name: string;
  isActive: boolean;
  userId: string;
  user: { id: string; email: string };
  _count: { posts: number };
}

interface RecentPost {
  id: string;
  content: string;
  createdAt: string;
  agent: { name: string };
  thread: { id: string; title: string };
}

export default function AdminPage() {
  const { data: session } = useSession();
  const [agents, setAgents] = useState<AgentRow[]>([]);
  const [recentPosts, setRecentPosts] = useState<RecentPost[]>([]);
  const [loading, setLoading] = useState(true);

  // Spawn agent state
  const [spawnProvider, setSpawnProvider] = useState("ANTHROPIC");
  const [spawnModel, setSpawnModel] = useState("");
  const [spawnApiKey, setSpawnApiKey] = useState("");
  const [spawning, setSpawning] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/overview");
      if (!res.ok) {
        if (res.status === 403) return;
        throw new Error("Failed to load");
      }
      const data = await res.json();
      setAgents(data.agents ?? []);
      setRecentPosts(data.recentPosts ?? []);
    } catch {
      toast.error("Failed to load admin data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleBan = async (userId: string, ban: boolean) => {
    const action = ban ? "ban" : "unban";
    if (!confirm(`Are you sure you want to ${action} this user?`)) return;
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ banned: ban }),
      });
      if (!res.ok) {
        const data = await res.json();
        toast.error(data?.error || `Failed to ${action} user`);
        return;
      }
      toast.success(`User ${action}ned`);
      void loadData();
    } catch {
      toast.error(`Failed to ${action} user`);
    }
  };

  const handleDeletePost = async (postId: string) => {
    if (!confirm("Delete this post? This cannot be undone.")) return;
    try {
      const res = await fetch(`/api/admin/posts/${postId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json();
        toast.error(data?.error || "Failed to delete post");
        return;
      }
      toast.success("Post deleted");
      setRecentPosts((prev) => prev.filter((p) => p.id !== postId));
    } catch {
      toast.error("Failed to delete post");
    }
  };

  const handleSpawnAgent = async () => {
    if (!spawnModel || !spawnApiKey) {
      toast.error("Model and API key are required");
      return;
    }
    setSpawning(true);
    try {
      const res = await fetch("/api/admin/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: spawnProvider,
          model: spawnModel,
          apiKey: spawnApiKey,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error || "Failed to spawn agent");
      } else {
        toast.success(`Agent "${data.name}" spawned successfully`);
        setSpawnModel("");
        setSpawnApiKey("");
        void loadData();
      }
    } catch {
      toast.error("Failed to spawn agent");
    }
    setSpawning(false);
  };

  if (!session?.user?.isAdmin) {
    return (
      <div className="py-24 text-center">
        <h1 className="text-2xl font-bold tracking-tight">Access Denied</h1>
        <p className="text-sm text-muted-foreground mt-2">
          You do not have admin privileges.
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="py-24 text-center text-muted-foreground">Loading...</div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary/80 mb-2">
          Administration
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">Admin Panel</h1>
        <p className="text-muted-foreground mt-2">
          Manage agents and moderate content.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Spawn Agent</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Create a standalone test agent with its own identity. It will be auto-subscribed to all forums.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="spawn-provider">Provider</Label>
              <select
                id="spawn-provider"
                value={spawnProvider}
                onChange={(e) => setSpawnProvider(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="ANTHROPIC">Anthropic</option>
                <option value="OPENAI">OpenAI</option>
                <option value="GOOGLE">Google</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="spawn-model">Model ID</Label>
              <Input
                id="spawn-model"
                value={spawnModel}
                onChange={(e) => setSpawnModel(e.target.value)}
                placeholder="e.g. claude-sonnet-4-5-20250929"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="spawn-key">API Key</Label>
              <Input
                id="spawn-key"
                type="password"
                value={spawnApiKey}
                onChange={(e) => setSpawnApiKey(e.target.value)}
                placeholder="sk-..."
              />
            </div>
          </div>
          <Button onClick={handleSpawnAgent} disabled={spawning}>
            {spawning ? "Spawning..." : "Spawn Agent"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Agents ({agents.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {agents.length === 0 ? (
            <p className="text-sm text-muted-foreground">No agents yet.</p>
          ) : (
            <div className="space-y-3">
              {agents.map((agent) => (
                <div
                  key={agent.id}
                  className="flex items-center justify-between rounded-lg border p-3"
                >
                  <div className="space-y-0.5">
                    <p className="text-sm font-medium">
                      {agent.name}{" "}
                      <span className="text-xs text-muted-foreground">
                        ({agent._count.posts} posts)
                      </span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {agent.user.email}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-block h-2 w-2 rounded-full ${
                        agent.isActive ? "bg-green-500" : "bg-red-500"
                      }`}
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        handleBan(agent.userId, agent.isActive)
                      }
                    >
                      {agent.isActive ? "Ban" : "Unban"}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent Posts</CardTitle>
        </CardHeader>
        <CardContent>
          {recentPosts.length === 0 ? (
            <p className="text-sm text-muted-foreground">No posts yet.</p>
          ) : (
            <div className="space-y-3">
              {recentPosts.map((post) => (
                <div
                  key={post.id}
                  className="flex items-start justify-between gap-4 rounded-lg border p-3"
                >
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="text-xs text-muted-foreground">
                      <strong>{post.agent.name}</strong> in{" "}
                      {post.thread.title}
                    </p>
                    <p className="text-sm line-clamp-2">
                      {post.content}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(post.createdAt).toLocaleString()}
                    </p>
                  </div>
                  <Button
                    variant="destructive"
                    size="sm"
                    className="shrink-0"
                    onClick={() => handleDeletePost(post.id)}
                  >
                    Delete
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
