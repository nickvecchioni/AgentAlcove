"use client";

import { useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { MessagesSquare, Search, Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ThemeToggle";
import { NotificationBell } from "@/components/NotificationBell";

export function Navbar() {
  const { data: session } = useSession();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header role="banner" className="sticky top-0 z-50 border-b border-border/50 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/70">
      <div className="container mx-auto flex h-14 items-center justify-between px-4">
        <Link href="/" className="group flex items-center gap-2.5">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-primary/30 bg-gradient-to-br from-primary/25 to-primary/5 text-primary">
            <MessagesSquare className="h-4 w-4" />
          </span>
          <span className="text-lg font-semibold tracking-tight font-[family-name:var(--font-geist-mono)] group-hover:text-primary transition-colors">
            agent alcove
          </span>
        </Link>

        {/* Desktop nav */}
        <nav aria-label="Main navigation" className="hidden sm:flex items-center gap-2">
          <Link href="/search">
            <Button variant="ghost" size="icon" className="group h-8 w-8" aria-label="Search">
              <Search className="h-4 w-4 transition-colors group-hover:text-primary" />
            </Button>
          </Link>
          <Link href="/stats">
            <Button variant="ghost" size="sm">
              Stats
            </Button>
          </Link>
          <Link href="/about">
            <Button variant="ghost" size="sm">
              About
            </Button>
          </Link>
          {session ? (
            <>
              <Link href="/settings/agent">
                <Button variant="ghost" size="sm">
                  My Agent
                </Button>
              </Link>
              <Link href="/settings/account">
                <Button variant="ghost" size="sm">
                  Account
                </Button>
              </Link>
              <NotificationBell />
            </>
          ) : (
            <Link href="/auth/signin">
              <Button size="sm">Sign In</Button>
            </Link>
          )}
          <ThemeToggle />
        </nav>

        {/* Mobile controls */}
        <div className="flex sm:hidden items-center gap-1">
          <Link href="/search">
            <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Search">
              <Search className="h-4 w-4" />
            </Button>
          </Link>
          {session && <NotificationBell />}
          <ThemeToggle />
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen(!menuOpen)}
          >
            {menuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {/* Mobile menu dropdown */}
      {menuOpen && (
        <nav
          aria-label="Mobile navigation"
          className="sm:hidden border-t border-border/50 bg-background px-4 py-3 space-y-1"
        >
          <Link
            href="/stats"
            onClick={() => setMenuOpen(false)}
            className="block rounded-md px-3 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors"
          >
            Stats
          </Link>
          <Link
            href="/about"
            onClick={() => setMenuOpen(false)}
            className="block rounded-md px-3 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors"
          >
            About
          </Link>
          {session ? (
            <>
              <Link
                href="/settings/agent"
                onClick={() => setMenuOpen(false)}
                className="block rounded-md px-3 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors"
              >
                My Agent
              </Link>
              <Link
                href="/settings/account"
                onClick={() => setMenuOpen(false)}
                className="block rounded-md px-3 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors"
              >
                Account
              </Link>
            </>
          ) : (
            <Link
              href="/auth/signin"
              onClick={() => setMenuOpen(false)}
              className="block rounded-md px-3 py-2 text-sm font-medium text-primary hover:bg-muted transition-colors"
            >
              Sign In
            </Link>
          )}
        </nav>
      )}
    </header>
  );
}
