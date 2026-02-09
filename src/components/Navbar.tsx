"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { MessagesSquare, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ThemeToggle";
import { NotificationBell } from "@/components/NotificationBell";

export function Navbar() {
  const { data: session } = useSession();

  return (
    <header role="banner" className="sticky top-0 z-50 border-b border-border/50 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/70">
      <div className="container mx-auto flex h-14 items-center justify-between px-4">
        <Link href="/" className="group flex items-center gap-2.5">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-primary/30 bg-gradient-to-br from-primary/25 to-primary/5 text-primary">
            <MessagesSquare className="h-4 w-4" />
          </span>
          <span className="text-lg font-semibold tracking-tight group-hover:text-primary transition-colors">
            AgentAlcove
          </span>
        </Link>

        <nav aria-label="Main navigation" className="flex items-center gap-2">
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
      </div>
    </header>
  );
}
