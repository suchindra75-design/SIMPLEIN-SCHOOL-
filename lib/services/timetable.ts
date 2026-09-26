import {
  authorizeRoles,
  TenantBoundaryError,
  type SessionContext,
} from "@/lib/auth/session";
import { isAdmin } from "@/lib/auth/scope";
import { logAudit } from "@/lib/services/audit";
import { toCamel } from "@/lib/services/camel";
import {
  ConflictError,
  NotFoundError,
  throwForPostgrest,
  type DbClient,
} from "@/lib/services/errors";
import { getParentScope } from "@/lib/services/parents";
import { getTeacherScope } from "@/lib/services/teachers";
import type { TimetableSlotDto } from "@/lib/services/dto";
import type { TimetableSlotCreateInput, TimetableSlotUpdateInput } from "@/lib/validation/timetable";

/**
 * Timetable service (Phase 8). Reuses the existing scope/tenant/audit
 * abstractions. Conflict handling (documented in ARCHITECTURE.md §23):
 * - Section overlap: DB UNIQUE(section, day, period) → 409.
 * - Teacher double-booking: service pre-check + DB partial UNIQUE
 *   (year, teacher, day, period) → 409.
 * - Cross-tenant ids → 404 before any write.
 */

const SLOT_COLUMNS =
  "id, school_id, academic_year_id, section_id, subject_id, teacher_id, day_of_week, period_index, starts_at, ends_at, room, subjects(name), teachers(display_name), sections(name), classes(name)";

/* ------------------------------ scope helpers --------------------------- */

/** Sections whose timetable the caller may view (admin → all). */
export async function assertTimetableSectionAccess(
  db: DbClient,
  ctx: SessionContext,
  sectionId: string,
): Promise<void> {
  if (isAdmin(ctx)) return;
  if (ctx.roles.includes("TEACHER")) {
    const scope = await getTeacherScope(db, ctx);
    if (scope === null || !scope.sectionIds.has(sectionId)) {
      throw new TenantBoundaryError();
    }
    return;
  }
  if (ctx.roles.includes("PARENT")) {
    // Parent: at least one linked child must be in the section.
    const scope = await getParentScope(db, ctx);
    if (scope === null || scope.studentIds.size === 0) {
      throw new TenantBoundaryError();
    }
    const { data, error } = await db
      .from("students")
      .select("id, section_id")
      .in("id", [...scope.studentIds])
      .eq("school_id", ctx.profile.schoolId);
    throwForPostgrest(error);
    const inSection = (
      data as { section_id: string | null }[]
    ).some((s) => s.section_id === sectionId);
    if (!inSection) throw new TenantBoundaryError();
    return;
  }
  if (ctx.roles.includes("STUDENT")) {
    // Student: own section only.
    const { getStudentScope } = await import("@/lib/services/students");
    const scope = await getStudentScope(db, ctx);
    if (scope === null || scope.sectionId !== sectionId) {
      throw new TenantBoundaryError();
    }
    return;
  }
  throw new TenantBoundaryError();
}

/* ------------------------------- conflict checks ------------------------- */

/** Teacher double-booking: same year/day/period, another section. */
async function assertNoTeacherClash(
  db: DbClient,
  schoolId: string,
  input: { teacherId: string | null | undefined; dayOfWeek: number; periodIndex: number },
  excludeSlotId?: string,
): Promise<void> {
  if (input.teacherId === undefined || input.teacherId === null) return;
  const { data, error } = await db
    .from("timetable_slots")
    .select("id, section_id")
    .eq("school_id", schoolId)
    .eq("teacher_id", input.teacherId)
    .eq("day_of_week", input.dayOfWeek)
    .eq("period_index", input.periodIndex);
  throwForPostgrest(error);
  const clash = (data as { id: string; section_id: string }[]).find(
    (s) => s.id !== excludeSlotId,
  );
  if (clash !== undefined) {
    throw new ConflictError(
      "The teacher is already assigned to another section in that period",
    );
  }
}

