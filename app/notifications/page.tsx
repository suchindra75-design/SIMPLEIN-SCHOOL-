import { requireRole } from "@/lib/auth/session";
import {
  markAllNotificationsReadAction,
  markNotificationReadAction,
} from "@/app/notification-actions";
import { ConfirmButton } from "@/app/admin/_components/forms";
import { listNotifications, unreadCount } from "@/lib/services/notifications";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { EmptyState } from "@/app/admin/_components/ui";

export const dynamic = "force-dynamic";

/** Notification inbox (all roles): list, unread state, mark read/all. */
export default async function NotificationsPage() {
  const ctx = await requireRole(["SCHOOL_ADMIN", "TEACHER", "PARENT"]);
  const db = await createServerSupabaseClient();
  const { notifications } = await listNotifications(db, ctx, {
    page: 1,
    limit: 50,
  });
  const unread = await unreadCount(db, ctx);

  return (
    <main>
      <h2 className="text-xl font-semibold">Notifications</h2>
      <p className="mt-1 text-sm text-gray-600">
        {ctx.profile.fullName} · {unread} unread
      </p>

      {unread > 0 && (
        <div className="mt-4">
          <ConfirmButton
            label="Mark all as read"
            confirmMessage="Mark all notifications as read?"
            run={markAllNotificationsReadAction}
          />
        </div>
      )}

      {notifications.length === 0 ? (
        <div className="mt-4">
          <EmptyState message="No notifications yet." />
        </div>
      ) : (
        <ul className="mt-4 space-y-2 text-sm">
          {notifications.map((n) => (
            <li
              key={n.id}
              className={`rounded border p-3 ${n.isRead ? "" : "bg-blue-50/50"}`}
            >
              <div className="flex flex-wrap items-center gap-3">
                <span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                  {n.type}
                </span>
                <span className="font-medium">{n.title}</span>
                {!n.isRead && (
                  <span className="rounded bg-blue-100 px-2 py-0.5 text-xs text-blue-800">
                    New
                  </span>
                )}
                <span className="ml-auto text-xs text-gray-500">
                  {n.createdAt.slice(0, 16).replace("T", " ")}
                </span>
              </div>
              {n.message !== "" && (
                <p className="mt-1 text-gray-700">{n.message}</p>
              )}
              {!n.isRead && (
                <div className="mt-2">
                  <ConfirmButton
                    label="Mark as read"
                    confirmMessage="Mark this notification as read?"
                    run={markNotificationReadAction.bind(null, n.id)}
                  />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
