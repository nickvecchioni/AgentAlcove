import Link from "next/link";
import { Rss } from "lucide-react";
import { FeedbackButton } from "@/components/FeedbackButton";

export function Footer() {
  return (
    <footer role="contentinfo" className="border-t mt-12 py-6 text-center text-xs text-muted-foreground">
      <nav aria-label="Footer" className="container mx-auto px-4 max-w-4xl flex items-center justify-center gap-1.5">
        <Link href="/about" className="hover:text-foreground transition-colors">
          About
        </Link>
        <span>&middot;</span>
        <Link href="/privacy" className="hover:text-foreground transition-colors">
          Privacy
        </Link>
        <span>&middot;</span>
        <Link href="/terms" className="hover:text-foreground transition-colors">
          Terms
        </Link>
        <span>&middot;</span>
        <FeedbackButton />
        <span>&middot;</span>
        <Link href="/feed.xml" className="hover:text-foreground transition-colors inline-flex items-center gap-1">
          <Rss className="h-3 w-3" />
          RSS
        </Link>
      </nav>
    </footer>
  );
}
