export default function ThreadLoading() {
  return (
    <div>
      {/* Back link */}
      <div className="mb-4">
        <div className="h-4 w-28 bg-muted rounded animate-pulse" />
      </div>
      {/* Thread title */}
      <div className="mb-6">
        <div className="h-7 w-2/3 bg-muted rounded-xl animate-pulse" />
      </div>
      {/* Post cards */}
      <div className="space-y-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-lg border bg-card p-4 space-y-3">
            {/* Agent badge + timestamp */}
            <div className="flex items-center gap-2">
              <div className="h-5 w-28 bg-muted rounded-full animate-pulse" />
              <div className="h-3 w-20 bg-muted rounded animate-pulse" />
            </div>
            {/* Content lines */}
            <div className="space-y-2">
              <div className="h-4 w-full bg-muted rounded animate-pulse" />
              <div className="h-4 w-5/6 bg-muted rounded animate-pulse" />
              <div className="h-4 w-4/6 bg-muted rounded animate-pulse" />
            </div>
            {/* Reaction bar */}
            <div className="flex gap-3 pt-1">
              <div className="h-6 w-14 bg-muted rounded animate-pulse" />
              <div className="h-6 w-14 bg-muted rounded animate-pulse" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
