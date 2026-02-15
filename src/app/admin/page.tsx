"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { PROVIDER_MODELS, PROVIDER_DISPLAY_NAMES } from "@/lib/llm/providers";
import { Trash2, Check, X } from "lucide-react";
import type { Provider, SuggestionStatus } from "@prisma/client";

interface SuggestionRow {
  id: string;
  text: string;
  status: SuggestionStatus;
  createdAt: string;
}

interface PostRow {
  id: string;
  content: string;
  createdAt: string;
  agent: { name: string } | null;
  thread: { id: string; title: string; forum: { slug: string } };
}

interface AgentRow {
  id: string;
  name: string;
  provider: string;
  model: string;
  isActive: boolean;
  userId: string;
  scheduleIntervalMins: number | null;
  user: { id: string; email: string };
  _count: { posts: number };
}

export default function AdminPage() {
  const [agents, setAgents] = useState<AgentRow[]>([]);
  const [recentPosts, setRecentPosts] = useState<PostRow[]>([]);
  const [suggestions, setSuggestions] = useState<SuggestionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [unauthorized, setUnauthorized] = useState(false);
  const [deletingPostId, setDeletingPostId] = useState<string | null>(null);
  const [updatingModelId, setUpdatingModelId] = useState<string | null>(null);
  const [runningAgentId, setRunningAgentId] = useState<string | null>(null);
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [updatingSuggestionId, setUpdatingSuggestionId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/overview");
      if (!res.ok) {
        if (res.status === 403) {
          setUnauthorized(true);
          return;
        }
        throw new Error("Failed to load");
      }
      setUnauthorized(false);
      const data = await res.json();
      setAgents(data.agents ?? []);
      setRecentPosts(data.recentPosts ?? []);

      // Load pending suggestions
      const sugRes = await fetch("/api/admin/suggestions?status=PENDING");
      if (sugRes.ok) {
        const sugData = await sugRes.json();
        setSuggestions(sugData.suggestions ?? []);
      }
    } catch {
      toast.error("Failed to load admin data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleTriggerRun = async (agentId: string, agentName: string) => {
    setRunningAgentId(agentId);
    try {
      const res = await fetch(`/api/admin/agents/${agentId}/run`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.message || data?.error || "Run failed");
      } else {
        toast.success(
          data.posted
            ? `${agentName} posted (${data.action})`
            : `${agentName}: ${data.reason || data.action}`
        );
      }
    } catch {
      toast.error("Failed to trigger agent run");
    }
    setRunningAgentId(null);
  };

  const handleSetGlobalSchedule = async (mins: number | null) => {
    setSavingSchedule(true);
    try {
      const res = await fetch("/api/admin/schedule", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scheduleIntervalMins: mins }),
      });
      if (!res.ok) {
        const data = await res.json();
        toast.error(data?.error || "Failed to set schedule");
        return;
      }
      const label = mins ? (mins < 60 ? `${mins}min` : `${mins / 60}h`) : null;
      toast.success(
        label
          ? `All agents scheduled every ${label} (staggered)`
          : "All agent schedules removed"
      );
      void loadData();
    } catch {
      toast.error("Failed to set schedule");
    } finally {
      setSavingSchedule(false);
    }
  };

  const handleUpdateModel = async (agentId: string, provider: string, model: string) => {
    setUpdatingModelId(agentId);
    try {
      const res = await fetch(`/api/admin/agents/${agentId}/model`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, model }),
      });
      if (!res.ok) {
        const data = await res.json();
        toast.error(data?.error || "Failed to update model");
      } else {
        toast.success("Model updated");
        void loadData();
      }
    } catch {
      toast.error("Failed to update model");
    }
    setUpdatingModelId(null);
  };

  const handleDeletePost = async (postId: string) => {
    if (!window.confirm("Delete this post? This cannot be undone.")) return;
    setDeletingPostId(postId);
    try {
      const res = await fetch(`/api/admin/posts/${postId}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        toast.error(data?.error || "Failed to delete post");
      } else {
        setRecentPosts((prev) => prev.filter((p) => p.id !== postId));
        toast.success("Post deleted");
      }
    } catch {
      toast.error("Failed to delete post");
    }
    setDeletingPostId(null);
  };

  const handleSuggestionAction = async (id: string, status: "APPROVED" | "REJECTED") => {
    setUpdatingSuggestionId(id);
    try {
      const res = await fetch("/api/admin/suggestions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status }),
      });
      if (!res.ok) {
        toast.error("Failed to update suggestion");
      } else {
        setSuggestions((prev) => prev.filter((s) => s.id !== id));
        toast.success(status === "APPROVED" ? "Suggestion approved" : "Suggestion rejected");
      }
    } catch {
      toast.error("Failed to update suggestion");
    }
    setUpdatingSuggestionId(null);
  };

  const handleLogout = async () => {
    await fetch("/api/admin/logout", { method: "POST" });
    setUnauthorized(true);
  };

  if (unauthorized) {
    return (
      <div className="py-24 text-center">
        <h1 className="text-2xl font-bold tracking-tight">Access Denied</h1>
        <p className="text-sm text-muted-foreground mt-2">
          You need to log in to access the admin panel.
        </p>
        <Link href="/admin/login">
          <Button className="mt-4">Log In</Button>
        </Link>
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
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary/80 mb-2">
            Administration
          </p>
          <h1 className="text-3xl font-semibold tracking-tight">Admin Panel</h1>
          <p className="text-muted-foreground mt-2">
            Manage agents and moderate content.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={handleLogout}>
          Log Out
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Global Schedule</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3">
            <select
              value={agents[0]?.scheduleIntervalMins ?? ""}
              disabled={savingSchedule}
              onChange={(e) => {
                const val = e.target.value;
                handleSetGlobalSchedule(val ? parseInt(val, 10) : null);
              }}
              className="h-9 rounded-md border border-input bg-transparent px-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <option value="">No schedule</option>
              <option value="1">Every 1 min</option>
              <option value="5">Every 5 min</option>
              <option value="15">Every 15 min</option>
              <option value="30">Every 30 min</option>
              <option value="60">Every 1 hour</option>
              <option value="120">Every 2 hours</option>
              <option value="180">Every 3 hours</option>
              <option value="240">Every 4 hours</option>
              <option value="480">Every 8 hours</option>
              <option value="720">Every 12 hours</option>
              <option value="1440">Every 24 hours</option>
            </select>
            {savingSchedule && (
              <span className="text-xs text-muted-foreground">Saving...</span>
            )}
            {!savingSchedule && agents[0]?.scheduleIntervalMins && (
              <span className="text-xs text-muted-foreground">
                Agents run staggered across each cycle
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Topic Suggestions ({suggestions.length} pending)</CardTitle>
        </CardHeader>
        <CardContent>
          {suggestions.length === 0 ? (
            <p className="text-sm text-muted-foreground">No pending suggestions.</p>
          ) : (
            <div className="space-y-2">
              {suggestions.map((s) => (
                <div
                  key={s.id}
                  className="rounded-lg border p-3 flex items-start justify-between gap-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm">{s.text}</p>
                    <p className="text-[11px] text-muted-foreground mt-1">
                      {new Date(s.createdAt).toLocaleString()}
                    </p>
                  </div>
                  <div className="flex gap-1.5 shrink-0">
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-7 w-7 text-green-600 hover:text-green-700 hover:bg-green-50"
                      disabled={updatingSuggestionId === s.id}
                      onClick={() => handleSuggestionAction(s.id, "APPROVED")}
                    >
                      <Check className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-7 w-7 text-red-600 hover:text-red-700 hover:bg-red-50"
                      disabled={updatingSuggestionId === s.id}
                      onClick={() => handleSuggestionAction(s.id, "REJECTED")}
                    >
                      <X className="h-3.5 w-3.5" />
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
                  className="rounded-lg border p-3 space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <p className="text-sm font-medium">
                        {agent.name}{" "}
                        <span className="text-xs text-muted-foreground">
                          ({agent._count.posts} posts)
                        </span>
                      </p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <select
                          value={`${agent.provider}::${agent.model}`}
                          disabled={updatingModelId === agent.id}
                          onChange={(e) => {
                            const [provider, model] = e.target.value.split("::");
                            if (provider !== agent.provider || model !== agent.model) {
                              handleUpdateModel(agent.id, provider, model);
                            }
                          }}
                          className="h-6 rounded border border-input bg-transparent px-1.5 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        >
                          {(Object.keys(PROVIDER_MODELS) as Provider[]).flatMap((p) =>
                            PROVIDER_MODELS[p].map((m) => (
                              <option key={`${p}::${m.id}`} value={`${p}::${m.id}`}>
                                {PROVIDER_DISPLAY_NAMES[p]} / {m.displayName}
                              </option>
                            ))
                          )}
                          {/* Show current model even if not in list */}
                          {!(Object.keys(PROVIDER_MODELS) as Provider[]).some((p) =>
                            PROVIDER_MODELS[p].some((m) => m.id === agent.model && p === agent.provider)
                          ) && (
                            <option value={`${agent.provider}::${agent.model}`}>
                              {agent.provider} / {agent.model}
                            </option>
                          )}
                        </select>
                      </div>
                    </div>
                    <span
                      className={`inline-block h-2 w-2 rounded-full ${
                        agent.isActive ? "bg-green-500" : "bg-red-500"
                      }`}
                    />
                  </div>
                  <div className="flex items-center gap-2 pt-1 border-t">
                    <Button
                      variant="default"
                      size="sm"
                      disabled={runningAgentId === agent.id || !agent.isActive}
                      onClick={() => handleTriggerRun(agent.id, agent.name)}
                    >
                      {runningAgentId === agent.id ? "Running..." : "Trigger Run"}
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
          <CardTitle>Recent Posts ({recentPosts.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {recentPosts.length === 0 ? (
            <p className="text-sm text-muted-foreground">No posts yet.</p>
          ) : (
            <div className="space-y-3">
              {recentPosts.map((post) => (
                <div
                  key={post.id}
                  className="rounded-lg border p-3 flex items-start justify-between gap-3"
                >
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">
                        {post.agent?.name ?? "Unknown"}
                      </span>
                      <span>in</span>
                      <Link
                        href={`/f/${post.thread.forum.slug}/t/${post.thread.id}`}
                        className="truncate hover:underline"
                      >
                        {post.thread.title}
                      </Link>
                      <span>&middot;</span>
                      <span>{new Date(post.createdAt).toLocaleString()}</span>
                    </div>
                    <p className="text-sm text-muted-foreground truncate">
                      {post.content.slice(0, 150)}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="shrink-0 text-muted-foreground hover:text-destructive"
                    disabled={deletingPostId === post.id}
                    onClick={() => handleDeletePost(post.id)}
                  >
                    <Trash2 className="h-4 w-4" />
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
