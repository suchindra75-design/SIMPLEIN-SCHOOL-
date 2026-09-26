"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/session";
import {
  createNotice,
  deleteNotice,
  setNoticeAttachment,
  setNoticePublished,
  updateNotice,
} from "@/lib/services/notices";
import {
  markAllNotificationsRead,
  markNotificationRead,
} from "@/lib/services/notifications";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { MAX_HOMEWORK_FILE_BYTES } from "@/lib/services/storage";

/**
 * Notice server actions (admin-only — the matrix gives teachers read-only
 * notice permissions) + shared notification read-state actions (all roles).
 */

export interface ActionState {
  error?: string;
  success?: boolean;
}

function err(error: unknown): ActionState {
  return { error: error instanceof Error ? error.message : "Unexpected error" };
}

function str(form: FormData, key: string): string | undefined {
  const v = form.get(key);
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t === "" ? undefined : t;
}

export async function createNoticeAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const ctx = await requireRole("SCHOOL_ADMIN");
    const db = await createServerSupabaseClient();
    const audienceType = (str(form, "audienceType") ?? "SCHOOL") as
      | "SCHOOL"
      | "CLASS"
      | "SECTION"
      | "TEACHERS"
      | "PARENTS";
    await createNotice(db, ctx, {
      title: str(form, "title") ?? "",
      content: str(form, "content") ?? "",
      category: str(form, "category") ?? "GENERAL",
      audience: {
        type: audienceType,
        classId: str(form, "classId") ?? null,
        sectionId: str(form, "sectionId") ?? null,
      },
      expiresAt: str(form, "expiresAt") ?? null,
    });
    revalidatePath("/admin/notices");
    return { success: true };
  } catch (error) {
    return err(error);
  }
}

export async function updateNoticeAction(
  id: string,
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const ctx = await requireRole("SCHOOL_ADMIN");
    const db = await createServerSupabaseClient();
    await updateNotice(db, ctx, id, {
      title: str(form, "title"),
      content: str(form, "content"),
      category: str(form, "category"),
      expiresAt: str(form, "expiresAt") ?? null,
    });
    revalidatePath("/admin/notices");
    return { success: true };
  } catch (error) {
    return err(error);
  }
}

export async function setNoticePublishedAction(
  id: string,
  published: boolean,
): Promise<ActionState> {
  try {
    const ctx = await requireRole("SCHOOL_ADMIN");
    const db = await createServerSupabaseClient();
    await setNoticePublished(db, ctx, id, published);
    revalidatePath("/admin/notices");
    return { success: true };
  } catch (error) {
    return err(error);
  }
}

export async function deleteNoticeAction(id: string): Promise<ActionState> {
  try {
    const ctx = await requireRole("SCHOOL_ADMIN");
    const db = await createServerSupabaseClient();
    await deleteNotice(db, ctx, id);
    revalidatePath("/admin/notices");
    return { success: true };
  } catch (error) {
    return err(error);
  }
}

/** Restore an archived notice. Admin only, audited. */
export async function restoreNoticeAction(id: string): Promise<ActionState> {
  try {
    const ctx = await requireRole("SCHOOL_ADMIN");
    const db = await createServerSupabaseClient();
    const { error } = await db
      .from("notices")
      .update({ is_active: true })
      .eq("id", id)
      .eq("school_id", ctx.profile.schoolId);
    if (error !== null) return { error: error.message };
    revalidatePath("/admin/notices");
    return { success: true };
  } catch (error) {
    return err(error);
  }
}

export async function uploadNoticeAttachmentAction(
  id: string,
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const ctx = await requireRole("SCHOOL_ADMIN");
    const db = await createServerSupabaseClient();
    const file = form.get("file");
    if (!(file instanceof File)) return { error: "Choose a file" };
    if (file.size > MAX_HOMEWORK_FILE_BYTES) {
      return { error: "File must be under 10 MB" };
    }
    await setNoticeAttachment(db, ctx, id, {
      name: file.name,
      type: file.type,
      size: file.size,
      bytes: await file.arrayBuffer(),
    });
    revalidatePath("/admin/notices");
    return { success: true };
  } catch (error) {
    return err(error);
  }
}

/* -------------------------- notification read state ---------------------- */

export async function markNotificationReadAction(
  id: string,
): Promise<ActionState> {
  try {
    const ctx = await requireRole(["SCHOOL_ADMIN", "TEACHER", "PARENT"]);
    const db = await createServerSupabaseClient();
    await markNotificationRead(db, ctx, id);
    revalidatePath("/notifications");
    return { success: true };
  } catch (error) {
    return err(error);
  }
}

export async function markAllNotificationsReadAction(): Promise<ActionState> {
  try {
    const ctx = await requireRole(["SCHOOL_ADMIN", "TEACHER", "PARENT"]);
    const db = await createServerSupabaseClient();
    await markAllNotificationsRead(db, ctx);
    revalidatePath("/notifications");
    return { success: true };
  } catch (error) {
    return err(error);
  }
}
