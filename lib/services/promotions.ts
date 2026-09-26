import { authorizeRoles, type SessionContext } from "@/lib/auth/session";
import { logAudit } from "@/lib/services/audit";
import { toCamel } from "@/lib/services/camel";
import {
  ConflictError,
  NotFoundError,
  throwForPostgrest,
  type DbClient,
} from "@/lib/services/errors";
import type {
  PromotionAssignInput,
  PromotionPreviewInput,
  PromotionRunInput,
} from "@/lib/validation/promotions";

/**
 * Academic promotion service (Phase 12). Built on the existing
 * student_enrollments history (UNIQUE student+year prevents duplicates at the
 * DB). Rules (documented):
 * - Class progression is CONFIGURABLE: the preview proposes the next class by
 *   order_index (current + 1), but the admin assigns/changes the next class
 *   per student — nothing is hard-coded.
 * - Section progression: the preview proposes the same-named section in the
 *   next class, else its first section; the admin can change it per student.
 * - Promotion NEVER runs automatically (dates don't trigger it) — explicit
 *   admin approval only.
 * - HOLD/retain = no next-year enrollment created (the student stays in the
 *   current year's enrollment; audited).
 * - FINAL class (no next class by order_index) → propose/approve GRADUATE:
 *   students.status = 'graduated', NO invalid next-class enrollment.
 * - History is preserved: promotion only INSERTs new enrollment rows and
 *   repoints the students' current class/section — previous enrollments,
 *   attendance, marks, and report cards are never overwritten.
 */

export interface PromotionProposal {
  studentId: string;
  displayName: string;
  admissionNo: string;
  currentClassId: string | null;
  currentSectionId: string | null;
  currentClassName: string;
  nextClassId: string | null;
  nextSectionId: string | null;
  nextClassName: string | null;
  action: "PROMOTE" | "GRADUATE" | "ALREADY_PROMOTED";
  alreadyPromoted: boolean;
}

export interface PromotionPreview {
  fromYear: { id: string; name: string };
  toYear: { id: string; name: string };
  proposals: PromotionProposal[];
}

/** Verify both years are in this school (404 on cross-tenant). */
async function assertYears(
  db: DbClient,
  schoolId: string,
  fromYearId: string,
  toYearId: string,
): Promise<void> {
  for (const id of [fromYearId, toYearId]) {
    const { data, error } = await db
      .from("academic_years")
      .select("id")
      .eq("id", id)
      .eq("school_id", schoolId)
      .single();
    if (error !== null || data === null) {
      throw new NotFoundError("Academic year not found in this school");
    }
  }
}

