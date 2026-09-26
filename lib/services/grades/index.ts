import { authorizeRoles, type SessionContext } from "@/lib/auth/session";
import { logAudit } from "@/lib/services/audit";
import { toCamel } from "@/lib/services/camel";
import {
  ConflictError,
  throwForPostgrest,
  type DbClient,
} from "@/lib/services/errors";
import { validateGradingRules } from "@/lib/services/grades/calc";
import { listGradingSystems } from "@/lib/services/marks";
import type { GradingSystemDto } from "@/lib/services/dto";
import type {
  GradingSystemCreateInput,
  GradingSystemUpdateInput,
} from "@/lib/validation/marks";

/**
 * Grading systems service (Phase 6). Percentage bands are configurable per
 * school (no hard-coded letters); non-overlapping bands enforced by the
 * validateGradingRules engine AND the DB trigger. Writes are admin-only +
 * audited.
 */

export async function createGradingSystem(
  db: DbClient,
  ctx: SessionContext,
  input: GradingSystemCreateInput,
): Promise<{ id: string }> {
  authorizeRoles(ctx, ["SCHOOL_ADMIN"]);
  const problem = validateGradingRules(input.rules);
  if (problem !== null) throw new ConflictError(problem);
  const { data, error } = await db
    .from("grading_systems")
    .insert({
      school_id: ctx.profile.schoolId,
      name: input.name,
      is_default: input.isDefault,
    })
    .select("id")
    .single();
  throwForPostgrest(error);
  const id = (data as { id: string }).id;
  const { error: rulesError } = await db.from("grading_rules").insert(
    input.rules.map((r) => ({
      school_id: ctx.profile.schoolId,
      grading_system_id: id,
      min_percentage: r.minPercentage,
      max_percentage: r.maxPercentage,
      grade: r.grade,
      grade_point: r.gradePoint ?? null,
      remark_template: r.remarkTemplate ?? null,
    })),
  );
  throwForPostgrest(rulesError);
  if (input.isDefault) {
    // Keep exactly one default system per school.
    const { error: unsetError } = await db
      .from("grading_systems")
      .update({ is_default: false })
      .eq("school_id", ctx.profile.schoolId)
      .neq("id", id);
    if (unsetError !== null) throw new Error(unsetError.message);
  }
  await logAudit(db, ctx, "grading_system.created", "grading_systems", id, {
    name: input.name,
    rules: input.rules.length,
  });
  return { id };
}

export async function updateGradingSystem(
  db: DbClient,
  ctx: SessionContext,
  id: string,
  input: GradingSystemUpdateInput,
): Promise<{ id: string }> {
  authorizeRoles(ctx, ["SCHOOL_ADMIN"]);
  // Verify the system is in this school (404 on cross-tenant).
  const { data: existing, error: existError } = await db
    .from("grading_systems")
    .select("id")
    .eq("id", id)
    .eq("school_id", ctx.profile.schoolId)
    .single();
  throwForPostgrest(existError, "Grading system not found");
  void existing;

  const row: Record<string, unknown> = {};
  if (input.name !== undefined) row["name"] = input.name;
  if (input.isDefault !== undefined) row["is_default"] = input.isDefault;
  if (input.rules !== undefined) {
    const problem = validateGradingRules(input.rules);
    if (problem !== null) throw new ConflictError(problem);
  }

  // Rules are replaced atomically-ish: delete + insert (documented: the
  // band-validation trigger re-checks every new band at the DB).
  if (input.rules !== undefined) {
    const { error: delError } = await db
      .from("grading_rules")
      .delete()
      .eq("grading_system_id", id)
      .eq("school_id", ctx.profile.schoolId);
    throwForPostgrest(delError);
    const { error: insError } = await db.from("grading_rules").insert(
      input.rules.map((r) => ({
        school_id: ctx.profile.schoolId,
        grading_system_id: id,
        min_percentage: r.minPercentage,
        max_percentage: r.maxPercentage,
        grade: r.grade,
        grade_point: r.gradePoint ?? null,
        remark_template: r.remarkTemplate ?? null,
      })),
    );
    throwForPostgrest(insError);
  }
  if (Object.keys(row).length > 0) {
    const { error: updError } = await db
      .from("grading_systems")
      .update(row)
      .eq("id", id)
      .eq("school_id", ctx.profile.schoolId);
    throwForPostgrest(updError);
  }
  if (input.isDefault === true) {
    const { error: unsetError } = await db
      .from("grading_systems")
      .update({ is_default: false })
      .eq("school_id", ctx.profile.schoolId)
      .neq("id", id);
    if (unsetError !== null) throw new Error(unsetError.message);
  }
  await logAudit(db, ctx, "grading_system.updated", "grading_systems", id, {
    fields: Object.keys(row).concat(input.rules !== undefined ? ["rules"] : []),
  });
  return { id };
}

export { listGradingSystems };
export type { GradingSystemDto };
