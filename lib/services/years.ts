import { authorizeRoles, type SessionContext } from "@/lib/auth/session";
import { assertCanWritePeople } from "@/lib/auth/scope";
import { logAudit } from "@/lib/services/audit";
import { toCamel } from "@/lib/services/camel";
import type { AcademicYearDto } from "@/lib/services/dto";
import { throwForPostgrest, type DbClient } from "@/lib/services/errors";
import type { AcademicYearCreateInput } from "@/lib/validation/people";

/** Academic years. One current year per school (DB partial unique index).
 *  Reads are open to members; writes are admin-only. */

export async function listAcademicYears(
  db: DbClient,
  ctx: SessionContext,
): Promise<{ academicYears: AcademicYearDto[] }> {
  authorizeRoles(ctx, ["SCHOOL_ADMIN", "TEACHER", "PARENT"]);
  const { data, error } = await db
    .from("academic_years")
    .select("id, name, starts_on, ends_on, is_current")
    .eq("school_id", ctx.profile.schoolId)
    .order("starts_on", { ascending: false });
  throwForPostgrest(error);
  return { academicYears: toCamel<AcademicYearDto[]>(data ?? []) };
}

export async function getCurrentAcademicYear(
  db: DbClient,
  ctx: SessionContext,
): Promise<{ academicYear: AcademicYearDto | null }> {
  authorizeRoles(ctx, ["SCHOOL_ADMIN", "TEACHER", "PARENT"]);
  const { data, error } = await db
    .from("academic_years")
    .select("id, name, starts_on, ends_on, is_current")
    .eq("school_id", ctx.profile.schoolId)
    .eq("is_current", true)
    .maybeSingle();
  if (error !== null) throw new Error(error.message);
  return { academicYear: toCamel<AcademicYearDto | null>(data) };
}

export async function createAcademicYear(
  db: DbClient,
  ctx: SessionContext,
  input: AcademicYearCreateInput,
) {
  assertCanWritePeople(ctx);
  if (input.endsOn <= input.startsOn) {
    throw new Error("endsOn must be after startsOn");
  }
  const { data, error } = await db
    .from("academic_years")
    .insert({
      school_id: ctx.profile.schoolId,
      name: input.name,
      starts_on: input.startsOn,
      ends_on: input.endsOn,
      is_current: input.isCurrent,
    })
    .select("id")
    .single();
  throwForPostgrest(error);
  const id = (data as { id: string }).id;
  if (input.isCurrent) {
    // Keep exactly one current year: unset the others.
    const { error: unsetError } = await db
      .from("academic_years")
      .update({ is_current: false })
      .eq("school_id", ctx.profile.schoolId)
      .neq("id", id);
    if (unsetError !== null) throw new Error(unsetError.message);
  }
  await logAudit(db, ctx, "academic_year.created", "academic_years", id, {
    name: input.name,
  });
  return { id };
}

/** Switch the current year (transactional intent: unset others first). */
export async function setCurrentAcademicYear(
  db: DbClient,
  ctx: SessionContext,
  id: string,
) {
  assertCanWritePeople(ctx);
  const { data, error } = await db
    .from("academic_years")
    .select("id")
    .eq("id", id)
    .eq("school_id", ctx.profile.schoolId)
    .single();
  throwForPostgrest(error, "Academic year not found");
  const { error: unsetError } = await db
    .from("academic_years")
    .update({ is_current: false })
    .eq("school_id", ctx.profile.schoolId);
  if (unsetError !== null) throw new Error(unsetError.message);
  const { error: setError } = await db
    .from("academic_years")
    .update({ is_current: true })
    .eq("id", id)
    .eq("school_id", ctx.profile.schoolId);
  if (setError !== null) throw new Error(setError.message);
  await logAudit(db, ctx, "academic_year.current", "academic_years", id, {});
  return { id };
}
