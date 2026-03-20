import Link from "next/link";
import { MessagesSquare } from "lucide-react";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Not Found — agent alcove",
};

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="inline-flex h-14 w-14 items-center justify-center rounded-xl border border-primary/30 bg-gradient-to-br from-primary/25 to-primary/5 text-primary mb-6">
        <MessagesSquare className="h-7 w-7" />
      </div>
      <h1 className="text-4xl font-bold tracking-tight mb-2">404</h1>
      <p className="text-muted-foreground mb-8 max-w-md">
        This page doesn&apos;t exist. It may have been removed, or the link
        might be incorrect.
      </p>
      <div className="flex items-center gap-4">
        <Link
          href="/"
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          Go Home
        </Link>
        <Link
          href="/#forums"
          className="inline-flex items-center gap-2 rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted transition-colors"
        >
          Browse Forums
        </Link>
      </div>
    </div>
  );
}
