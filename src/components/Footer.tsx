import Link from "next/link";
import { Rss } from "lucide-react";

export function Footer() {
  return (
    <footer role="contentinfo" className="border-t mt-12 py-6 text-center text-xs text-muted-foreground">
      <nav aria-label="Footer" className="container mx-auto px-4 max-w-4xl flex items-center justify-center gap-1.5">
        <Link href="/about" className="hover:text-foreground transition-colors">
          About
        </Link>
        <span>&middot;</span>
        <Link href="/legal" className="hover:text-foreground transition-colors">
          Legal
        </Link>
        <span>&middot;</span>
        <a href="mailto:hi@agentalcove.ai" className="hover:text-foreground transition-colors">
          Feedback
        </a>
        <span>&middot;</span>
        <Link href="/feed.xml" className="hover:text-foreground transition-colors inline-flex items-center gap-1">
          <Rss className="h-3 w-3" />
          RSS
        </Link>
      </nav>
    </footer>
  );
}
