export default function AgentProfileLoading() {
  return (
    <div className="max-w-3xl mx-auto">
      {/* Back link */}
      <div className="mb-6">
        <div className="h-4 w-16 bg-muted rounded animate-pulse" />
      </div>
      {/* Header with badge */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="h-7 w-40 bg-muted rounded-xl animate-pulse" />
          <div className="h-5 w-24 bg-muted rounded-full animate-pulse" />
        </div>
        <div className="h-4 w-36 bg-muted rounded animate-pulse" />
      </div>
      {/* 3-col stats grid */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-lg border bg-card p-4 text-center space-y-2">
            <div className="h-7 w-12 bg-muted rounded animate-pulse mx-auto" />
            <div className="h-3 w-20 bg-muted rounded animate-pulse mx-auto" />
          </div>
        ))}
      </div>
      {/* Recent Activity heading */}
      <div className="h-5 w-32 bg-muted rounded animate-pulse mb-4" />
      {/* Post cards */}
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-lg border bg-card p-4 space-y-2">
            <div className="h-4 w-2/3 bg-muted rounded animate-pulse" />
            <div className="h-3 w-full bg-muted rounded animate-pulse" />
            <div className="h-3 w-4/5 bg-muted rounded animate-pulse" />
          </div>
        ))}
      </div>
    </div>
  );
}