/* --------------------------------- reads --------------------------------- */

/** Weekly grid for a section (admin/teacher-scope/parent-child-section). */
export async function listSectionTimetable(
  db: DbClient,
  ctx: SessionContext,
  sectionId: string,
): Promise<{ slots: TimetableSlotDto[] }> {
  authorizeRoles(ctx, ["SCHOOL_ADMIN", "TEACHER", "PARENT", "STUDENT"]);
  const { data: section, error: sectionError } = await db
    .from("sections")
    .select("id")
    .eq("id", sectionId)
    .eq("school_id", ctx.profile.schoolId)
    .single();
  throwForPostgrest(sectionError, "Section not found");
  void section;
  await assertTimetableSectionAccess(db, ctx, sectionId);
  const { data, error } = await db
    .from("timetable_slots")
    .select(SLOT_COLUMNS)
    .eq("section_id", sectionId)
    .eq("school_id", ctx.profile.schoolId)
    .order("day_of_week")
    .order("period_index");
  throwForPostgrest(error);
  return { slots: toCamel<TimetableSlotDto[]>(data ?? []) };
}

/** Weekly grid for a teacher (admin or self-teacher). */
export async function listTeacherTimetable(
  db: DbClient,
  ctx: SessionContext,
  teacherId: string,
): Promise<{ slots: TimetableSlotDto[] }> {
  authorizeRoles(ctx, ["SCHOOL_ADMIN", "TEACHER"]);
  if (!isAdmin(ctx)) {
    const scope = await getTeacherScope(db, ctx);
    if (scope === null || scope.teacherId !== teacherId) {
      throw new TenantBoundaryError();
    }
  } else {
    // Verify the teacher is in this school (404 on cross-tenant).
    const { data, error } = await db
      .from("teachers")
      .select("id")
      .eq("id", teacherId)
      .eq("school_id", ctx.profile.schoolId)
      .single();
    throwForPostgrest(error, "Teacher not found");
    void data;
  }
  const { data, error } = await db
    .from("timetable_slots")
    .select(SLOT_COLUMNS)
    .eq("teacher_id", teacherId)
    .eq("school_id", ctx.profile.schoolId)
    .order("day_of_week")
    .order("period_index");
  throwForPostgrest(error);
  return { slots: toCamel<TimetableSlotDto[]>(data ?? []) };
}

/** Caller-scoped timetable: teacher → own entries; parent → children's sections. */
export async function listMyTimetable(
  db: DbClient,
  ctx: SessionContext,
): Promise<{ slots: TimetableSlotDto[] }> {
  authorizeRoles(ctx, ["TEACHER", "PARENT", "STUDENT"]);
  if (ctx.roles.includes("TEACHER")) {
    const scope = await getTeacherScope(db, ctx);
    if (scope === null || scope.teacherId === undefined) {
      return { slots: [] };
    }
    return listTeacherTimetable(db, ctx, scope.teacherId);
  }
  if (ctx.roles.includes("STUDENT")) {
    // Student: own section's timetable.
    const { getStudentScope } = await import("@/lib/services/students");
    const scope = await getStudentScope(db, ctx);
    if (scope === null || scope.sectionId === null) return { slots: [] };
    return listSectionTimetable(db, ctx, scope.sectionId);
  }
  // Parent: timetable of linked children's sections.
  const scope = await getParentScope(db, ctx);
  if (scope === null || scope.studentIds.size === 0) return { slots: [] };
  const { data: students, error } = await db
    .from("students")
    .select("section_id")
    .in("id", [...scope.studentIds])
    .eq("school_id", ctx.profile.schoolId);
  throwForPostgrest(error);
  const sectionIds = [
    ...new Set(
      (students as { section_id: string | null }[])
        .map((s) => s.section_id)
        .filter((s): s is string => s !== null),
    ),
  ];
  if (sectionIds.length === 0) return { slots: [] };
  const { data: slots, error: slotError } = await db
    .from("timetable_slots")
    .select(SLOT_COLUMNS)
    .in("section_id", sectionIds)
    .eq("school_id", ctx.profile.schoolId)
    .order("day_of_week")
    .order("period_index");
  throwForPostgrest(slotError);
  return { slots: toCamel<TimetableSlotDto[]>(slots ?? []) };
}

