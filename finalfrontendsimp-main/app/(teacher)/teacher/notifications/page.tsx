"use client";

import React, { useState } from "react";
import { useMockStore } from "@/lib/mock-store";
import { AsyncStateWrapper } from "@/components/shared/AsyncStateWrapper";
import { Bell, CheckCheck, FileSpreadsheet, Calendar, Megaphone } from "lucide-react";

export default function TeacherNotificationsPage() {
  const { notifications, markNotificationAsRead, markAllNotificationsAsRead } =
    useMockStore();

  const [filter, setFilter] = useState<"ALL" | "UNREAD">("ALL");

  const teacherNotifications = notifications.filter(
    (n) => n.targetRole === "ALL" || n.targetRole === "teacher"
  );

  const displayed =
    filter === "UNREAD" ? teacherNotifications.filter((n) => !n.read) : teacherNotifications;
  const unreadCount = teacherNotifications.filter((n) => !n.read).length;

  const getIcon = (type: string) => {
    switch (type) {
      case "exam":
        return <FileSpreadsheet className="w-4 h-4 text-zinc-900" />;
      case "attendance":
        return <Calendar className="w-4 h-4 text-zinc-900" />;
      case "notice":
        return <Megaphone className="w-4 h-4 text-zinc-900" />;
      default:
        return <Bell className="w-4 h-4 text-zinc-900" />;
    }
  };

  return (
    <AsyncStateWrapper>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-zinc-200 pb-5">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-zinc-950 font-serif">
              Teacher Notifications & Alerts
            </h1>
            <p className="text-xs text-zinc-500 mt-1">
              Classroom reminders, staff notices, and exam marks timelines
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center rounded border border-zinc-200 bg-white p-1 text-xs">
              <button
                onClick={() => setFilter("ALL")}
                className={`px-3 py-1 rounded font-medium ${
                  filter === "ALL"
                    ? "bg-zinc-950 text-white font-bold"
                    : "text-zinc-600 hover:text-zinc-950"
                }`}
              >
                All ({teacherNotifications.length})
              </button>
              <button
                onClick={() => setFilter("UNREAD")}
                className={`px-3 py-1 rounded font-medium ${
                  filter === "UNREAD"
                    ? "bg-zinc-950 text-white font-bold"
                    : "text-zinc-600 hover:text-zinc-950"
                }`}
              >
                Unread ({unreadCount})
              </button>
            </div>

            {unreadCount > 0 && (
              <button
                onClick={() => markAllNotificationsAsRead()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-zinc-800 bg-white hover:bg-zinc-50 border border-zinc-200 rounded shadow-xs"
              >
                <CheckCheck className="w-3.5 h-3.5 text-zinc-950" />
                Mark All Read
              </button>
            )}
          </div>
        </div>

        <div className="bg-white rounded-lg border border-zinc-200 shadow-xs divide-y divide-zinc-100 overflow-hidden">
          {displayed.length === 0 ? (
            <div className="p-8 text-center text-xs text-zinc-400">
              No notifications at this time.
            </div>
          ) : (
            displayed.map((n) => (
              <div
                key={n.id}
                onClick={() => markNotificationAsRead(n.id)}
                className={`p-4 transition-colors flex items-start gap-4 cursor-pointer ${
                  !n.read ? "bg-zinc-50/80 hover:bg-zinc-100/70" : "hover:bg-zinc-50"
                }`}
              >
                <div className="p-2 rounded bg-zinc-100 border border-zinc-200 shrink-0 mt-0.5">
                  {getIcon(n.type)}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <h3
                      className={`text-xs font-bold ${
                        !n.read ? "text-zinc-950 font-bold" : "text-zinc-700"
                      }`}
                    >
                      {n.title}
                    </h3>
                    <span className="text-[11px] text-zinc-400 shrink-0 font-medium font-mono">
                      {n.timestamp}
                    </span>
                  </div>

                  <p className="text-xs text-zinc-600 mt-1 leading-relaxed">
                    {n.message}
                  </p>
                </div>

                {!n.read && (
                  <span className="w-2 h-2 rounded-full bg-zinc-950 shrink-0 mt-2" />
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </AsyncStateWrapper>
  );
}
