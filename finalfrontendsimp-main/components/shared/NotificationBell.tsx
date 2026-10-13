"use client";

import React, { useState, useRef, useEffect } from "react";
import { Bell, CheckCheck, X } from "lucide-react";
import { useMockStore } from "@/lib/mock-store";

export function NotificationBell() {
  const { notifications, role, markNotificationAsRead, markAllNotificationsAsRead } =
    useMockStore();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const relevantNotifs = notifications.filter(
    (n) => n.targetRole === "ALL" || n.targetRole === role
  );
  const unreadCount = relevantNotifs.filter((n) => !n.read).length;

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={containerRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        aria-label="Notification Centre"
        className="relative p-2 rounded-md text-zinc-700 hover:text-zinc-950 hover:bg-zinc-100 transition-colors focus:outline-none focus:ring-1 focus:ring-zinc-950"
      >
        <Bell className="w-4 h-4" />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 w-4 h-4 rounded-full bg-zinc-950 text-white font-mono text-[9px] font-bold flex items-center justify-center ring-2 ring-white">
            {unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white rounded-lg shadow-lg border border-zinc-200 z-50 overflow-hidden">
          <div className="p-3 border-b border-zinc-100 flex items-center justify-between bg-zinc-50">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-zinc-900">Notifications</span>
              {unreadCount > 0 && (
                <span className="px-1.5 py-0.5 text-[10px] font-mono font-bold bg-zinc-900 text-white rounded">
                  {unreadCount} new
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <button
                  onClick={() => markAllNotificationsAsRead()}
                  className="text-[11px] text-zinc-700 hover:text-zinc-950 font-medium inline-flex items-center gap-1"
                >
                  <CheckCheck className="w-3 h-3" />
                  Mark all read
                </button>
              )}
              <button
                onClick={() => setIsOpen(false)}
                className="text-zinc-400 hover:text-zinc-600 p-0.5"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div className="max-h-80 overflow-y-auto divide-y divide-zinc-100 text-xs">
            {relevantNotifs.length === 0 ? (
              <div className="p-6 text-center text-zinc-400">
                No notifications at this time
              </div>
            ) : (
              relevantNotifs.map((n) => (
                <div
                  key={n.id}
                  onClick={() => markNotificationAsRead(n.id)}
                  className={`p-3 transition-colors cursor-pointer flex gap-3 ${
                    !n.read ? "bg-zinc-50/80 hover:bg-zinc-100/70" : "hover:bg-zinc-50"
                  }`}
                >
                  <div
                    className={`mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 ${
                      !n.read ? "bg-zinc-950" : "bg-transparent"
                    }`}
                  />
                  <div className="flex-1">
                    <p className={`font-medium ${!n.read ? "text-zinc-950 font-bold" : "text-zinc-700"}`}>
                      {n.title}
                    </p>
                    <p className="text-zinc-500 mt-0.5 text-[11px] leading-relaxed">
                      {n.message}
                    </p>
                    <span className="text-[10px] text-zinc-400 mt-1 block font-mono">
                      {n.timestamp}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
