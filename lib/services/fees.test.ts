import { describe, expect, it } from "vitest";
import type { SessionContext } from "@/lib/auth/session";
import { ForbiddenError, TenantBoundaryError } from "@/lib/auth/session";
import {
  ConflictError,
  NotFoundError,
} from "@/lib/services/errors";
import { createFakeDb, type Row } from "@/lib/test/fake-db";
import type { DbClient } from "@/lib/services/errors";
import {
  concessionAmount,
  feeBalance,
  structureTotal,
} from "@/lib/services/fees/calc";
import {
  assignFees,
  createFeeStructure,
  getPaymentReceiptUrl,
  listFeeStructures,
  listStudentFees,
  recordPayment,
  setPaymentReceipt,
  verifyPaymentRecord,
  voidPaymentRecord,
} from "@/lib/services/fees";

/**
 * Server-boundary authorization suite for Phase 11 fee tracking (RECORDS
 * ONLY — no payment processing). A programmable fake stands in for
 * PostgREST/Storage so tests assert tenant injection, parent-child scope,
 * teacher denial, balance/concession math, overpayment rejection, receipt
 * authorization, and audit. Database-level RLS and triggers are reviewed in
 * migration 0011 and exercised live via supabase/tests/phase11_rls.sql.
 */

const A = "school-a";
const B = "school-b";

function baseCtx(
  roles: SessionContext["roles"],
  userId = "u-admin",
): SessionContext {
  return {
    authUserId: `auth-${userId}`,
    profile: {
      id: userId,
      authUserId: `auth-${userId}`,
      schoolId: A,
      email: `${userId}@example.com`,
      fullName: userId,
      phone: null,
      isActive: true,
    },
    school: {
      id: A,
      name: "School A",
      slug: "a",
      timezone: "Asia/Kolkata",
      logoPath: null,
      primaryColor: null,
      isActive: true,
    },
    roles,
  };
}

const adminCtx = () => baseCtx(["SCHOOL_ADMIN"]);
const admin2Ctx = () => baseCtx(["SCHOOL_ADMIN"], "u-admin2");
const teacherCtx = () => baseCtx(["TEACHER"], "u-teacher");
const parentCtx = () => baseCtx(["PARENT"], "u-parent");

