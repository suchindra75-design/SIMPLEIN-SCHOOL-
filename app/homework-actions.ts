"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/session";
import {
  addHomeworkAttachment,
  createHomework,
  deleteHomework,
  updateHomework,
} from "@/lib/services/homework";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { MAX_HOMEWORK_FILE_BYTES } from "@/lib/services/storage";

/**
 * Shared homework server actions — admins and teachers (the service enforces
 * authorship + section/subject scope from the session; teachers manage only
 * their own homework).
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

export async function createHomeworkAction(
  sectionId: string,
  redirectTo: string,
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const ctx = await requireRole(["SCHOOL_ADMIN", "TEACHER"]);
    const db = await createServerSupabaseClient();
    // A sectionId form field (when present) overrides the bound value.
    const section = str(form, "sectionId") ?? sectionId;
    if (section === "") return { error: "Choose a section" };
    await createHomework(db, ctx, section, {
      subjectId: str(form, "subjectId") ?? "",
      title: str(form, "title") ?? "",
      description: str(form, "description") ?? "",
      assignedOn: str(form, "assignedOn"),
      dueDate: str(form, "dueDate") ?? "",
    });
    revalidatePath(redirectTo);
    return { success: true };
  } catch (error) {
    return err(error);
  }
}

export async function updateHomeworkAction(
  homeworkId: string,
  redirectTo: string,
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const ctx = await requireRole(["SCHOOL_ADMIN", "TEACHER"]);
    const db = await createServerSupabaseClient();
    await updateHomework(db, ctx, homeworkId, {
      title: str(form, "title"),
      description: str(form, "description"),
      dueDate: str(form, "dueDate"),
      assignedOn: str(form, "assignedOn"),
    });
    revalidatePath(redirectTo);
    return { success: true };
  } catch (error) {
    return err(error);
  }
}

export async function deleteHomeworkAction(
  homeworkId: string,
  redirectTo: string,
): Promise<ActionState> {
  try {
    const ctx = await requireRole(["SCHOOL_ADMIN", "TEACHER"]);
    const db = await createServerSupabaseClient();
    await deleteHomework(db, ctx, homeworkId);
    revalidatePath(redirectTo);
    return { success: true };
  } catch (error) {
    return err(error);
  }
}

/** Restore a soft-deleted homework row. Admin only, audited. */
export async function restoreHomeworkAction(
  homeworkId: string,
  redirectTo: string,
): Promise<ActionState> {
  try {
    const ctx = await requireRole("SCHOOL_ADMIN");
    const db = await createServerSupabaseClient();
    const { error } = await db
      .from("homework")
      .update({ is_active: true })
      .eq("id", homeworkId)
      .eq("school_id", ctx.profile.schoolId);
    if (error !== null) return { error: error.message };
    revalidatePath(redirectTo);
    return { success: true };
  } catch (error) {
    return err(error);
  }
}

export async function uploadHomeworkAttachmentAction(
  homeworkId: string,
  redirectTo: string,
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const ctx = await requireRole(["SCHOOL_ADMIN", "TEACHER"]);
    const db = await createServerSupabaseClient();
    const file = form.get("file");
    if (!(file instanceof File)) return { error: "Choose a file" };
    if (file.size > MAX_HOMEWORK_FILE_BYTES) {
      return { error: "File must be under 10 MB" };
    }
    await addHomeworkAttachment(db, ctx, homeworkId, {
      name: file.name,
      type: file.type,
      size: file.size,
      bytes: await file.arrayBuffer(),
    });
    revalidatePath(redirectTo);
    return { success: true };
  } catch (error) {
    return err(error);
  }
}
