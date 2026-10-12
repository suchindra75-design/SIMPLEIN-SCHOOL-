import React from "react";
import { requireRole } from "@/lib/auth/session";
import {
  markAllNotificationsReadAction,
  markNotificationReadAction,
} from "@/app/notification-actions";
import { ConfirmButton } from "@/app/admin/_components/forms";
import { listNotifications, unreadCount } from "@/lib/services/notifications";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { EmptyState } from "@/app/admin/_components/ui";
import { Bell, CheckCheck, Clock } from "lucide-react";
import { formatFriendlyDate } from "@/lib/domain";

export const dynamic = "force-dynamic";

/** Notification inbox (all roles): list, unread state, mark read/all. */
export default async function NotificationsPage() {
  const ctx = await requireRole(["SCHOOL_ADMIN", "TEACHER", "PARENT", "STUDENT"]);
  const db = await createServerSupabaseClient();
  const [{ notifications }, unread] = await Promise.all([
    listNotifications(db, ctx, {
      page: 1,
      limit: 50,
    }).catch(() => ({ notifications: [], total: 0 })),
    unreadCount(db, ctx).catch(() => 0),
  ]);

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-zinc-200 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <Bell className="w-5 h-5 text-zinc-950" />
            <h1 className="text-xl font-bold tracking-tight text-zinc-950 font-serif">
              Notification Centre
            </h1>
          </div>
          <p className="text-xs text-zinc-500 font-mono mt-1">
            {ctx.profile.fullName} • {unread} unread dispatch{unread === 1 ? "" : "es"}
          </p>
        </div>

        {unread > 0 && (
          <div>
            <ConfirmButton
              label="Mark All as Read"
              confirmMessage="Mark all notifications as read?"
              run={markAllNotificationsReadAction}
            />
          </div>
        )}
      </div>

      {notifications.length === 0 ? (
        <EmptyState message="No notifications in your inbox at this time." />
      ) : (
        <div className="space-y-3">
          {notifications.map((n) => (
            <div
              key={n.id}
              className={`rounded-lg border p-4 transition-colors ${
                n.isRead
                  ? "bg-white border-zinc-200 text-zinc-700"
                  : "bg-zinc-50/90 border-zinc-900/30 text-zinc-950 shadow-2xs"
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded bg-zinc-100 text-zinc-800 font-mono text-[10px] font-semibold border border-zinc-200 uppercase">
                    {n.type}
                  </span>
                  <span className="font-bold text-xs text-zinc-950 font-serif">
                    {n.title}
                  </span>
                  {!n.isRead && (
                    <span className="w-2 h-2 rounded-full bg-zinc-950" />
                  )}
                </div>
                <span className="text-[10px] text-zinc-400 font-mono flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {formatFriendlyDate(n.createdAt)}
                </span>
              </div>

              {n.message !== "" && (
                <p className="text-xs text-zinc-600 leading-relaxed font-sans">{n.message}</p>
              )}

              {!n.isRead && (
                <div className="mt-3 pt-2 border-t border-zinc-100 flex justify-end">
                  <ConfirmButton
                    label="Mark as read"
                    confirmMessage="Mark this notification as read?"
                    run={markNotificationReadAction.bind(null, n.id)}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