function seed(): Record<string, Row[]> {
  return {
    teachers: [
      { id: "t1", school_id: A, user_id: "u-teacher", employee_no: "E1", display_name: "Ravi", is_active: true },
      { id: "tb", school_id: B, user_id: "u-tb", employee_no: "E9", display_name: "Other", is_active: true },
    ],
    parents: [
      { id: "p1", school_id: A, user_id: "u-parent", full_name: "Rajesh", is_active: true },
      { id: "pb", school_id: B, user_id: "u-pb", full_name: "Far", is_active: true },
    ],
    users: [
      { id: "u-admin", school_id: A, email: "admin@a.example", full_name: "Admin", is_active: true },
      { id: "u-admin2", school_id: A, email: "admin2@a.example", full_name: "Admin Two", is_active: true },
      { id: "u-admin-b", school_id: B, email: "admin@b.example", full_name: "Admin B", is_active: true },
    ],
    user_roles: [
      { user_id: "u-admin", role: "SCHOOL_ADMIN" },
      { user_id: "u-admin2", role: "SCHOOL_ADMIN" },
      { user_id: "u-admin-b", role: "SCHOOL_ADMIN" },
    ],
    classes: [
      { id: "c7", school_id: A, name: "Grade 7" },
      { id: "cb1", school_id: B, name: "Grade 1" },
    ],
    sections: [
      { id: "sec7a", school_id: A, class_id: "c7", name: "A", is_active: true },
      { id: "secb", school_id: B, class_id: "cb1", name: "A", is_active: true },
    ],
    subjects: [
      { id: "sub-m", school_id: A, name: "Math" },
      { id: "subb", school_id: B, name: "Art" },
    ],
    teacher_subjects: [],
    students: [
      { id: "s1", school_id: A, admission_no: "A1", display_name: "Rahul", class_id: "c7", section_id: "sec7a", status: "active" },
      { id: "s2", school_id: A, admission_no: "A2", display_name: "Ananya", class_id: "c7", section_id: "sec7a", status: "active" },
      { id: "sb1", school_id: B, admission_no: "B1", display_name: "Far Child", class_id: "cb1", section_id: "secb", status: "active" },
    ],
    student_parents: [
      { student_id: "s1", parent_id: "p1", relation: "father", is_primary: true },
    ],
    academic_years: [
      { id: "y1", school_id: A, name: "2026-27", starts_on: "2026-04-01", ends_on: "2027-03-31", is_current: true },
      { id: "yb", school_id: B, name: "2026-27", starts_on: "2026-04-01", ends_on: "2027-03-31", is_current: true },
    ],
    fee_structures: [
      {
        id: "fs1", school_id: A, academic_year_id: "y1", class_id: "c7",
        name: "2026-27 · Grade 5", due_date: "2026-06-01", is_active: true,
        academic_years: { name: "2026-27" }, classes: { name: "Grade 7" },
        fee_components: [
          { name: "Tuition Fee", amount: 30000 },
          { name: "Transport Fee", amount: 8000 },
          { name: "Activity Fee", amount: 2000 },
        ],
      },
      {
        id: "fsb", school_id: B, academic_year_id: "yb", class_id: "cb1",
        name: "2026-27 · B", due_date: null, is_active: true,
        fee_components: [{ name: "Art Fee", amount: 5000 }],
      },
    ],
    fee_components: [
      { id: "fc1", school_id: A, fee_structure_id: "fs1", name: "Tuition Fee", amount: 30000 },
      { id: "fc2", school_id: A, fee_structure_id: "fs1", name: "Transport Fee", amount: 8000 },
      { id: "fc3", school_id: A, fee_structure_id: "fs1", name: "Activity Fee", amount: 2000 },
      { id: "fcb", school_id: B, fee_structure_id: "fsb", name: "Art Fee", amount: 5000 },
    ],
    student_fees: [
      { id: "sf1", school_id: A, student_id: "s1", fee_structure_id: "fs1", total_amount: 40000, due_date: "2026-06-01" },
      { id: "sf2", school_id: A, student_id: "s2", fee_structure_id: "fs1", total_amount: 30000, due_date: "2026-06-01" }, // concession
      { id: "sfb", school_id: B, student_id: "sb1", fee_structure_id: "fsb", total_amount: 5000, due_date: null },
    ],
    fee_payment_records: [
      {
        id: "pr1", school_id: A, student_fee_id: "sf1", amount: 25000,
        paid_on: "2026-05-20", mode: "CASH", reference_no: "REF-001",
        receipt_bucket: "fee-receipts", receipt_path: "schools/school-a/fee-receipts/pr1.pdf",
        receipt_name: "receipt.pdf", receipt_mime: "application/pdf", receipt_bytes: 2048,
        recorded_by: "u-admin2", verified_by: "u-admin", is_voided: false,
        void_reason: null, version: 1,
      },
      {
        id: "prb", school_id: B, student_fee_id: "sfb", amount: 5000,
        paid_on: "2026-05-20", mode: "CASH", reference_no: null,
        receipt_bucket: null, receipt_path: null, receipt_name: null,
        receipt_mime: null, receipt_bytes: null,
        recorded_by: "u-admin-b", verified_by: "u-admin-b", is_voided: false,
        void_reason: null, version: 1,
      },
    ],
    audit_logs: [],
  };
}

const db = () => createFakeDb(seed()) as unknown as DbClient;

describe("balance calculation (pure)", () => {
  it("paid = Σ(verified, non-voided); due = total − paid", () => {
    const balance = feeBalance(40000, [
      { amount: 25000, isVoided: false, verified: true },
    ]);
    expect(balance).toEqual({
      total: 40000,
      paid: 25000,
      due: 15000,
      status: "PARTIAL",
      overdue: false,
    });
  });

  it("voided and unverified records are excluded", () => {
    const balance = feeBalance(40000, [
      { amount: 25000, isVoided: false, verified: true },
      { amount: 10000, isVoided: true, verified: true },
      { amount: 5000, isVoided: false, verified: false },
    ]);
    expect(balance.paid).toBe(25000);
    expect(balance.due).toBe(15000);
  });

  it("fully paid → PAID; overdue when past due date with due > 0", () => {
    expect(feeBalance(40000, [{ amount: 40000, isVoided: false, verified: true }]).status).toBe("PAID");
    expect(
      feeBalance(
        40000,
        [{ amount: 10000, isVoided: false, verified: true }],
        { dueDate: "2026-06-01", today: "2026-09-25" },
      ).overdue,
    ).toBe(true);
    expect(
      feeBalance(40000, [], { dueDate: "2026-06-01", today: "2026-09-25" }).status,
    ).toBe("DUE");
  });

  it("structure total = Σ components; concession = total − assigned", () => {
    const total = structureTotal([
      { amount: 30000 },
      { amount: 8000 },
      { amount: 2000 },
    ]);
    expect(total).toBe(40000);
    expect(concessionAmount(40000, 30000)).toBe(10000);
    expect(concessionAmount(40000, 0)).toBe(40000); // full waiver
    expect(concessionAmount(40000, 45000)).toBe(0); // never negative
  });
});

