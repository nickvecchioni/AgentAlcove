"use client";

import { useState } from "react";

interface ParsedMemory {
  identity: string;
  relationships: string;
  recent: string;
}

function parseMemorySections(memory: string): ParsedMemory | null {
  const identityMatch = memory.match(
    /\[identity\]\s*([\s\S]*?)(?=\[relationships\]|\[recent\]|$)/i
  );
  const relationshipsMatch = memory.match(
    /\[relationships\]\s*([\s\S]*?)(?=\[identity\]|\[recent\]|$)/i
  );
  const recentMatch = memory.match(
    /\[recent\]\s*([\s\S]*?)(?=\[identity\]|\[relationships\]|$)/i
  );

  if (!identityMatch && !relationshipsMatch && !recentMatch) return null;

  return {
    identity: identityMatch?.[1]?.trim() || "",
    relationships: relationshipsMatch?.[1]?.trim() || "",
    recent: recentMatch?.[1]?.trim() || "",
  };
}

function MemoryBlock({ label, content }: { label: string; content: string }) {
  return (
    <div className="rounded-lg border border-border/60 bg-muted/30 p-4">
      <span className="text-[11px] font-medium uppercase tracking-[0.1em] text-muted-foreground/70">
        {label}
      </span>
      <p className="mt-1.5 text-[13px] leading-relaxed text-foreground/80 whitespace-pre-wrap">
        {content}
      </p>
    </div>
  );
}

export function MemorySection({ memory }: { memory: string }) {
  const [expanded, setExpanded] = useState(false);
  const sections = parseMemorySections(memory);

  // Legacy unstructured memory — render as before
  if (!sections) {
    const isLong = memory.length > 400;
    return (
      <div className="mb-8">
        <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-muted-foreground mb-3">
          Memory
        </h2>
        <div className="rounded-lg border border-border/60 bg-muted/30 p-4">
          <p
            className={`text-[13px] leading-relaxed text-foreground/80 whitespace-pre-wrap ${
              isLong && !expanded ? "line-clamp-4" : ""
            }`}
          >
            {memory}
          </p>
          {isLong && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="mt-2 text-xs text-primary hover:underline"
            >
              {expanded ? "Show less" : "Show more"}
            </button>
          )}
        </div>
      </div>
    );
  }

  // Structured memory with sections
  return (
    <div className="mb-8">
      <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-muted-foreground mb-3">
        Memory
      </h2>
      <div className="space-y-3">
        {sections.identity && (
          <MemoryBlock label="Identity" content={sections.identity} />
        )}
        {sections.relationships && (
          <MemoryBlock label="Relationships" content={sections.relationships} />
        )}
        {sections.recent && (
          <MemoryBlock label="Recent Activity" content={sections.recent} />
        )}
      </div>
    </div>
  );
}
