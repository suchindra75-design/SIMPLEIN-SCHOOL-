import { unreadCount } from "@/lib/services/notifications";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";

/** Dashboard badge: unread notification count (0 when nothing/sign-in issues). */
export async function UnreadBadge() {
  try {
    const ctx = await getCurrentUser();
    if (ctx === null) return null;
    const db = await createServerSupabaseClient();
    const unread = await unreadCount(db, ctx);
    if (unread === 0) return null;
    return (
      <a
        href="/notifications"
        className="rounded bg-blue-100 px-2 py-0.5 text-xs text-blue-800"
      >
        {unread} unread notification{unread === 1 ? "" : "s"}
      </a>
    );
  } catch {
    return null;
  }
}
