import { createAdminClient } from "@/lib/supabase/admin";
import type { AppRole } from "@/lib/auth/rbac";

export interface ResolvedIdentity {
  email: string;
  userId: string;
  schoolId: string;
  role: AppRole;
  fullName: string;
  identifier: string;
}

/**
 * Server-side identity resolution.
 * Resolves a role-specific school-facing identifier to the corresponding
 * user email for Supabase Auth authentication.
 *
 * Identifier Mapping Rules:
 * - STUDENT: admission_no -> students.user_id -> users.email
 * - PARENT: phone -> parents.user_id -> users.email
 * - TEACHER: employee_no -> teachers.user_id -> users.email
 * - ADMIN: direct email
 */
export async function resolveIdentifierToEmail(
  role: "STUDENT" | "PARENT" | "TEACHER" | "ADMIN" | "SCHOOL_ADMIN",
  rawIdentifier: string,
): Promise<{ email: string } | null> {
  const identifier = rawIdentifier.trim();
  if (!identifier) return null;

  // Direct email fallback (e.g. for Admin or if user entered an email)
  if (role === "ADMIN" || role === "SCHOOL_ADMIN" || identifier.includes("@")) {
    return { email: identifier.toLowerCase() };
  }

  const admin = createAdminClient();

  if (role === "STUDENT") {
    // Lookup by admission_no in students table
    const { data: student, error: studentError } = await admin
      .from("students")
      .select("id, school_id, user_id, status")
      .ilike("admission_no", identifier)
      .eq("status", "active")
      .not("user_id", "is", null)
      .maybeSingle();

    if (studentError !== null || student === null || !student.user_id) {
      return null;
    }

    const { data: user, error: userError } = await admin
      .from("users")
      .select("email, is_active")
      .eq("id", student.user_id)
      .eq("is_active", true)
      .single();

    if (userError !== null || user === null) {
      return null;
    }

    return { email: user.email };
  }

  if (role === "PARENT") {
    // Lookup by phone in parents table or users table
    const cleanedPhone = identifier.replace(/[^\d+]/g, "");
    const { data: parent, error: parentError } = await admin
      .from("parents")
      .select("id, school_id, user_id, is_active")
      .or(`phone.eq.${identifier},phone.eq.${cleanedPhone}`)
      .eq("is_active", true)
      .not("user_id", "is", null)
      .maybeSingle();

    if (parentError !== null || parent === null || !parent.user_id) {
      // Fallback: check users table phone with PARENT role
      const { data: user, error: userError } = await admin
        .from("users")
        .select("email, is_active, user_roles!user_roles_user_id_fkey(role)")
        .or(`phone.eq.${identifier},phone.eq.${cleanedPhone}`)
        .eq("is_active", true)
        .maybeSingle();

      if (userError !== null || user === null) {
        return null;
      }
      return { email: user.email };
    }

    const { data: user, error: userError } = await admin
      .from("users")
      .select("email, is_active")
      .eq("id", parent.user_id)
      .eq("is_active", true)
      .single();

    if (userError !== null || user === null) {
      return null;
    }

    return { email: user.email };
  }

  if (role === "TEACHER") {
    // Lookup by employee_no in teachers table
    const { data: teacher, error: teacherError } = await admin
      .from("teachers")
      .select("id, school_id, user_id, is_active")
      .ilike("employee_no", identifier)
      .eq("is_active", true)
      .not("user_id", "is", null)
      .maybeSingle();

    if (teacherError !== null || teacher === null || !teacher.user_id) {
      return null;
    }

    const { data: user, error: userError } = await admin
      .from("users")
      .select("email, is_active")
      .eq("id", teacher.user_id)
      .eq("is_active", true)
      .single();

    if (userError !== null || user === null) {
      return null;
    }

    return { email: user.email };
  }

  return null;
}
