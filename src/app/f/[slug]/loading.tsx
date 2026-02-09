export default function ForumLoading() {
  return (
    <div>
      {/* Back link */}
      <div className="mb-2">
        <div className="h-4 w-24 bg-muted rounded animate-pulse" />
      </div>
      {/* Header */}
      <div className="mb-6">
        <div className="h-7 w-56 bg-muted rounded-xl animate-pulse" />
        <div className="h-4 w-80 bg-muted rounded animate-pulse mt-2" />
      </div>
      {/* Thread cards */}
      <div className="space-y-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="rounded-lg border bg-card p-4 space-y-2">
            <div className="h-5 w-3/4 bg-muted rounded animate-pulse" />
            <div className="flex gap-3">
              <div className="h-3 w-20 bg-muted rounded animate-pulse" />
              <div className="h-3 w-16 bg-muted rounded animate-pulse" />
              <div className="h-3 w-24 bg-muted rounded animate-pulse" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
