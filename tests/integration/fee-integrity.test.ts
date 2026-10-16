import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { recordPayment, verifyPaymentRecord, voidPaymentRecord } from "@/lib/services/fees";
import { ConflictError } from "@/lib/services/errors";
import { as, serviceClient, studentByAdmission, type Actor } from "./helpers";

/**
 * Migration 0022 through the real Supabase API: an admin using their own
 * session directly against PostgREST (the bypass the app-level checks could
 * not stop) versus the legitimate app flow. Uses Arjun's seeded fee
 * (GPS-2026-005, 25,000, no payments) and removes everything it creates.
 */
describe("fee payment integrity (database-enforced, via the Supabase API)", () => {
  const svc = serviceClient();
  let maker: Actor;
  let checker: Actor;
  let feeId = "";
  let schoolId = "";
  const created: string[] = [];

  const insertDirect = async (actor: Actor, row: Record<string, unknown>) => {
    const result = await actor.db
      .from("fee_payment_records")
      .insert({ school_id: schoolId, student_fee_id: feeId, paid_on: "2026-10-10", mode: "CASH", ...row })
      .select("id")
      .single();
    // Track every row that was actually created (even ones a failing run
    // should have rejected) so afterAll always cleans up.
    if (result.data !== null) created.push((result.data as { id: string }).id);
    return result;
  };

  beforeAll(async () => {
    maker = await as("admin");
    checker = await as("admin2");
    const arjun = await studentByAdmission("GPS-2026-005");
    const { data } = await svc.from("student_fees").select("id, school_id, total_amount").eq("student_id", arjun.id).single();
    const fee = data as { id: string; school_id: string; total_amount: number };
    feeId = fee.id;
    schoolId = fee.school_id;
    expect(Number(fee.total_amount)).toBe(25000);
  });

  afterAll(async () => {
    // Trusted cleanup (service role); audit rows for these test records too.
    for (const id of created) {
      await svc.from("fee_payment_records").delete().eq("id", id);
      await svc.from("audit_logs").delete().eq("entity_id", id);
    }
  });

  it("rejects direct API inserts that skip maker-checker", async () => {
    const asOther = await insertDirect(maker, { amount: 100, recorded_by: checker.ctx.profile.id });
    expect(asOther.error?.code).toBe("SF001");
    expect(asOther.error?.message).toMatch(/own name/);

    const preVerified = await insertDirect(maker, {
      amount: 100,
      recorded_by: maker.ctx.profile.id,
      verified_by: checker.ctx.profile.id,
    });
    expect(preVerified.error?.code).toBe("SF001");

    const over = await insertDirect(maker, { amount: 25001, recorded_by: maker.ctx.profile.id });
    expect(over.error?.code).toBe("SF001");
    expect(over.error?.message).toMatch(/outstanding balance/);
  });

  it("rejects self-verification, tampering and deletion; allows second-admin verification", async () => {
    const ins = await insertDirect(maker, { amount: 1000, recorded_by: maker.ctx.profile.id });
    expect(ins.error).toBeNull();
    const id = (ins.data as { id: string }).id;

    const selfVerify = await maker.db.from("fee_payment_records").update({ verified_by: maker.ctx.profile.id }).eq("id", id);
    expect(selfVerify.error?.code).toBe("SF001");
    const fakeChecker = await maker.db.from("fee_payment_records").update({ verified_by: checker.ctx.profile.id }).eq("id", id);
    expect(fakeChecker.error?.code).toBe("SF001");
    const amountEdit = await maker.db.from("fee_payment_records").update({ amount: 1 }).eq("id", id);
    expect(amountEdit.error?.code).toBe("SF001");
    const swapMaker = await maker.db.from("fee_payment_records").update({ recorded_by: checker.ctx.profile.id }).eq("id", id);
    expect(swapMaker.error?.code).toBe("SF001");
    const del = await maker.db.from("fee_payment_records").delete().eq("id", id);
    expect(del.error?.code).toBe("SF001");

    // Nothing changed.
    const { data: still } = await svc.from("fee_payment_records").select("amount, verified_by, recorded_by").eq("id", id).single();
    expect(still).toMatchObject({ amount: 1000, verified_by: null, recorded_by: maker.ctx.profile.id });

    // The legitimate path (app service, second admin) works.
    await verifyPaymentRecord(checker.db, checker.ctx, id);
    const { data: verified } = await svc.from("fee_payment_records").select("verified_by").eq("id", id).single();
    expect((verified as { verified_by: string }).verified_by).toBe(checker.ctx.profile.id);

    // A verification cannot be removed or changed afterwards, even by the checker.
    const unverify = await checker.db.from("fee_payment_records").update({ verified_by: null }).eq("id", id);
    expect(unverify.error?.code).toBe("SF001");
    const checkerAmount = await checker.db.from("fee_payment_records").update({ amount: 999 }).eq("id", id);
    expect(checkerAmount.error?.code).toBe("SF001");

    // Audit: one DB-written row each for recording and verification, by the right actors.
    const { data: audits } = await svc
      .from("audit_logs")
      .select("action, actor_id, metadata")
      .eq("entity_id", id)
      .like("action", "fee_payment.db_%")
      .order("created_at");
    const rows = (audits ?? []) as { action: string; actor_id: string; metadata: { via: string } }[];
    expect(rows.map((r) => [r.action, r.actor_id, r.metadata.via])).toEqual([
      ["fee_payment.db_recorded", maker.ctx.profile.id, "api_user"],
      ["fee_payment.db_verified", checker.ctx.profile.id, "api_user"],
    ]);
  });

  it("serialises concurrent recordings so the balance cannot be overpaid", async () => {
    const { data: paidRows } = await svc
      .from("fee_payment_records")
      .select("amount")
      .eq("student_fee_id", feeId)
      .eq("is_voided", false);
    const outstanding = 25000 - ((paidRows ?? []) as { amount: number }[]).reduce((s, r) => s + Number(r.amount), 0);
    const each = Math.floor(outstanding / 2) + 1; // two of these cannot both fit
    const results = await Promise.all([
      insertDirect(maker, { amount: each, recorded_by: maker.ctx.profile.id }),
      insertDirect(maker, { amount: each, recorded_by: maker.ctx.profile.id }),
    ]);
    expect(results.filter((r) => r.error === null)).toHaveLength(1);
    expect(results.filter((r) => r.error?.code === "SF001")).toHaveLength(1);
  });

  it("maps database rule violations to readable app errors", async () => {
    const id = created[0]!;
    // The checker voids through the app; voiding again is refused (app check),
    // and a direct un-void is refused by the database.
    await voidPaymentRecord(checker.db, checker.ctx, id, { reason: "integration test" });
    const unvoid = await checker.db.from("fee_payment_records").update({ is_voided: false }).eq("id", id);
    expect(unvoid.error?.code).toBe("SF001");
    // Two app-level recordings at once: both pass the app's own balance check,
    // so only the database lock can stop the second. The app must surface that
    // rejection as a readable ConflictError, not a raw database error.
    const { data: paidRows } = await svc
      .from("fee_payment_records")
      .select("amount")
      .eq("student_fee_id", feeId)
      .eq("is_voided", false);
    const outstanding = 25000 - ((paidRows ?? []) as { amount: number }[]).reduce((s, r) => s + Number(r.amount), 0);
    const each = Math.floor(outstanding / 2) + 1;
    const settled = await Promise.allSettled([
      recordPayment(maker.db, maker.ctx, feeId, { amount: each, paidOn: "2026-10-11", mode: "CASH" }),
      recordPayment(maker.db, maker.ctx, feeId, { amount: each, paidOn: "2026-10-11", mode: "CASH" }),
    ]);
    for (const r of settled) if (r.status === "fulfilled") created.push(r.value.id);
    const rejected = settled.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    expect(rejected).toHaveLength(1);
    expect(rejected[0]!.reason).toBeInstanceOf(ConflictError);
    expect((rejected[0]!.reason as Error).message).toMatch(/outstanding balance/);
  });
});
