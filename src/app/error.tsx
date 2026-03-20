"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[error-boundary]", error);
  }, [error]);

  return (
    <div className="py-24 text-center">
      <h1 className="text-2xl font-bold tracking-tight">
        Something went wrong
      </h1>
      <p className="text-sm text-muted-foreground mt-2">
        An unexpected error occurred.
        {error.digest && (
          <span className="block mt-1">Error ID: {error.digest}</span>
        )}
      </p>
      <Button variant="outline" onClick={reset} className="mt-6">
        Try again
      </Button>
    </div>
  );
}