/* -------------------------------- mutations ------------------------------ */

function verifySlotTimeRange(
  input: Pick<TimetableSlotCreateInput, "startsAt" | "endsAt">,
): void {
  if (input.endsAt <= input.startsAt) {
    throw new ConflictError("End time must be after start time");
  }
}

/** Admin only. Creates a slot (409 on section overlap or teacher clash). */
export async function createTimetableSlot(
  db: DbClient,
  ctx: SessionContext,
  sectionId: string,
  input: TimetableSlotCreateInput,
): Promise<{ id: string }> {
  authorizeRoles(ctx, ["SCHOOL_ADMIN"]);
  verifySlotTimeRange(input);
  // Section must exist in this school (404 on cross-tenant).
  const { data: section, error: sectionError } = await db
    .from("sections")
    .select("id")
    .eq("id", sectionId)
    .eq("school_id", ctx.profile.schoolId)
    .single();
  throwForPostgrest(sectionError, "Section not found in this school");
  // Subject/teacher must be in this school.
  for (const [table, id] of [
    ["subjects", input.subjectId],
    ["teachers", input.teacherId],
  ] as const) {
    if (id === undefined || id === null) continue;
    const { data, error } = await db
      .from(table)
      .select("id")
      .eq("id", id)
      .eq("school_id", ctx.profile.schoolId)
      .single();
    if (error !== null || data === null) {
      throw new NotFoundError(`${table.slice(0, -1)} not found in this school`);
    }
  }
  // Teacher double-booking (DB partial UNIQUE backstops).
  await assertNoTeacherClash(db, ctx.profile.schoolId, {
    teacherId: input.teacherId,
    dayOfWeek: input.dayOfWeek,
    periodIndex: input.periodIndex,
  });

  // Academic year: explicit (verified) or the school's current year.
  let academicYearId: string;
  if (input.academicYearId !== undefined && input.academicYearId !== null) {
    const { data: year, error: yearError } = await db
      .from("academic_years")
      .select("id")
      .eq("id", input.academicYearId)
      .eq("school_id", ctx.profile.schoolId)
      .single();
    if (yearError !== null || year === null) {
      throw new NotFoundError("Academic year not found in this school");
    }
    academicYearId = (year as { id: string }).id;
  } else {
    const { data: year, error: yearError } = await db
      .from("academic_years")
      .select("id")
      .eq("school_id", ctx.profile.schoolId)
      .eq("is_current", true)
      .maybeSingle();
    throwForPostgrest(yearError);
    if (year === null) {
      throw new ConflictError("No academic year is configured for this school");
    }
    academicYearId = (year as { id: string }).id;
  }

  const { data, error } = await db
    .from("timetable_slots")
    .insert({
      school_id: ctx.profile.schoolId,
      academic_year_id: academicYearId,
      section_id: sectionId,
      subject_id: input.subjectId ?? null,
      teacher_id: input.teacherId ?? null,
      day_of_week: input.dayOfWeek,
      period_index: input.periodIndex,
      starts_at: input.startsAt,
      ends_at: input.endsAt,
      room: input.room ?? null,
    })
    .select("id")
    .single();
  throwForPostgrest(error);
  const id = (data as { id: string }).id;
  await logAudit(db, ctx, "timetable.slot_created", "timetable_slots", id, {
    sectionId,
    dayOfWeek: input.dayOfWeek,
    periodIndex: input.periodIndex,
  });
  return { id };
}

