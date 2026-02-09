"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
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
