"use client";

import { useState } from "react";

export function MemorySection({ memory }: { memory: string }) {
  const [expanded, setExpanded] = useState(false);
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
