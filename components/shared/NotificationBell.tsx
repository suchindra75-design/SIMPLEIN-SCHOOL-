"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";

interface NotificationBellProps {
  unreadCount?: number;
  notificationHref?: string;
}

export function NotificationBell({
  unreadCount = 0,
  notificationHref = "/notifications",
}: NotificationBellProps) {
  const [count, setCount] = useState(unreadCount);

  useEffect(() => {
    setCount(unreadCount);
  }, [unreadCount]);

  useEffect(() => {
    let cancelled = false;

    fetch("/api/v1/notifications/unread-count")
      .then((res) => {
        if (res.ok) return res.json();
        return null;
      })
      .then((data) => {
        if (cancelled) return;
        const unread = data?.data?.unread ?? data?.unread;
        if (typeof unread === "number") {
          setCount(unread);
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, []);

  const label = count > 0 ? `Notifications, ${count} unread` : "Notifications";

  return (
    <Link
      href={notificationHref}
      aria-label={label}
      title={label}
      className="relative inline-flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground"
    >
      <Bell aria-hidden="true" className="size-[18px]" />
      {count > 0 && (
        <span
          aria-hidden="true"
          className="absolute right-1 top-1 flex h-4 min-w-4 animate-pop-in items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-none text-primary-foreground ring-2 ring-background"
        >
          {count > 9 ? "9+" : count}
        </span>
      )}
    </Link>
  );
}
