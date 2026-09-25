import type { SessionContext } from "@/lib/auth/session";
import type { DbClient } from "@/lib/services/errors";

/**
 * Append-only audit writer. Called AFTER successful mutations with the
 * caller's user-context client (RLS enforces actor=self + own school).
 * Never logs passwords, secrets, or tokens — callers pass only ids/labels.
 */
export async function logAudit(
  db: DbClient,
  ctx: SessionContext,
  action: string,
  entity: string,
  entityId: string | null,
  metadata: Record<string, unknown> = {},
): Promise<void> {
  const { error } = await db.from("audit_logs").insert({
    school_id: ctx.profile.schoolId,
    actor_id: ctx.profile.id,
    action,
    entity,
    entity_id: entityId,
    metadata,
  });
  if (error !== null) {
    // Fail closed: a mutation without its audit trail is a security gap.
    throw new Error(`audit_failed: ${error.message}`);
  }
}
