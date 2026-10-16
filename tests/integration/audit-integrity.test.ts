import { beforeAll, describe, expect, it } from "vitest";
import { logAudit } from "@/lib/services/audit";
import { as, serviceClient, type Actor } from "./helpers";

/**
 * Migration 0025 through the real Supabase API: members still append the
 * app's own audit events, but cannot forge database-written ones, and not
 * even the service-role key can edit or delete audit rows.
 */
describe("audit log integrity (via the Supabase API)", () => {
  const svc = serviceClient();
  let admin: Actor;
  let teacher: Actor;

  beforeAll(async () => {
    admin = await as("admin");
    teacher = await as("teacher");
  });

  const append = (actor: Actor, action: string, entity: string, metadata: Record<string, unknown> = {}) =>
    actor.db.from("audit_logs").insert({
      school_id: actor.ctx.profile.schoolId,
      actor_id: actor.ctx.profile.id,
      action,
      entity,
      entity_id: null,
      metadata,
    });

  it("the app's own audit events still work for every role (logAudit)", async () => {
    await expect(logAudit(teacher.db, teacher.ctx, "homework.updated", "homework", null, { test: "audit-integrity" })).resolves.toBeUndefined();
    await expect(logAudit(admin.db, admin.ctx, "fee_payment.verified", "fee_payment_records", null, {})).resolves.toBeUndefined();
  });

  it("a teacher cannot forge database payment events or fee events", async () => {
    for (const [action, entity, metadata] of [
      ["fee_payment.db_voided", "fee_payment_records", {}],
      ["fee_payment.db_verified", "fee_payment_records", { via: "api_user" }],
      ["fee_payment.voided", "fee_payment_records", {}],
      ["homework.updated", "homework", { via: "api_user" }],
    ] as const) {
      const { error } = await append(teacher, action, entity, metadata);
      expect(error?.code).toBe("42501");
    }
  });

  it("an admin cannot forge database-written events either", async () => {
    expect((await append(admin, "fee_payment.db_verified", "fee_payment_records", { via: "api_user" })).error?.code).toBe("42501");
    expect((await append(admin, "fee_assignment.db_reassigned", "student_fees")).error?.code).toBe("42501");
  });

  it("audit rows cannot be edited or deleted, even with the service-role key", async () => {
    const { data } = await svc.from("audit_logs").select("id, action").eq("school_id", admin.ctx.profile.schoolId).limit(1).single();
    const row = data as { id: string; action: string };
    const edit = await svc.from("audit_logs").update({ action: "tampered" }).eq("id", row.id);
    expect(edit.error?.code).toBe("SF001");
    const del = await svc.from("audit_logs").delete().eq("id", row.id);
    expect(del.error?.code).toBe("SF001");
    const byAdmin = await admin.db.from("audit_logs").delete().eq("id", row.id).select("id");
    expect(byAdmin.data ?? []).toHaveLength(0);
    const { data: still } = await svc.from("audit_logs").select("action").eq("id", row.id).single();
    expect((still as { action: string }).action).toBe(row.action);
  });
});