/** Preview: eligible students + proposed next class/section per student. */
export async function previewPromotion(
  db: DbClient,
  ctx: SessionContext,
  input: PromotionPreviewInput,
): Promise<PromotionPreview> {
  authorizeRoles(ctx, ["SCHOOL_ADMIN"]);
  await assertYears(db, ctx.profile.schoolId, input.fromYearId, input.toYearId);
  const { data: fromYear, error: fromError } = await db
    .from("academic_years")
    .select("id, name")
    .eq("id", input.fromYearId)
    .eq("school_id", ctx.profile.schoolId)
    .single();
  throwForPostgrest(fromError, "Academic year not found");
  const { data: toYear, error: toError } = await db
    .from("academic_years")
    .select("id, name")
    .eq("id", input.toYearId)
    .eq("school_id", ctx.profile.schoolId)
    .single();
  throwForPostgrest(toError, "Academic year not found");
  void fromYear;
  void toYear;

  // Eligible students: enrolled in the from-year (optionally class-filtered).
  let query = db
    .from("student_enrollments")
    .select(
      "student_id, class_id, section_id, students(id, display_name, admission_no, class_id, section_id)",
    )
    .eq("school_id", ctx.profile.schoolId)
    .eq("academic_year_id", input.fromYearId)
    .eq("status", "enrolled");
  if (input.classId !== undefined && input.classId !== null) {
    query = query.eq("class_id", input.classId);
  }
  const { data: enrollments, error: enrollError } = await query;
  throwForPostgrest(enrollError);
  const rows = (enrollments ?? []) as unknown as {
    student_id: string;
    class_id: string | null;
    section_id: string | null;
    students: {
      display_name: string;
      admission_no: string;
    } | null;
  }[];

  // Next class per order_index (configurable mapping — preview only).
  const { data: classes, error: classError } = await db
    .from("classes")
    .select("id, name, order_index, sections(id, name)")
    .eq("school_id", ctx.profile.schoolId);
  throwForPostgrest(classError);
  const classRows = (classes ?? []) as unknown as {
    id: string;
    name: string;
    order_index: number;
    sections: { id: string; name: string }[];
  }[];

  // Already-promoted students (existing target-year enrollments).
  const { data: promoted, error: promotedError } = await db
    .from("student_enrollments")
    .select("student_id")
    .eq("school_id", ctx.profile.schoolId)
    .eq("academic_year_id", input.toYearId);
  throwForPostgrest(promotedError);
  const promotedIds = new Set(
    (promoted as { student_id: string }[]).map((r) => r.student_id),
  );

  const proposals: PromotionProposal[] = rows.flatMap((e): PromotionProposal[] => {
    if (e.students === null) return [];
    const currentClass = classRows.find((c) => c.id === e.class_id);
    // Class progression by order_index: current + 1 (configurable in the DB —
    // schools define their own class order).
    const nextClass =
      currentClass === undefined
        ? undefined
        : classRows.find((c) => c.order_index === currentClass.order_index + 1);
    if (currentClass !== undefined && nextClass === undefined) {
      // FINAL class → graduate proposal (no invalid next class).
      return [
        {
          studentId: e.student_id,
          displayName: e.students.display_name,
          admissionNo: e.students.admission_no,
          currentClassId: e.class_id,
          currentSectionId: e.section_id,
          currentClassName: currentClass.name,
          nextClassId: null,
          nextSectionId: null,
          nextClassName: null,
          action: "GRADUATE",
          alreadyPromoted: promotedIds.has(e.student_id),
        },
      ];
    }
    const nextSection =
      nextClass === undefined
        ? undefined
        : (nextClass.sections ?? []).find(
            (s) =>
              e.section_id !== null &&
              classRows
                .find((c) => c.id === e.class_id)
                ?.sections?.some(
                  (cs) => cs.id === e.section_id && cs.name === s.name,
                ),
          ) ?? (nextClass?.sections ?? [])[0];
    return [
      {
        studentId: e.student_id,
        displayName: e.students.display_name,
        admissionNo: e.students.admission_no,
        currentClassId: e.class_id,
        currentSectionId: e.section_id,
        currentClassName: currentClass?.name ?? "-",
        nextClassId: nextClass?.id ?? null,
        nextSectionId: nextSection?.id ?? null,
        nextClassName: nextClass === undefined ? null : `${nextClass.name} ${nextSection?.name ?? ""}`.trim(),
        action: promotedIds.has(e.student_id) ? "ALREADY_PROMOTED" : "PROMOTE",
        alreadyPromoted: promotedIds.has(e.student_id),
      },
    ];
  });

  return {
    fromYear: { id: input.fromYearId, name: "From year" },
    toYear: { id: input.toYearId, name: "To year" },
    proposals,
  };
}

/**
 * Approve promotion for a batch. Admin only, audited per student.
 * - hold → skipped (no enrollment; audited as held).
 * - GRADUATE → students.status = 'graduated' (no new enrollment).
 * - PROMOTE → INSERT next-year enrollment (UNIQUE student+year backstops) +
 *   repoint the student's current class/section. History untouched.
 */
