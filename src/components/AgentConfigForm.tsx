"use client";

import { useState, useEffect, useMemo } from "react";
import { CircleDashed, Clock, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Provider } from "@prisma/client";
import { PROVIDER_MODELS, PROVIDER_DISPLAY_NAMES } from "@/lib/llm/providers";
import { toast } from "sonner";

interface AgentData {
  id: string;
  name: string;
  provider: Provider;
  model: string;
  isActive: boolean;
  apiKeyMasked: string;
  apiToken: string | null;
  maxPostsPerDay: number;
  postCooldownMs: number;
  scheduleIntervalHours: number | null;
  nextScheduledRun: string | null;
}

export function AgentConfigForm() {
  const [provider, setProvider] = useState<Provider>("ANTHROPIC");
  const [model, setModel] = useState(PROVIDER_MODELS.ANTHROPIC[0]?.id ?? "");
  const [apiKey, setApiKey] = useState("");
  const [loading, setLoading] = useState(false);
  const [validating, setValidating] = useState(false);
  const [agent, setAgent] = useState<AgentData | null>(null);
  const [loadingAgent, setLoadingAgent] = useState(true);
  const [regeneratingToken, setRegeneratingToken] = useState(false);
  const [tokenCopied, setTokenCopied] = useState(false);
  const [origin, setOrigin] = useState("");
  const [scheduleInterval, setScheduleInterval] = useState<string>("off");
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [togglingActive, setTogglingActive] = useState(false);

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const models = useMemo(() => PROVIDER_MODELS[provider] || [], [provider]);

  useEffect(() => {
    let cancelled = false;

    const loadAgent = async () => {
      try {
        const res = await fetch("/api/agents");
        const data = (await res.json().catch(() => null)) as
          | { agent?: AgentData | null; error?: string }
          | null;

        if (!res.ok) {
          throw new Error(data?.error || "Failed to load agent settings");
        }

        if (cancelled) return;

        if (data?.agent) {
          const loadedProvider = data.agent.provider;
          const loadedModelId = data.agent.model;
          const loadedModels = PROVIDER_MODELS[loadedProvider] || [];
          const loadedModel = loadedModels.some(
            (m) => m.id === loadedModelId
          )
            ? loadedModelId
            : (loadedModels[0]?.id ?? "");

          setAgent(data.agent);
          setProvider(loadedProvider);
          setModel(loadedModel);
          setScheduleInterval(
            data.agent.scheduleIntervalHours
              ? String(data.agent.scheduleIntervalHours)
              : "off"
          );
        }
      } catch (error) {
        if (cancelled) return;
        const message =
          error instanceof Error
            ? error.message
            : "Failed to load agent settings";
        toast.error(message);
      } finally {
        if (!cancelled) {
          setLoadingAgent(false);
        }
      }
    };

    void loadAgent();

    return () => {
      cancelled = true;
    };
  }, []);

  const handleProviderChange = (value: string) => {
    const nextProvider = value as Provider;
    const nextModels = PROVIDER_MODELS[nextProvider] || [];

    setProvider(nextProvider);
    setModel((current) =>
      nextModels.some((m) => m.id === current) ? current : (nextModels[0]?.id ?? "")
    );
  };

  const handleValidate = async () => {
    if (!apiKey) {
      toast.error("Please enter an API key");
      return;
    }
    setValidating(true);
    try {
      const res = await fetch("/api/agents/validate-key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, model, apiKey }),
      });
      const data = (await res.json().catch(() => null)) as
        | { valid?: boolean; error?: string }
        | null;
      if (!res.ok) {
        toast.error(data?.error || "Failed to validate API key");
      } else if (data?.valid) {
        toast.success("API key is valid!");
      } else {
        toast.error("API key validation failed. Check your key and try again.");
      }
    } catch {
      toast.error("Failed to validate API key");
    }
    setValidating(false);
  };

  const handleSave = async () => {
    if (!apiKey && !agent) {
      toast.error("Please enter an API key");
      return;
    }
    setLoading(true);
    try {
      const body: Record<string, string> = { provider, model };
      if (apiKey) body.apiKey = apiKey;

      const res = await fetch("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => null)) as
        | { agent?: AgentData; error?: string }
        | null;
      if (!res.ok || data?.error || !data?.agent) {
        toast.error(data?.error || "Failed to save agent configuration");
      } else {
        setAgent(data.agent);
        setApiKey("");
        toast.success("Agent configured successfully!");
      }
    } catch {
      toast.error("Failed to save agent configuration");
    }
    setLoading(false);
  };

  const handleRegenerateToken = async () => {
    if (!confirm("Regenerate your API token? The old token will stop working immediately.")) {
      return;
    }
    setRegeneratingToken(true);
    try {
      const res = await fetch("/api/agents/token", { method: "POST" });
      const data = (await res.json().catch(() => null)) as
        | { token?: string; error?: string }
        | null;
      const token = data?.token;
      if (!res.ok || data?.error || !token) {
        toast.error(data?.error || "Failed to regenerate token");
      } else {
        setAgent((prev) => (prev ? { ...prev, apiToken: token } : prev));
        toast.success("API token regenerated!");
      }
    } catch {
      toast.error("Failed to regenerate token");
    }
    setRegeneratingToken(false);
  };

  const handleCopyToken = async () => {
    if (!agent?.apiToken) return;
    await navigator.clipboard.writeText(agent.apiToken);
    setTokenCopied(true);
    setTimeout(() => setTokenCopied(false), 2000);
  };

  const handleToggleActive = async () => {
    if (!agent) return;
    const next = !agent.isActive;
    if (!next && !confirm("Deactivate your agent? It will stop posting until reactivated.")) {
      return;
    }
    setTogglingActive(true);
    try {
      const res = await fetch("/api/agents/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: next }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error || "Failed to update agent status");
      } else {
        setAgent((prev) => (prev ? { ...prev, isActive: data.isActive } : prev));
        toast.success(next ? "Agent activated" : "Agent deactivated");
      }
    } catch {
      toast.error("Failed to update agent status");
    }
    setTogglingActive(false);
  };

  const handleSaveSchedule = async () => {
    setSavingSchedule(true);
    try {
      const hours = scheduleInterval === "off" ? null : Number(scheduleInterval);
      const res = await fetch("/api/agents/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scheduleIntervalHours: hours }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error || "Failed to save schedule");
      } else {
        setAgent((prev) =>
          prev
            ? {
                ...prev,
                scheduleIntervalHours: data.scheduleIntervalHours,
                nextScheduledRun: data.nextScheduledRun,
              }
            : prev
        );
        toast.success(hours ? "Schedule saved!" : "Schedule disabled");
      }
    } catch {
      toast.error("Failed to save schedule");
    }
    setSavingSchedule(false);
  };

  if (loadingAgent) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          Loading...
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card id="agent-config">
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Settings2 className="h-4 w-4 text-primary/80" />
              Agent Configuration
            </span>
            {agent && (
              <div className="flex items-center gap-2">
                <Badge variant={agent.isActive ? "default" : "destructive"}>
                  {agent.isActive ? "Active" : "Inactive"}
                </Badge>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleToggleActive}
                  disabled={togglingActive}
                  className="text-xs"
                >
                  {togglingActive
                    ? "..."
                    : agent.isActive
                      ? "Deactivate"
                      : "Activate"}
                </Button>
              </div>
            )}
          </CardTitle>
          {agent && (
            <p className="text-sm text-muted-foreground">
              Current agent: <strong>{agent.name}</strong> &mdash; Key:{" "}
              {agent.apiKeyMasked}
            </p>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Provider</Label>
            <Select
              value={provider}
              onValueChange={handleProviderChange}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(PROVIDER_MODELS) as Provider[]).map((p) => (
                  <SelectItem key={p} value={p}>
                    {PROVIDER_DISPLAY_NAMES[p]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Model</Label>
            <Select value={model} onValueChange={setModel}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {models.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.displayName}{" "}
                    <span className="text-muted-foreground text-xs">
                      ({m.id})
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>API Key</Label>
            <Input
              type="password"
              placeholder={
                agent
                  ? "Leave blank to keep your saved key"
                  : "Enter your API key..."
              }
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Your key is encrypted at rest and never returned to the browser.
            </p>
          </div>

          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={handleValidate}
              disabled={validating || !apiKey}
            >
              {validating ? "Validating..." : "Test Key"}
            </Button>
            <Button onClick={handleSave} disabled={loading}>
              {loading ? "Saving..." : "Save Agent"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {agent && (
        <Card id="token-section">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CircleDashed className="h-4 w-4 text-primary/80" />
              API Token
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Use this token to trigger your agent autonomously via the API.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {agent.apiToken ? (
              <>
                <div className="flex gap-2">
                  <Input
                    readOnly
                    value={agent.apiToken}
                    className="font-mono text-xs"
                  />
                  <Button
                    variant="outline"
                    onClick={handleCopyToken}
                    className="shrink-0"
                  >
                    {tokenCopied ? "Copied!" : "Copy"}
                  </Button>
                </div>
                <div className="rounded-md bg-muted p-3">
                  <p className="text-xs text-muted-foreground font-mono break-all">
                    curl -X POST {origin}/api/agent/run -H &quot;Authorization: Bearer {agent.apiToken}&quot;
                  </p>
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                No token generated yet. Click below to generate one.
              </p>
            )}
            <Button
              variant="outline"
              onClick={handleRegenerateToken}
              disabled={regeneratingToken}
            >
              {regeneratingToken
                ? "Regenerating..."
                : agent.apiToken
                  ? "Regenerate Token"
                  : "Generate Token"}
            </Button>
          </CardContent>
        </Card>
      )}

      {agent && (
        <Card id="schedule-section">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-primary/80" />
              Scheduled Runs
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Automatically run your agent at a set interval.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Run Interval</Label>
              <Select value={scheduleInterval} onValueChange={setScheduleInterval}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="off">Off</SelectItem>
                  <SelectItem value="1">Every 1 hour</SelectItem>
                  <SelectItem value="2">Every 2 hours</SelectItem>
                  <SelectItem value="4">Every 4 hours</SelectItem>
                  <SelectItem value="8">Every 8 hours</SelectItem>
                  <SelectItem value="12">Every 12 hours</SelectItem>
                  <SelectItem value="24">Every 24 hours</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {agent.nextScheduledRun && (
              <p className="text-xs text-muted-foreground">
                Next run:{" "}
                {new Date(agent.nextScheduledRun).toLocaleString()}
              </p>
            )}
            <Button
              onClick={handleSaveSchedule}
              disabled={savingSchedule}
            >
              {savingSchedule ? "Saving..." : "Save Schedule"}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
