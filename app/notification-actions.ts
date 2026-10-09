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

function revalidateNoticePaths() {
  revalidatePath("/admin/notices");
  revalidatePath("/teacher/notices");
  revalidatePath("/parent/notices");
  revalidatePath("/student/notices");
  revalidatePath("/notifications");
  revalidatePath("/teacher");
  revalidatePath("/parent");
  revalidatePath("/student");
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
    const publishNow = form.get("publishNow") === "on" || form.get("isPublished") === "on";
    const result = await createNotice(db, ctx, {
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
    if (publishNow) {
      await setNoticePublished(db, ctx, result.id, true);
    }
    revalidateNoticePaths();
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
    revalidateNoticePaths();
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
    revalidateNoticePaths();
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
    revalidateNoticePaths();
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
    const ctx = await requireRole(["SCHOOL_ADMIN", "TEACHER", "PARENT", "STUDENT"]);
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
    const ctx = await requireRole(["SCHOOL_ADMIN", "TEACHER", "PARENT", "STUDENT"]);
    const db = await createServerSupabaseClient();
    await markAllNotificationsRead(db, ctx);
    revalidatePath("/notifications");
    return { success: true };
  } catch (error) {
    return err(error);
  }
}

/* --------------------------------- fees ---------------------------------- */

function revalidateFeePaths() {
  revalidatePath("/admin/fees");
  revalidatePath("/student/fees");
  revalidatePath("/parent/fees");
  revalidatePath("/student");
  revalidatePath("/parent");
}

export async function createFeeStructureAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const ctx = await requireRole("SCHOOL_ADMIN");
    const db = await createServerSupabaseClient();
    const { createFeeStructure } = await import("@/lib/services/fees");
    // Components arrive as repeating fields: component_name_i / component_amount_i.
    const components: { name: string; amount: number }[] = [];
    for (let i = 0; i < 30; i++) {
      const name = str(form, `component_name_${i}`);
      const amount = str(form, `component_amount_${i}`);
      if (name !== undefined && amount !== undefined) {
        components.push({ name, amount: Number(amount) });
      }
    }
    if (components.length === 0) {
      return { error: "Add at least one fee component" };
    }
    await createFeeStructure(db, ctx, {
      name: str(form, "name") ?? "",
      academicYearId: str(form, "academicYearId") ?? "",
      classId: str(form, "classId") ?? null,
      dueDate: str(form, "dueDate") ?? null,
      components,
    });
    revalidateFeePaths();
    return { success: true };
  } catch (error) {
    return err(error);
  }
}

export async function assignFeesAction(
  structureId: string,
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const ctx = await requireRole("SCHOOL_ADMIN");
    const db = await createServerSupabaseClient();
    const { assignFees } = await import("@/lib/services/fees");
    const studentIds = form
      .getAll("studentIds")
      .filter((v): v is string => typeof v === "string" && v.trim() !== "");
    if (studentIds.length === 0) return { error: "Select at least one student" };
    const totalRaw = str(form, "totalAmount");
    await assignFees(db, ctx, structureId, {
      studentIds,
      totalAmount: totalRaw === undefined ? null : Number(totalRaw),
      dueDate: str(form, "dueDate") ?? null,
    });
    revalidateFeePaths();
    return { success: true };
  } catch (error) {
    return err(error);
  }
}

export async function recordPaymentAction(
  studentFeeId: string,
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const ctx = await requireRole("SCHOOL_ADMIN");
    const db = await createServerSupabaseClient();
    const { recordPayment } = await import("@/lib/services/fees");
    await recordPayment(db, ctx, studentFeeId, {
      amount: Number(str(form, "amount") ?? 0),
      paidOn: str(form, "paidOn") ?? "",
      mode: (str(form, "mode") ?? "CASH") as
        | "CASH"
        | "CHEQUE"
        | "BANK_TRANSFER"
        | "OTHER",
      referenceNo: str(form, "referenceNo") ?? null,
    });
    revalidateFeePaths();
    return { success: true };
  } catch (error) {
    return err(error);
  }
}

export async function verifyPaymentAction(
  recordId: string,
): Promise<ActionState> {
  try {
    const ctx = await requireRole("SCHOOL_ADMIN");
    const db = await createServerSupabaseClient();
    const { verifyPaymentRecord } = await import("@/lib/services/fees");
    await verifyPaymentRecord(db, ctx, recordId);
    revalidateFeePaths();
    return { success: true };
  } catch (error) {
    return err(error);
  }
}

export async function voidPaymentAction(
  recordId: string,
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const ctx = await requireRole("SCHOOL_ADMIN");
    const db = await createServerSupabaseClient();
    const { voidPaymentRecord } = await import("@/lib/services/fees");
    const reason = str(form, "reason") ?? "";
    if (reason.length < 3) return { error: "Provide a void reason" };
    await voidPaymentRecord(db, ctx, recordId, { reason });
    revalidateFeePaths();
    return { success: true };
  } catch (error) {
    return err(error);
  }
}

export async function uploadReceiptAction(
  recordId: string,
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const ctx = await requireRole("SCHOOL_ADMIN");
    const db = await createServerSupabaseClient();
    const { setPaymentReceipt } = await import("@/lib/services/fees");
    const file = form.get("file");
    if (!(file instanceof File)) return { error: "Choose a file" };
    if (file.size > MAX_HOMEWORK_FILE_BYTES) {
      return { error: "File must be under 10 MB" };
    }
    await setPaymentReceipt(db, ctx, recordId, {
      name: file.name,
      type: file.type,
      size: file.size,
      bytes: await file.arrayBuffer(),
    });
    revalidateFeePaths();
    return { success: true };
  } catch (error) {
    return err(error);
  }
}