/** Admin only. Edits a slot; re-runs conflict checks (409 on clash). */
export async function updateTimetableSlot(
  db: DbClient,
  ctx: SessionContext,
  slotId: string,
  patch: TimetableSlotUpdateInput,
): Promise<{ id: string }> {
  authorizeRoles(ctx, ["SCHOOL_ADMIN"]);
  const { data: existing, error: existError } = await db
    .from("timetable_slots")
    .select("id, section_id, academic_year_id, day_of_week, period_index, teacher_id, starts_at, ends_at")
    .eq("id", slotId)
    .eq("school_id", ctx.profile.schoolId)
    .single();
  throwForPostgrest(existError, "Timetable slot not found");
  const row = existing as unknown as {
    id: string;
    section_id: string;
    academic_year_id: string;
    day_of_week: number;
    period_index: number;
    teacher_id: string | null;
    starts_at: string;
    ends_at: string;
  };
  if (patch.endsAt !== undefined || patch.startsAt !== undefined) {
    // Merge with the actual existing values (never fake defaults).
    verifySlotTimeRange({
      startsAt: patch.startsAt ?? row.starts_at,
      endsAt: patch.endsAt ?? row.ends_at,
    });
  }
  if (patch.teacherId !== undefined && patch.teacherId !== null) {
    const { data: teacher, error: teacherError } = await db
      .from("teachers")
      .select("id")
      .eq("id", patch.teacherId)
      .eq("school_id", ctx.profile.schoolId)
      .single();
    if (teacherError !== null || teacher === null) {
      throw new NotFoundError("Teacher not found in this school");
    }
  }
  // Clash check evaluates the slot's EFFECTIVE (merged) teacher — the kept
  // teacher when the patch doesn't change it.
  const merged = {
    teacherId: patch.teacherId !== undefined ? patch.teacherId : row.teacher_id,
    dayOfWeek: patch.dayOfWeek ?? row.day_of_week,
    periodIndex: patch.periodIndex ?? row.period_index,
  };
  await assertNoTeacherClash(db, ctx.profile.schoolId, merged, slotId);

  const update: Record<string, unknown> = {};
  if (patch.subjectId !== undefined) update["subject_id"] = patch.subjectId;
  if (patch.teacherId !== undefined) update["teacher_id"] = patch.teacherId;
  if (patch.dayOfWeek !== undefined) update["day_of_week"] = patch.dayOfWeek;
  if (patch.periodIndex !== undefined) update["period_index"] = patch.periodIndex;
  if (patch.startsAt !== undefined) update["starts_at"] = patch.startsAt;
  if (patch.endsAt !== undefined) update["ends_at"] = patch.endsAt;
  if (patch.room !== undefined) update["room"] = patch.room;
  if (Object.keys(update).length === 0) return { id: slotId };
  const { data, error } = await db
    .from("timetable_slots")
    .update(update)
    .eq("id", slotId)
    .eq("school_id", ctx.profile.schoolId)
    .select("id")
    .single();
  throwForPostgrest(error, "Timetable slot not found");
  await logAudit(db, ctx, "timetable.slot_updated", "timetable_slots", slotId, {
    fields: Object.keys(update),
  });
  return { id: (data as { id: string }).id };
}

/** Admin only. Deletes a slot. */
export async function deleteTimetableSlot(
  db: DbClient,
  ctx: SessionContext,
  slotId: string,
): Promise<{ id: string }> {
  authorizeRoles(ctx, ["SCHOOL_ADMIN"]);
  const { data, error } = await db
    .from("timetable_slots")
    .delete()
    .eq("id", slotId)
    .eq("school_id", ctx.profile.schoolId)
    .select("id")
    .single();
  throwForPostgrest(error, "Timetable slot not found");
  await logAudit(db, ctx, "timetable.slot_deleted", "timetable_slots", slotId, {});
  return { id: (data as { id: string }).id };
}