export async function promoteStudents(
  db: DbClient,
  ctx: SessionContext,
  input: PromotionRunInput,
): Promise<{ promoted: number; graduated: number; held: number; failed: { studentId: string; message: string }[] }> {
  authorizeRoles(ctx, ["SCHOOL_ADMIN"]);
  await assertYears(db, ctx.profile.schoolId, input.fromYearId, input.toYearId);
  const result = {
    promoted: 0,
    graduated: 0,
    held: 0,
    failed: [] as { studentId: string; message: string }[],
  };

  for (const a of input.assignments) {
    try {
      // Student must be in this school (404 on cross-tenant).
      const { data: student, error: studentError } = await db
        .from("students")
        .select("id, status")
        .eq("id", a.studentId)
        .eq("school_id", ctx.profile.schoolId)
        .single();
      if (studentError !== null || student === null) {
        throw new NotFoundError("Student not found in this school");
      }
      // Duplicate promotion prevented (DB UNIQUE student+year backstops).
      const { data: existing, error: existError } = await db
        .from("student_enrollments")
        .select("id")
        .eq("student_id", a.studentId)
        .eq("academic_year_id", input.toYearId)
        .eq("school_id", ctx.profile.schoolId)
        .maybeSingle();
      throwForPostgrest(existError);
      if (existing !== null) {
        throw new ConflictError(
          "Student already has an enrollment for the target year",
        );
      }
      // Next class/section must be in this school.
      if (a.nextClassId !== undefined && a.nextClassId !== null) {
        const { data, error } = await db
          .from("classes")
          .select("id")
          .eq("id", a.nextClassId)
          .eq("school_id", ctx.profile.schoolId)
          .single();
        if (error !== null || data === null) {
          throw new NotFoundError("Next class not found in this school");
        }
      }
      if (a.nextSectionId !== undefined && a.nextSectionId !== null) {
        const { data, error } = await db
          .from("sections")
          .select("id, class_id")
          .eq("id", a.nextSectionId)
          .eq("school_id", ctx.profile.schoolId)
          .single();
        if (error !== null || data === null) {
          throw new NotFoundError("Next section not found in this school");
        }
        const sec = data as { id: string; class_id: string };
        if (
          a.nextClassId !== undefined &&
          a.nextClassId !== null &&
          sec.class_id !== a.nextClassId
        ) {
          throw new ConflictError("Section does not belong to the next class");
        }
      }

      if (a.hold) {
        result.held += 1;
        await logAudit(db, ctx, "promotion.held", "students", a.studentId, {
          fromYearId: input.fromYearId,
          toYearId: input.toYearId,
        });
        continue;
      }

      const graduate =
        (a.nextClassId === undefined || a.nextClassId === null) &&
        (a.nextSectionId === undefined || a.nextSectionId === null);

      if (graduate) {
        // Final-class handling: mark graduated, NO invalid next enrollment.
        const { error: gradError } = await db
          .from("students")
          .update({ status: "graduated" })
          .eq("id", a.studentId)
          .eq("school_id", ctx.profile.schoolId);
        if (gradError !== null) throw new Error(gradError.message);
        result.graduated += 1;
        await logAudit(db, ctx, "promotion.graduated", "students", a.studentId, {
          fromYearId: input.fromYearId,
        });
        continue;
      }

      // PROMOTE: insert the next-year enrollment (history preserved) +
      // repoint the current placement.
      const { error: insError } = await db.from("student_enrollments").insert({
        school_id: ctx.profile.schoolId,
        student_id: a.studentId,
        academic_year_id: input.toYearId,
        class_id: a.nextClassId ?? null,
        section_id: a.nextSectionId ?? null,
        roll_number: null,
        status: "enrolled",
      });
      if (insError !== null) {
        if (insError.code === "23505") {
          throw new ConflictError(
            "Student already has an enrollment for the target year",
          );
        }
        throw new Error(insError.message);
      }
      const { error: updateError } = await db
        .from("students")
        .update({ class_id: a.nextClassId ?? null, section_id: a.nextSectionId ?? null })
        .eq("id", a.studentId)
        .eq("school_id", ctx.profile.schoolId);
      if (updateError !== null) throw new Error(updateError.message);
      result.promoted += 1;
      await logAudit(db, ctx, "promotion.approved", "students", a.studentId, {
        fromYearId: input.fromYearId,
        toYearId: input.toYearId,
        nextClassId: a.nextClassId ?? null,
        nextSectionId: a.nextSectionId ?? null,
      });
    } catch (error) {
      result.failed.push({
        studentId: a.studentId,
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }
  await logAudit(db, ctx, "promotion.run", "students", null, {
    fromYearId: input.fromYearId,
    toYearId: input.toYearId,
    promoted: result.promoted,
    graduated: result.graduated,
    held: result.held,
    failed: result.failed.length,
  });
  return result;
}
