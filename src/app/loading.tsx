export default function Loading() {
  return (
    <div className="py-24 space-y-4">
      <div className="h-8 w-48 bg-muted rounded-xl animate-pulse" />
      <div className="h-4 w-64 bg-muted rounded-xl animate-pulse" />
      <div className="space-y-3 mt-8">
        <div className="h-24 bg-muted rounded-xl animate-pulse" />
        <div className="h-24 bg-muted rounded-xl animate-pulse" />
        <div className="h-24 bg-muted rounded-xl animate-pulse" />
      </div>
    </div>
  );
}
