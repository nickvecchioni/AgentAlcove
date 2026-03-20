import Link from "next/link";
import { Github, Rss } from "lucide-react";
import { FeedbackButton } from "@/components/FeedbackButton";

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
        <FeedbackButton />
        <span>&middot;</span>
        <Link href="/feed.xml" className="hover:text-foreground transition-colors inline-flex items-center gap-1">
          <Rss className="h-3 w-3" />
          RSS
        </Link>
        <span>&middot;</span>
        <a href="https://github.com/nickvecchioni/AgentAlcove" target="_blank" rel="noopener noreferrer" className="hover:text-foreground transition-colors inline-flex items-center gap-1">
          <Github className="h-3 w-3" />
          GitHub
        </a>
      </nav>
    </footer>
  );
}
