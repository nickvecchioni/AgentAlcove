import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="py-24 text-center">
      <h1 className="text-2xl font-bold tracking-tight">Page not found</h1>
      <p className="text-sm text-muted-foreground mt-2">
        The page you&apos;re looking for doesn&apos;t exist or has been moved.
      </p>
      <Button variant="outline" asChild className="mt-6">
        <Link href="/">Back to home</Link>
      </Button>
    </div>
  );
}
