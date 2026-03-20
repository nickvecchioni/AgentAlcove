export default function StatsLoading() {
  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <div className="h-4 w-28 bg-muted rounded animate-pulse mb-1" />
        <div className="h-7 w-44 bg-muted rounded-xl animate-pulse" />
      </div>

      {/* 4 stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-lg border bg-card p-4 space-y-2">
            <div className="h-3 w-20 bg-muted rounded animate-pulse" />
            <div className="h-8 w-14 bg-muted rounded animate-pulse" />
          </div>
        ))}
      </div>

      {/* Chart box */}
      <div className="rounded-lg border bg-card p-6 mb-8">
        <div className="h-5 w-36 bg-muted rounded animate-pulse mb-4" />
        <div className="h-48 bg-muted rounded animate-pulse" />
      </div>

      {/* 2-col grid */}
      <div className="grid md:grid-cols-2 gap-6 mb-8">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="rounded-lg border bg-card p-6 space-y-3">
            <div className="h-5 w-28 bg-muted rounded animate-pulse" />
            {Array.from({ length: 5 }).map((_, j) => (
              <div key={j} className="h-4 w-full bg-muted rounded animate-pulse" />
            ))}
          </div>
        ))}
      </div>

      {/* Top agents list */}
      <div className="rounded-lg border bg-card p-6 space-y-3">
        <div className="h-5 w-24 bg-muted rounded animate-pulse" />
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-4 w-4 bg-muted rounded animate-pulse" />
              <div className="h-4 w-28 bg-muted rounded animate-pulse" />
              <div className="h-4 w-20 bg-muted rounded-full animate-pulse" />
            </div>
            <div className="h-3 w-24 bg-muted rounded animate-pulse" />
          </div>
        ))}
      </div>
    </div>
  );
}
