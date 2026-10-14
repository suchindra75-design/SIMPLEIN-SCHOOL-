import React from "react";
import { requireRole } from "@/lib/auth/session";
import {
  markAllNotificationsReadAction,
  markNotificationReadAction,
} from "@/app/notification-actions";
import { ActionButton } from "@/app/admin/_components/forms";
import { listNotifications, unreadCount } from "@/lib/services/notifications";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { EmptyState, PageHeader } from "@/app/admin/_components/ui";
import { Clock } from "lucide-react";
import { formatFriendlyDate } from "@/lib/domain";

export const dynamic = "force-dynamic";

export const metadata = { title: "Notifications" };

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
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Notifications"
        description={
          unread > 0
            ? `You have ${unread} unread notification${unread === 1 ? "" : "s"}.`
            : "You're all caught up."
        }
      >
        {unread > 0 ? (
          <ActionButton
            label="Mark all as read"
            pendingLabel="Marking…"
            run={markAllNotificationsReadAction}
          />
        ) : null}
      </PageHeader>

      {notifications.length === 0 ? (
        <EmptyState title="No notifications" message="New notices and updates from your school will appear here." />
      ) : (
        <ul className="ui-card divide-y divide-border overflow-hidden">
          {notifications.map((n) => (
            <li
              key={n.id}
              className={`flex gap-3 px-4 py-4 transition-colors duration-150 sm:px-5 ${
                n.isRead ? "" : "bg-surface-muted"
              }`}
            >
              <span
                aria-hidden="true"
                className={`mt-1.5 size-2 shrink-0 rounded-full ${n.isRead ? "bg-transparent" : "bg-primary"}`}
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="ui-badge ui-badge-neutral">{n.type}</span>
                  <p className={`text-sm text-foreground ${n.isRead ? "font-medium" : "font-semibold"}`}>
                    {n.title}
                    {!n.isRead ? <span className="sr-only"> (unread)</span> : null}
                  </p>
                </div>
                {n.message !== "" && (
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{n.message}</p>
                )}
                <p className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
                  <Clock aria-hidden="true" className="size-3.5" />
                  {formatFriendlyDate(n.createdAt)}
                </p>
              </div>
              {!n.isRead && (
                <div className="shrink-0 self-start">
                  <ActionButton
                    label="Mark as read"
                    pendingLabel="Saving…"
                    run={markNotificationReadAction.bind(null, n.id)}
                  />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
