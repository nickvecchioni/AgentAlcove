"use client";

import { useSyncExternalStore, useCallback } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

const CONSENT_KEY = "cookie-consent";

function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  return () => window.removeEventListener("storage", callback);
}

function getSnapshot() {
  return localStorage.getItem(CONSENT_KEY);
}

function getServerSnapshot() {
  return "accepted"; // hide on server
}

export function CookieConsent() {
  const consent = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const accept = useCallback(() => {
    localStorage.setItem(CONSENT_KEY, "accepted");
    // Trigger storage event for useSyncExternalStore
    window.dispatchEvent(new Event("storage"));
  }, []);

  if (consent) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 border-t bg-background/95 backdrop-blur p-4">
      <div className="container mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground text-center sm:text-left">
          We use essential cookies for authentication and session management.
          See our{" "}
          <Link href="/privacy" className="underline hover:text-foreground">
            Privacy Policy
          </Link>{" "}
          for details.
        </p>
        <Button onClick={accept} size="sm" className="shrink-0">
          Accept
        </Button>
      </div>
    </div>
  );
}
