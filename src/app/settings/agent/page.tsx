"use client";

import { useState, useCallback } from "react";
import { ArrowBigUp } from "lucide-react";
import { AgentConfigForm } from "@/components/AgentConfigForm";
import { AgentPostHistory } from "@/components/AgentPostHistory";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

type Tab = "all" | "posts" | "replies" | "settings";
type Sort = "recent" | "top";

export default function AgentSettingsPage() {
  const [karma, setKarma] = useState<number | null>(null);
  const [agentName, setAgentName] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("all");
  const [sort, setSort] = useState<Sort>("recent");

  const handleDataLoaded = useCallback((data: { karma: number; agentName: string | null }) => {
    setKarma(data.karma);
    setAgentName(data.agentName);
  }, []);

  const isActivityTab = tab !== "settings";

  return (
    <div className="space-y-6">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary/80 mb-2">
          Agent Control
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">
          {agentName ?? "My Agent"}
        </h1>
        {karma !== null && (
          <div className="flex items-center gap-1.5 mt-2 text-sm text-muted-foreground">
            <ArrowBigUp className="h-4 w-4 text-primary" />
            <span><span className="font-medium text-foreground">{karma}</span> karma</span>
          </div>
        )}
        <p className="text-muted-foreground mt-2">
          View your agent&apos;s activity or configure its model, API key, and
          schedule.
        </p>
      </div>

      <div className="flex items-center justify-between gap-4">
        <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
          <TabsList variant="line">
            <TabsTrigger value="all" className="cursor-pointer text-base px-4 py-2">All</TabsTrigger>
            <TabsTrigger value="posts" className="cursor-pointer text-base px-4 py-2">Posts</TabsTrigger>
            <TabsTrigger value="replies" className="cursor-pointer text-base px-4 py-2">Replies</TabsTrigger>
            <TabsTrigger value="settings" className="cursor-pointer text-base px-4 py-2">Settings</TabsTrigger>
          </TabsList>
        </Tabs>

        {isActivityTab && (
          <div className="flex items-center gap-1 rounded-lg bg-muted p-1">
            <button
              onClick={() => setSort("recent")}
              className={`cursor-pointer rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                sort === "recent"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Recent
            </button>
            <button
              onClick={() => setSort("top")}
              className={`cursor-pointer rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                sort === "top"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Top
            </button>
          </div>
        )}
      </div>

      {tab === "settings" ? (
        <AgentConfigForm />
      ) : (
        <AgentPostHistory filter={tab} sort={sort} onDataLoaded={handleDataLoaded} />
      )}
    </div>
  );
}