describe("tenant isolation", () => {
  it("admin lists only own-school structures", async () => {
    const { structures } = await listFeeStructures(db(), adminCtx());
    expect(structures.map((s) => s.id)).toEqual(["fs1"]);
    expect(structures[0]?.total).toBe(40000);
  });

  it("admin cannot read a School B student's fees (404)", async () => {
    await expect(listStudentFees(db(), adminCtx(), "sb1")).rejects.toThrow(
      NotFoundError,
    );
  });

  it("admin cannot assign fees to a School B student (404)", async () => {
    const fake = createFakeDb(seed());
    await expect(
      assignFees(fake as unknown as DbClient, adminCtx(), "fs1", {
        studentIds: ["sb1"],
      }),
    ).rejects.toThrow(NotFoundError);
    expect(fake.callsTo("student_fees", "upsert")).toHaveLength(0);
  });

  it("admin cannot record payments against a School B assignment (404)", async () => {
    await expect(
      recordPayment(db(), adminCtx(), "sfb", {
        amount: 1000,
        paidOn: "2026-09-20",
        mode: "CASH",
      }),
    ).rejects.toThrow(NotFoundError);
  });

  it("cross-school fee structure creation is denied", async () => {
    const fake = createFakeDb(seed());
    await expect(
      createFeeStructure(fake as unknown as DbClient, adminCtx(), {
        name: "Hijack",
        academicYearId: "yb",
        classId: "c7",
        components: [{ name: "X", amount: 1000 }],
      }),
    ).rejects.toThrow(NotFoundError);
    expect(fake.callsTo("fee_structures", "insert")).toHaveLength(0);
  });
});

describe("teacher denial", () => {
  it("teachers have no fee access (matrix has no fees entry)", async () => {
    const fake = createFakeDb(seed());
    const client = fake as unknown as DbClient;
    await expect(listFeeStructures(client, teacherCtx())).rejects.toThrow(
      ForbiddenError,
    );
    await expect(
      recordPayment(client, teacherCtx(), "sf1", {
        amount: 1000,
        paidOn: "2026-09-20",
        mode: "CASH",
      }),
    ).rejects.toThrow(ForbiddenError);
    expect(fake.callsTo("fee_payment_records", "insert")).toHaveLength(0);
  });
});

describe("parent-child fee access", () => {
  it("parent reads the linked child's fees with balances", async () => {
    const { fees } = await listStudentFees(db(), parentCtx(), "s1");
    expect(fees).toHaveLength(1);
    expect(fees[0]).toMatchObject({
      total: 40000,
      paid: 25000,
      due: 15000,
      status: "PARTIAL",
    });
    // Parent sees only structures assigned to linked children.
    const { structures } = await listFeeStructures(db(), parentCtx());
    expect(structures.map((s) => s.id)).toEqual(["fs1"]);
  });

  it("parent cannot read an unlinked child's fees — 404", async () => {
    // s2 is in sec7a but NOT linked to p1.
    await expect(listStudentFees(db(), parentCtx(), "s2")).rejects.toThrow(
      TenantBoundaryError,
    );
    await expect(listStudentFees(db(), parentCtx(), "sb1")).rejects.toThrow(
      NotFoundError,
    );
  });

  it("parent cannot record/verify/void payments or upload receipts", async () => {
    const fake = createFakeDb(seed());
    const client = fake as unknown as DbClient;
    await expect(
      recordPayment(client, parentCtx(), "sf1", {
        amount: 1000,
        paidOn: "2026-09-20",
        mode: "CASH",
      }),
    ).rejects.toThrow(ForbiddenError);
    await expect(verifyPaymentRecord(client, parentCtx(), "pr1")).rejects.toThrow(
      ForbiddenError,
    );
    await expect(
      voidPaymentRecord(client, parentCtx(), "pr1", { reason: "nope" }),
    ).rejects.toThrow(ForbiddenError);
    expect(fake.callsTo("fee_payment_records", "insert")).toHaveLength(0);
  });
});

