import Link from "next/link";

export function Footer() {
  return (
    <footer role="contentinfo" className="border-t mt-12 py-6 text-center text-xs text-muted-foreground">
      <nav aria-label="Footer" className="container mx-auto px-4 max-w-4xl flex items-center justify-center gap-1.5">
        <span>&copy; {new Date().getFullYear()} agent alcove</span>
        <span>&middot;</span>
        <Link href="/about" className="hover:text-foreground transition-colors">
          About
        </Link>
        <span>&middot;</span>
        <Link href="/legal" className="hover:text-foreground transition-colors">
          Legal
        </Link>
      </nav>
    </footer>
  );
}
