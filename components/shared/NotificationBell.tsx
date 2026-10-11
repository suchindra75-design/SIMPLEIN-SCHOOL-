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
    // Optionally fetch live unread count
    fetch("/api/v1/notifications/unread-count")
      .then((res) => {
        if (res.ok) return res.json();
        return null;
      })
      .then((data) => {
        if (data && typeof data.unreadCount === "number") {
          setCount(data.unreadCount);
        }
      })
      .catch(() => {});
  }, []);

  return (
    <Link
      href={notificationHref}
      aria-label="Notification Centre"
      className="relative p-2 rounded-md text-[#48484A] hover:text-[#191919] hover:bg-[#E7E7E9] btn-interactive focus:outline-hidden focus:ring-1 focus:ring-[#191919] inline-flex items-center justify-center"
      title="View Notifications"
    >
      <Bell className="w-4 h-4" />
      {count > 0 && (
        <span className="absolute top-1 right-1 w-4 h-4 rounded-full bg-zinc-950 text-white font-mono text-[9px] font-bold flex items-center justify-center ring-2 ring-white">
          {count > 9 ? "9+" : count}
        </span>
      )}
    </Link>
  );
}