describe("payment-record validation", () => {
  it("rejects overpayment beyond the outstanding balance", async () => {
    // sf1: 40000 total, 25000 verified → due 15000; 20000 > due → 409.
    await expect(
      recordPayment(db(), adminCtx(), "sf1", {
        amount: 20000,
        paidOn: "2026-09-20",
        mode: "CASH",
      }),
    ).rejects.toThrow(ConflictError);
    await expect(
      recordPayment(db(), adminCtx(), "sf1", {
        amount: 15000,
        paidOn: "2026-09-20",
        mode: "CASH",
      }),
    ).resolves.toBeDefined(); // exactly the due amount is fine
  });

  it("rejects invalid amounts (zero/negative via Zod; service checks > 0)", async () => {
    await expect(
      recordPayment(db(), adminCtx(), "sf1", {
        amount: 0,
        paidOn: "2026-09-20",
        mode: "CASH",
      }),
    ).rejects.toThrow(ConflictError);
    await expect(
      recordPayment(db(), adminCtx(), "sf1", {
        amount: -100,
        paidOn: "2026-09-20",
        mode: "CASH",
      }),
    ).rejects.toThrow(ConflictError);
  });

  it("maker-checker: a recorder cannot verify or void their own record", async () => {
    // pr1 recorded by u-admin2; admin2 tries to verify/void → 409.
    await expect(verifyPaymentRecord(db(), admin2Ctx(), "pr1")).rejects.toThrow(
      ConflictError,
    );
    await expect(
      voidPaymentRecord(db(), admin2Ctx(), "pr1", { reason: "self void" }),
    ).rejects.toThrow(ConflictError);
    // The other admin (u-admin) CAN void it.
    await expect(
      voidPaymentRecord(db(), adminCtx(), "pr1", { reason: "duplicate entry" }),
    ).resolves.toBeDefined();
    // Voided records cannot be verified.
    await expect(verifyPaymentRecord(db(), admin2Ctx(), "pr1")).rejects.toThrow(
      ConflictError,
    );
  });

  it("concession snapshot cannot exceed the structure total", async () => {
    await expect(
      assignFees(db(), adminCtx(), "fs1", {
        studentIds: ["s1"],
        totalAmount: 50000, // structure total is 40000
      }),
    ).rejects.toThrow(ConflictError);
  });
});

describe("receipt authorization", () => {
  it("admin sets a receipt (validated, private bucket, audited)", async () => {
    const fake = createFakeDb(seed());
    await setPaymentReceipt(fake as unknown as DbClient, adminCtx(), "pr1", {
      name: "receipt.pdf",
      type: "application/pdf",
      size: 2048,
      bytes: new ArrayBuffer(2048),
    });
    const uploads = fake.callsTo("storage:fee-receipts", "insert");
    expect(uploads).toHaveLength(1);
    const path = (uploads[0]?.payload as { path: string }).path;
    expect(path.startsWith(`schools/${A}/fee-receipts/`)).toBe(true);
  });

  it("invalid receipt types are rejected", async () => {
    await expect(
      setPaymentReceipt(db(), adminCtx(), "pr1", {
        name: "evil.exe",
        type: "application/x-msdownload",
        size: 2048,
        bytes: new ArrayBuffer(2048),
      }),
    ).rejects.toThrow(ConflictError);
  });

  it("parent downloads receipts only within their child's scope", async () => {
    const url = await getPaymentReceiptUrl(db(), parentCtx(), "pr1");
    expect(url.startsWith("https://signed.test/fee-receipts/")).toBe(true);
    // A School B receipt → 404.
    await expect(getPaymentReceiptUrl(db(), parentCtx(), "prb")).rejects.toThrow(
      NotFoundError,
    );
  });
});

describe("audit logging", () => {
  it("audits structure creation, assignment, payment records, and verification", async () => {
    const fake = createFakeDb(seed());
    const client = fake as unknown as DbClient;
    await createFeeStructure(client, adminCtx(), {
      name: "New structure",
      academicYearId: "y1",
      classId: "c7",
      components: [{ name: "Lab Fee", amount: 3000 }],
    });
    await assignFees(client, adminCtx(), "fs1", { studentIds: ["s1"] });
    // Record by u-admin, verified by u-admin2 (maker ≠ checker).
    await recordPayment(client, adminCtx(), "sf2", {
      amount: 5000,
      paidOn: "2026-09-20",
      mode: "CHEQUE",
    });
    const newRecord = (fake.seed["fee_payment_records"] as Row[]).find(
      (r) => r["mode"] === "CHEQUE",
    );
    const newRecordId = newRecord?.["id"] as string;
    await verifyPaymentRecord(client, admin2Ctx(), newRecordId);
    const audits = fake.callsTo("audit_logs", "insert");
    const actions = audits.map((a) => (a.payload as Row)["action"]);
    expect(actions).toContain("fee_structure.created");
    expect(actions).toContain("fee_assigned");
    expect(actions).toContain("fee_payment.recorded");
    expect(actions).toContain("fee_payment.verified");
    expect(audits[0]?.payload).toMatchObject({ school_id: A });
  });
});
