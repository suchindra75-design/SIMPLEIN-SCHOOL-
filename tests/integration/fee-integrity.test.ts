import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { recordPayment, verifyPaymentRecord, voidPaymentRecord } from "@/lib/services/fees";
import { ConflictError } from "@/lib/services/errors";
import { as, schoolId, serviceClient, studentByAdmission, type Actor } from "./helpers";
import { asApiUser, DbSession, lockWaiters, waitUntil } from "./db-session";

/**
 * Migrations 0022/0024 through the real Supabase API: an admin using their
 * own session directly against PostgREST (the bypass the app-level checks
 * could not stop) versus the legitimate app flow. Uses Arjun's seeded fee
 * (GPS-2026-005, 25,000, no payments) and a throwaway fee structure, and
 * removes the payments, assignments and structure it creates (audit rows are
 * append-only and stay).
 *
 * Concurrency is deterministic: a direct database session holds the
 * assignment row lock while the competing requests are sent, and the test
 * waits until the database reports them all blocked before releasing it.
 */
describe("fee payment integrity (database-enforced, via the Supabase API)", () => {
  const svc = serviceClient();
  let maker: Actor;
  let checker: Actor;
  let feeId = "";
  let schoolUuid = "";
  const created: string[] = [];

  const insertDirect = async (actor: Actor, row: Record<string, unknown>, studentFeeId = feeId) => {
    const result = await actor.db
      .from("fee_payment_records")
      .insert({ school_id: schoolUuid, student_fee_id: studentFeeId, paid_on: "2026-10-10", mode: "CASH", ...row })
      .select("id")
      .single();
    // Track every row that was actually created (even ones a failing run
    // should have rejected) so afterAll always cleans up.
    if (result.data !== null) created.push((result.data as { id: string }).id);
    return result;
  };

  const outstanding = async () => {
    const { data } = await svc.from("fee_payment_records").select("amount").eq("student_fee_id", feeId).eq("is_voided", false);
    return 25000 - ((data ?? []) as { amount: number }[]).reduce((s, r) => s + Number(r.amount), 0);
  };

  beforeAll(async () => {
    maker = await as("admin");
    checker = await as("admin2");
    const arjun = await studentByAdmission("GPS-2026-005");
    const { data } = await svc.from("student_fees").select("id, school_id, total_amount").eq("student_id", arjun.id).single();
    const fee = data as { id: string; school_id: string; total_amount: number };
    feeId = fee.id;
    schoolUuid = fee.school_id;
    expect(Number(fee.total_amount)).toBe(25000);
  });

  afterAll(async () => {
    // Trusted cleanup (service role, audited by the database).
    for (const id of created) await svc.from("fee_payment_records").delete().eq("id", id);
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
    const ins = await insertDirect(maker, { amount: 1000, recorded_by: maker.ctx.profile.id, created_at: "2020-01-01T00:00:00Z" });
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

    // Nothing changed, and the supplied creation time was not accepted.
    const { data: still } = await svc.from("fee_payment_records").select("amount, verified_by, recorded_by, created_at").eq("id", id).single();
    expect(still).toMatchObject({ amount: 1000, verified_by: null, recorded_by: maker.ctx.profile.id });
    expect(new Date((still as { created_at: string }).created_at).getTime()).toBeGreaterThan(Date.now() - 3_600_000);

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

  it("serialises truly overlapping recordings so the balance cannot be overpaid", async () => {
    const each = Math.floor((await outstanding()) / 2) + 1; // two of these cannot both fit
    const holder = new DbSession("it-fee-lock-holder");
    try {
      await holder.run(`BEGIN; SELECT 1 FROM public.student_fees WHERE id = '${feeId}' FOR UPDATE;`);
      const pending = [
        insertDirect(maker, { amount: each, recorded_by: maker.ctx.profile.id }),
        insertDirect(maker, { amount: each, recorded_by: maker.ctx.profile.id }),
      ];
      // Both requests are inside their transactions, blocked on the same row.
      await waitUntil(() => lockWaiters({ queryLike: "%fee_payment_records%" }) >= 2, "both API inserts to block on the assignment row");
      await holder.run("COMMIT;");
      const results = await Promise.all(pending);
      expect(results.filter((r) => r.error === null)).toHaveLength(1);
      const rejected = results.filter((r) => r.error !== null);
      expect(rejected.map((r) => r.error?.code)).toEqual(["SF001"]);
      expect(rejected[0]!.error?.message).toMatch(/outstanding balance/);
    } finally {
      holder.close();
    }
  });

  it("maps database rule violations to readable app errors", async () => {
    const id = created.find(Boolean)!;
    // The checker voids through the app; a direct un-void is refused by the database.
    await voidPaymentRecord(checker.db, checker.ctx, id, { reason: "integration test" });
    const unvoid = await checker.db.from("fee_payment_records").update({ is_voided: false }).eq("id", id);
    expect(unvoid.error?.code).toBe("SF001");
    // Two app-level recordings at once: both pass the app's own balance check
    // (the lock holder keeps either from committing first), so only the
    // database can stop the second, and the app must surface that as a
    // readable ConflictError, not a raw database error.
    const each = Math.floor((await outstanding()) / 2) + 1;
    const holder = new DbSession("it-fee-lock-holder-app");
    try {
      await holder.run(`BEGIN; SELECT 1 FROM public.student_fees WHERE id = '${feeId}' FOR UPDATE;`);
      const settledPromise = Promise.allSettled([
        recordPayment(maker.db, maker.ctx, feeId, { amount: each, paidOn: "2026-10-11", mode: "CASH" }),
        recordPayment(maker.db, maker.ctx, feeId, { amount: each, paidOn: "2026-10-11", mode: "CASH" }),
      ]);
      await waitUntil(() => lockWaiters({ queryLike: "%fee_payment_records%" }) >= 2, "both app recordings to block in the database");
      await holder.run("COMMIT;");
      const settled = await settledPromise;
      for (const r of settled) if (r.status === "fulfilled") created.push(r.value.id);
      const rejected = settled.filter((r): r is PromiseRejectedResult => r.status === "rejected");
      expect(rejected).toHaveLength(1);
      expect(rejected[0]!.reason).toBeInstanceOf(ConflictError);
      // The database's message (not the app's own pre-check wording).
      expect((rejected[0]!.reason as Error).message).toMatch(/^Amount exceeds the outstanding balance \(\d+(\.\d+)?\)\.$/);
    } finally {
      holder.close();
    }
  });
});

describe("fee assignment integrity (migration 0024, via the Supabase API)", () => {
  const svc = serviceClient();
  let maker: Actor;
  let otherSchoolAdmin: Actor;
  let teacher: Actor;
  let makerAuthId = "";
  let school = "";
  let paidFeeId = "";
  let paidStudentId = "";
  let structureId = "";
  const raceFees: string[] = [];
  const racePayments: string[] = [];
  let students: Record<string, string> = {};

  beforeAll(async () => {
    maker = await as("admin");
    otherSchoolAdmin = await as("otherSchoolAdmin");
    teacher = await as("teacher");
    makerAuthId = maker.ctx.authUserId;
    school = await schoolId("greenfield-demo");
    const aarav = await studentByAdmission("GPS-2026-001"); // seeded, verified payment
    paidStudentId = aarav.id;
    const { data } = await svc.from("student_fees").select("id").eq("student_id", aarav.id).single();
    paidFeeId = (data as { id: string }).id;
    students = Object.fromEntries(
      await Promise.all(["GPS-2026-003", "GPS-2026-004", "GPS-2026-006", "GPS-2026-007"].map(async (a) => [a, (await studentByAdmission(a)).id])),
    );
    // A throwaway structure with two unpaid assignments for the race tests.
    const { data: year } = await svc.from("academic_years").select("id").eq("school_id", school).eq("is_current", true).single();
    const { data: structure, error } = await svc
      .from("fee_structures")
      .insert({ school_id: school, academic_year_id: (year as { id: string }).id, name: `IT assignment race ${Date.now()}` })
      .select("id")
      .single();
    if (error !== null) throw new Error(error.message);
    structureId = (structure as { id: string }).id;
    const { data: fees, error: feeError } = await svc
      .from("student_fees")
      .insert(["GPS-2026-003", "GPS-2026-004"].map((a) => ({ school_id: school, student_id: students[a], fee_structure_id: structureId, total_amount: 1000 })))
      .select("id");
    if (feeError !== null) throw new Error(feeError.message);
    raceFees.push(...(fees as { id: string }[]).map((f) => f.id));
  });

  afterAll(async () => {
    // Trusted cleanup: payments, then the assignments and the structure.
    await svc.from("fee_payment_records").delete().in("student_fee_id", raceFees);
    for (const id of racePayments) await svc.from("fee_payment_records").delete().eq("id", id);
    await svc.from("student_fees").delete().in("id", raceFees);
    if (structureId !== "") await svc.from("fee_structures").delete().eq("id", structureId);
  });

  const studentOf = async (id: string) => {
    const { data } = await svc.from("student_fees").select("student_id, fee_structure_id").eq("id", id).single();
    return data as { student_id: string; fee_structure_id: string };
  };

  it("an admin cannot move a paid assignment to another student or fee structure", async () => {
    const toStudent = await maker.db.from("student_fees").update({ student_id: students["GPS-2026-007"] }).eq("id", paidFeeId);
    expect(toStudent.error?.code).toBe("SF001");
    expect(toStudent.error?.message).toMatch(/has payment records/);
    const toStructure = await maker.db.from("student_fees").update({ fee_structure_id: structureId }).eq("id", paidFeeId);
    expect(toStructure.error?.code).toBe("SF001");
    expect((await studentOf(paidFeeId)).student_id).toBe(paidStudentId);
  });

  it("another school's admin and a teacher have no effect", async () => {
    const other = await otherSchoolAdmin.db.from("student_fees").update({ student_id: students["GPS-2026-007"] }).eq("id", paidFeeId).select("id");
    expect(other.data ?? []).toHaveLength(0);
    const byTeacher = await teacher.db.from("student_fees").update({ student_id: students["GPS-2026-007"] }).eq("id", paidFeeId).select("id");
    expect(byTeacher.data ?? []).toHaveLength(0);
    expect((await studentOf(paidFeeId)).student_id).toBe(paidStudentId);
  });

  it("race, payment first: the re-assignment waits for it, then is refused", async () => {
    const [feeA] = raceFees;
    const pay = new DbSession("it-race-pay");
    const move = new DbSession("it-race-move");
    try {
      const inserted = await pay.run(
        `BEGIN; ${asApiUser(makerAuthId)} INSERT INTO public.fee_payment_records (school_id, student_fee_id, amount, paid_on, mode, recorded_by)
         VALUES ('${school}', '${feeA}', 100, '2026-10-12', 'CASH', '${maker.ctx.profile.id}') RETURNING id;`,
      );
      const paymentId = /[0-9a-f-]{36}/.exec(inserted)?.[0];
      expect(paymentId).toBeDefined();
      racePayments.push(paymentId!);
      const moving = move.run(`BEGIN; ${asApiUser(makerAuthId)} UPDATE public.student_fees SET student_id = '${students["GPS-2026-006"]}' WHERE id = '${feeA}';`);
      await waitUntil(() => lockWaiters({ applicationName: "it-race-move" }) === 1, "the re-assignment to wait for the payment");
      await pay.run("COMMIT;");
      expect(await moving).toMatch(/has payment records/);
      await move.run("ROLLBACK;");
      expect((await studentOf(feeA!)).student_id).toBe(students["GPS-2026-003"]);
    } finally {
      pay.close();
      move.close();
    }
  });

  it("race, re-assignment first: the payment waits and lands on the assignment as re-assigned (audited)", async () => {
    const [, feeB] = raceFees;
    const pay = new DbSession("it-race-pay-2");
    const move = new DbSession("it-race-move-2");
    try {
      const moved = await move.run(`BEGIN; ${asApiUser(makerAuthId)} UPDATE public.student_fees SET student_id = '${students["GPS-2026-006"]}' WHERE id = '${feeB}';`);
      expect(moved).not.toMatch(/ERROR/);
      const paying = pay.run(
        `BEGIN; ${asApiUser(makerAuthId)} INSERT INTO public.fee_payment_records (school_id, student_fee_id, amount, paid_on, mode, recorded_by)
         VALUES ('${school}', '${feeB}', 100, '2026-10-12', 'CASH', '${maker.ctx.profile.id}') RETURNING id;`,
      );
      await waitUntil(() => lockWaiters({ applicationName: "it-race-pay-2" }) === 1, "the payment to wait for the re-assignment");
      await move.run("COMMIT;");
      const paid = await paying;
      expect(paid).not.toMatch(/ERROR/);
      // Inside the paying transaction, the assignment now belongs to the new student.
      expect(await pay.run(`SELECT student_id FROM public.student_fees WHERE id = '${feeB}';`)).toBe(students["GPS-2026-006"]);
      await pay.run("ROLLBACK;"); // keep the assignment unpaid
      // The (unpaid) re-assignment was audited once, with the old student.
      const { data: audits } = await svc
        .from("audit_logs")
        .select("actor_id, metadata")
        .eq("entity_id", feeB)
        .eq("action", "fee_assignment.db_reassigned");
      expect(audits ?? []).toHaveLength(1);
      expect((audits![0] as { actor_id: string; metadata: Record<string, string> }).metadata["old_student_id"]).toBe(students["GPS-2026-004"]);
      expect((audits![0] as { actor_id: string }).actor_id).toBe(maker.ctx.profile.id);
    } finally {
      pay.close();
      move.close();
    }
  });
});
