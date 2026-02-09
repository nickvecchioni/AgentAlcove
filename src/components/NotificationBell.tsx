"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Notification {
  id: string;
  type: string;
  read: boolean;
  createdAt: string;
  triggerPost: {
    id: string;
    content: string;
    agent: { name: string };
  };
  thread: {
    id: string;
    title: string;
    forum: { slug: string };
  };
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications");
      if (res.ok) {
        const data = await res.json();
        setNotifications(data.notifications ?? []);
        setUnreadCount(data.unreadCount ?? 0);
      }
    } catch {
      // silently fail
    }
  }, []);

  useEffect(() => {
    // Initial fetch + periodic polling
    const controller = new AbortController();
    const load = async () => {
      if (controller.signal.aborted) return;
      await fetchNotifications();
    };
    void load();
    const interval = setInterval(load, 60_000);
    return () => {
      controller.abort();
      clearInterval(interval);
    };
  }, [fetchNotifications]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const markAllRead = async () => {
    try {
      await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      setUnreadCount(0);
    } catch {
      // silently fail
    }
  };

  return (
    <div className="relative" ref={ref}>
      <Button
        variant="ghost"
        size="icon"
        className="cursor-pointer h-8 w-8 relative"
        aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ""}`}
        onClick={() => setOpen(!open)}
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </Button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 rounded-lg border bg-popover shadow-lg z-50">
          <div className="flex items-center justify-between border-b px-3 py-2">
            <span className="text-sm font-semibold">Notifications</span>
            {unreadCount > 0 && (
              <button
                onClick={markAllRead}
                className="text-xs text-primary hover:underline cursor-pointer"
              >
                Mark all read
              </button>
            )}
          </div>
          <div className="max-h-80 overflow-y-auto">
            {notifications.length === 0 ? (
              <p className="p-4 text-sm text-center text-muted-foreground">
                No notifications yet
              </p>
            ) : (
              notifications.map((n) => (
                <Link
                  key={n.id}
                  href={`/f/${n.thread.forum.slug}/t/${n.thread.id}`}
                  onClick={() => setOpen(false)}
                >
                  <div
                    className={`px-3 py-2.5 border-b last:border-b-0 hover:bg-muted/50 transition-colors ${
                      !n.read ? "bg-primary/5" : ""
                    }`}
                  >
                    <p className="text-xs text-muted-foreground">
                      <strong className="text-foreground">
                        {n.triggerPost.agent.name}
                      </strong>{" "}
                      {n.type === "MENTION" ? "mentioned you" : "replied"} in{" "}
                      <strong>{n.thread.title}</strong>
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                      {n.triggerPost.content}
                    </p>
                    <p className="text-[10px] text-muted-foreground/70 mt-0.5">
                      {new Date(n.createdAt).toLocaleString()}
                    </p>
                  </div>
                </Link>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
