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
import {
  concessionAmount,
  feeBalance,
  structureTotal,
  type BalanceRecord,
} from "@/lib/services/fees/calc";
import { getParentScope } from "@/lib/services/parents";
import {
  buildAttachmentPath,
  signedBucketUrl,
  uploadToBucket,
  validateDocumentUpload,
} from "@/lib/services/storage";
import type {
  FeeAssignInput,
  FeePaymentRecordInput,
  FeeStructureCreateInput,
  FeeStructureUpdateInput,
  FeeVoidInput,
} from "@/lib/validation/fees";

/**
 * Fee tracking service (Phase 11). RECORDS-ONLY: fee_payment_records are
 * offline amounts a school staff member recorded as received — NO gateway,
 * NO online transactions, NO refunds (corrections are superseding audited
 * records). Overpayment is REJECTED (no credit/advance in V1 — documented).
 * Parents are read-only, linked children only. Teachers have no fee access
 * (RBAC matrix has no fees entry for TEACHER — deny-by-default).
 */

const STRUCTURE_COLUMNS =
  "id, school_id, academic_year_id, class_id, name, due_date, is_active, academic_years(name), classes(name)";
const COMPONENT_COLUMNS =
  "id, school_id, fee_structure_id, name, amount";
const ASSIGNMENT_COLUMNS =
  "id, school_id, student_id, fee_structure_id, total_amount, due_date, fee_structures(name), students(display_name, admission_no)";
const RECORD_COLUMNS =
  "id, school_id, student_fee_id, amount, paid_on, mode, reference_no, receipt_bucket, receipt_path, receipt_name, receipt_mime, receipt_bytes, recorded_by, verified_by, is_voided, void_reason, version, created_at";

const FEE_RECEIPTS_BUCKET = "fee-receipts";

/* ------------------------------ scope helpers ---------------------------- */

/** Parent scope: linked children's student ids (null when not a parent). */
async function parentStudentIds(
  db: DbClient,
  ctx: SessionContext,
): Promise<Set<string> | null> {
  if (!ctx.roles.includes("PARENT")) return null;
  const scope = await getParentScope(db, ctx);
  return scope === null ? null : scope.studentIds;
}

/** Fee read scope: admin own school; parent linked children only; else 404. */
async function assertStudentFeeAccess(
  db: DbClient,
  ctx: SessionContext,
  studentId: string,
): Promise<void> {
  if (isAdmin(ctx)) return;
  if (ctx.roles.includes("PARENT")) {
    const scope = await parentStudentIds(db, ctx);
    if (scope === null || !scope.has(studentId)) {
      throw new TenantBoundaryError();
    }
    return;
  }
  if (ctx.roles.includes("STUDENT")) {
    // Student: own fees only.
    const { getStudentScope } = await import("@/lib/services/students");
    const scope = await getStudentScope(db, ctx);
    if (scope === null || scope.studentId !== studentId) {
      throw new TenantBoundaryError();
    }
    return;
  }
  throw new TenantBoundaryError();
}

/* ------------------------------ fee structures --------------------------- */

export async function listFeeStructures(
  db: DbClient,
  ctx: SessionContext,
): Promise<{ structures: FeeStructureDto[] }> {
  authorizeRoles(ctx, ["SCHOOL_ADMIN", "PARENT", "STUDENT"]);
  const { data, error } = await db
    .from("fee_structures")
    .select(`${STRUCTURE_COLUMNS}, fee_components(name, amount)`)
    .eq("school_id", ctx.profile.schoolId)
    .order("created_at", { ascending: false });
  throwForPostgrest(error);
  const structures = toCamel<FeeStructureDto[]>(
    (data ?? []).map((s) => ({
      ...(s as Record<string, unknown>),
      total: structureTotal(
        ((s as { fee_components?: unknown }).fee_components ?? []) as {
          amount: number;
        }[],
      ),
    })),
  );
  if (isAdmin(ctx)) return { structures };
  // Parent: structures assigned to linked children. Student: own assignments.
  let ownStudentIds: Set<string> | null;
  if (ctx.roles.includes("PARENT")) {
    ownStudentIds = await parentStudentIds(db, ctx);
  } else if (ctx.roles.includes("STUDENT")) {
    const { getStudentScope } = await import("@/lib/services/students");
    const scope = await getStudentScope(db, ctx);
    ownStudentIds = scope === null ? new Set<string>() : new Set([scope.studentId]);
  } else {
    throw new TenantBoundaryError();
  }
  if (ownStudentIds === null || ownStudentIds.size === 0) return { structures: [] };
  const { data: assignments, error: assignError } = await db
    .from("student_fees")
    .select("fee_structure_id")
    .in("student_id", [...ownStudentIds])
    .eq("school_id", ctx.profile.schoolId);
  throwForPostgrest(assignError);
  const assignedIds = new Set(
    (assignments as { fee_structure_id: string }[]).map((a) => a.fee_structure_id),
  );
  return {
    structures: structures.filter((s) => assignedIds.has(s.id)),
  };
}

/** Admin only. Creates the structure + components in one batch. */
export async function createFeeStructure(
  db: DbClient,
  ctx: SessionContext,
  input: FeeStructureCreateInput,
): Promise<{ id: string }> {
  authorizeRoles(ctx, ["SCHOOL_ADMIN"]);
  const { data: year, error: yearError } = await db
    .from("academic_years")
    .select("id")
    .eq("id", input.academicYearId)
    .eq("school_id", ctx.profile.schoolId)
    .single();
  if (yearError !== null || year === null) {
    throw new NotFoundError("Academic year not found in this school");
  }
  if (input.classId !== undefined && input.classId !== null) {
    const { data: cls, error: clsError } = await db
      .from("classes")
      .select("id")
      .eq("id", input.classId)
      .eq("school_id", ctx.profile.schoolId)
      .single();
    if (clsError !== null || cls === null) {
      throw new NotFoundError("Class not found in this school");
    }
  }
  const { data, error } = await db
    .from("fee_structures")
    .insert({
      school_id: ctx.profile.schoolId,
      academic_year_id: input.academicYearId,
      class_id: input.classId ?? null,
      name: input.name,
      due_date: input.dueDate ?? null,
      is_active: true,
    })
    .select("id")
    .single();
  throwForPostgrest(error);
  const id = (data as { id: string }).id;
  const { error: compError } = await db.from("fee_components").insert(
    input.components.map((c) => ({
      school_id: ctx.profile.schoolId,
      fee_structure_id: id,
      name: c.name,
      amount: c.amount,
    })),
  );
  throwForPostgrest(compError);
  await logAudit(db, ctx, "fee_structure.created", "fee_structures", id, {
    name: input.name,
    total: structureTotal(input.components),
  });
  return { id };
}

/** Admin only. Blocked when assignments have verified records (409). */
export async function updateFeeStructure(
  db: DbClient,
  ctx: SessionContext,
  id: string,
  patch: FeeStructureUpdateInput,
): Promise<{ id: string }> {
  authorizeRoles(ctx, ["SCHOOL_ADMIN"]);
  const { data: existing, error: existError } = await db
    .from("fee_structures")
    .select("id, due_date")
    .eq("id", id)
    .eq("school_id", ctx.profile.schoolId)
    .single();
  throwForPostgrest(existError, "Fee structure not found");
  const row = existing as unknown as { id: string; due_date: string | null };
  // Guard: verified records exist → structure is frozen (create a new one).
  const { data: assignments, error: assignError } = await db
    .from("student_fees")
    .select("id")
    .eq("fee_structure_id", id)
    .eq("school_id", ctx.profile.schoolId);
  throwForPostgrest(assignError);
  const assignmentIds = (assignments as { id: string }[]).map((a) => a.id);
  if (assignmentIds.length > 0) {
    const { data: records, error: recError } = await db
      .from("fee_payment_records")
      .select("id")
      .in("student_fee_id", assignmentIds)
      .eq("school_id", ctx.profile.schoolId)
      .eq("is_voided", false);
    throwForPostgrest(recError);
    const verified = ((records ?? []) as { id: string }[]).length > 0;
    if (verified && (patch.components !== undefined || patch.name !== undefined)) {
      throw new ConflictError(
        "This fee structure has verified payment records — create a new structure instead",
      );
    }
  }
  const update: Record<string, unknown> = {};
  if (patch.name !== undefined) update["name"] = patch.name;
  if (patch.dueDate !== undefined) update["due_date"] = patch.dueDate;
  if (patch.isActive !== undefined) update["is_active"] = patch.isActive;
  if (patch.components !== undefined) {
    // Replace components (atomicity note: delete + insert, band re-validated).
    const { error: delError } = await db
      .from("fee_components")
      .delete()
      .eq("fee_structure_id", id)
      .eq("school_id", ctx.profile.schoolId);
    throwForPostgrest(delError);
    const { error: insError } = await db.from("fee_components").insert(
      patch.components.map((c) => ({
        school_id: ctx.profile.schoolId,
        fee_structure_id: id,
        name: c.name,
        amount: c.amount,
      })),
    );
    throwForPostgrest(insError);
  }
  if (Object.keys(update).length > 0) {
    const { data, error } = await db
      .from("fee_structures")
      .update(update)
      .eq("id", id)
      .eq("school_id", ctx.profile.schoolId)
      .select("id")
      .single();
    throwForPostgrest(error, "Fee structure not found");
    void data;
  }
  await logAudit(db, ctx, "fee_structure.updated", "fee_structures", id, {
    fields: Object.keys(update).concat(patch.components !== undefined ? ["components"] : []),
  });
  return { id };
}

/** Admin only. Bulk-assigns the structure to students (concession snapshot). */
export async function assignFees(
  db: DbClient,
  ctx: SessionContext,
  structureId: string,
  input: FeeAssignInput,
): Promise<{ assigned: number }> {
  authorizeRoles(ctx, ["SCHOOL_ADMIN"]);
  const { data: structure, error: structureError } = await db
    .from("fee_structures")
    .select(`${STRUCTURE_COLUMNS}, fee_components(name, amount)`)
    .eq("id", structureId)
    .eq("school_id", ctx.profile.schoolId)
    .single();
  throwForPostgrest(structureError, "Fee structure not found");
  const typed = structure as unknown as {
    fee_components: { amount: number }[];
  };
  const total = structureTotal(typed.fee_components ?? []);
  // Concession rule: the snapshot may be BELOW the structure total, never above.
  const snapshot =
    input.totalAmount !== undefined && input.totalAmount !== null
      ? input.totalAmount
      : total;
  if (snapshot > total) {
    throw new ConflictError(
      "Assigned total cannot exceed the structure total",
    );
  }
  // Students must be in this school (404 on cross-tenant).
  const { data: students, error: studentError } = await db
    .from("students")
    .select("id")
    .in("id", input.studentIds)
    .eq("school_id", ctx.profile.schoolId);
  throwForPostgrest(studentError);
  if ((students ?? []).length !== input.studentIds.length) {
    throw new NotFoundError("One or more students not found in this school");
  }
  const { error } = await db.from("student_fees").upsert(
    input.studentIds.map((studentId) => ({
      school_id: ctx.profile.schoolId,
      student_id: studentId,
      fee_structure_id: structureId,
      total_amount: snapshot,
      due_date: input.dueDate ?? (structure as { due_date: string | null }).due_date,
    })),
    { onConflict: "student_id,fee_structure_id" },
  );
  throwForPostgrest(error);
  await logAudit(db, ctx, "fee_assigned", "student_fees", null, {
    structureId,
    students: input.studentIds.length,
    total: snapshot,
  });
  return { assigned: input.studentIds.length };
}

/* ------------------------------ student fee views ------------------------ */

export async function listStudentFees(
  db: DbClient,
  ctx: SessionContext,
  studentId: string,
): Promise<{ fees: StudentFeeDto[] }> {
  authorizeRoles(ctx, ["SCHOOL_ADMIN", "PARENT", "STUDENT"]);
  const { data: student, error: studentError } = await db
    .from("students")
    .select("id")
    .eq("id", studentId)
    .eq("school_id", ctx.profile.schoolId)
    .single();
  throwForPostgrest(studentError, "Student not found");
  void student;
  await assertStudentFeeAccess(db, ctx, studentId);
  const { data, error } = await db
    .from("student_fees")
    .select(ASSIGNMENT_COLUMNS)
    .eq("student_id", studentId)
    .eq("school_id", ctx.profile.schoolId);
  throwForPostgrest(error);
  const assignments = data as unknown as {
    id: string;
    total_amount: number;
    due_date: string | null;
    fee_structures?: { name: string } | null;
  }[];
  // ONE query for ALL payment records (no N+1 over assignments), then grouped.
  const assignmentIds = assignments.map((a) => a.id);
  const recordsByFee = new Map<string, PaymentRecordDto[]>();
  if (assignmentIds.length > 0) {
    const { data: allRecords, error: allRecError } = await db
      .from("fee_payment_records")
      .select(RECORD_COLUMNS)
      .in("student_fee_id", assignmentIds)
      .eq("school_id", ctx.profile.schoolId);
    throwForPostgrest(allRecError);
    for (const r of toCamel<PaymentRecordDto[]>(allRecords ?? [])) {
      const list = recordsByFee.get(r.studentFeeId) ?? [];
      list.push(r);
      recordsByFee.set(r.studentFeeId, list);
    }
  }
  const today = new Date().toISOString().slice(0, 10);
  const fees: StudentFeeDto[] = assignments.map((a) => {
    const recRows = recordsByFee.get(a.id) ?? [];
    const balance = feeBalance(
      a.total_amount,
      recRows.map((r) => ({
        amount: r.amount,
        isVoided: r.isVoided,
        verified: r.verifiedBy !== null,
      })),
      { dueDate: a.due_date, today },
    );
    return {
      id: a.id,
      total: balance.total,
      paid: balance.paid,
      due: balance.due,
      status: balance.status,
      overdue: balance.overdue,
      dueDate: a.due_date,
      structureName: a.fee_structures?.name ?? "Fee",
      records: recRows,
    };
  });
  return { fees };
}

/** Admin only. Records a payment received by the school (offline). */
export async function recordPayment(
  db: DbClient,
  ctx: SessionContext,
  studentFeeId: string,
  input: FeePaymentRecordInput,
): Promise<{ id: string }> {
  authorizeRoles(ctx, ["SCHOOL_ADMIN"]);
  const { data: assignment, error: assignError } = await db
    .from("student_fees")
    .select("id, total_amount")
    .eq("id", studentFeeId)
    .eq("school_id", ctx.profile.schoolId)
    .single();
  throwForPostgrest(assignError, "Fee assignment not found");
  const row = assignment as unknown as { id: string; total_amount: number };
  // Amount validity at the service level (Zod re-checks at the API).
  if (!(input.amount > 0)) {
    throw new ConflictError("Amount must be greater than 0");
  }
  // Overpayment rule: cumulative paid cannot exceed the assignment total.
  const { data: records, error: recError } = await db
    .from("fee_payment_records")
    .select("amount, is_voided, verified_by")
    .eq("student_fee_id", studentFeeId)
    .eq("school_id", ctx.profile.schoolId);
  throwForPostgrest(recError);
  const existingPaid = (records as unknown as {
    amount: number;
    is_voided: boolean;
    verified_by: string | null;
  }[])
    .filter((r) => !r.is_voided && r.verified_by !== null)
    .reduce((sum, r) => sum + r.amount, 0);
  const balance = feeBalance(row.total_amount, [
    { amount: existingPaid, isVoided: false, verified: true },
  ]);
  if (input.amount > balance.due) {
    throw new ConflictError(
      `Amount exceeds the outstanding balance (${balance.due}) — overpayment is not supported in V1`,
    );
  }
  const { data, error } = await db
    .from("fee_payment_records")
    .insert({
      school_id: ctx.profile.schoolId,
      student_fee_id: studentFeeId,
      amount: input.amount,
      paid_on: input.paidOn,
      mode: input.mode,
      reference_no: input.referenceNo ?? null,
      recorded_by: ctx.profile.id,
      is_voided: false,
    })
    .select("id")
    .single();
  throwForPostgrest(error);
  const id = (data as { id: string }).id;
  await logAudit(db, ctx, "fee_payment.recorded", "fee_payment_records", id, {
    studentFeeId,
    amount: input.amount,
    mode: input.mode,
    paidOn: input.paidOn,
  });
  return { id };
}

/** Admin only. Verify a record (maker ≠ checker — second-person rule). */
export async function verifyPaymentRecord(
  db: DbClient,
  ctx: SessionContext,
  recordId: string,
): Promise<{ id: string }> {
  authorizeRoles(ctx, ["SCHOOL_ADMIN"]);
  const { data: record, error: recError } = await db
    .from("fee_payment_records")
    .select("id, recorded_by, is_voided, verified_by")
    .eq("id", recordId)
    .eq("school_id", ctx.profile.schoolId)
    .single();
  throwForPostgrest(recError, "Payment record not found");
  const row = record as unknown as {
    id: string;
    recorded_by: string;
    is_voided: boolean;
    verified_by: string | null;
  };
  if (row.is_voided) {
    throw new ConflictError("Voided records cannot be verified");
  }
  if (row.recorded_by === ctx.profile.id) {
    throw new ConflictError(
      "Another admin must verify your records (maker-checker)",
    );
  }
  const { data, error } = await db
    .from("fee_payment_records")
    .update({ verified_by: ctx.profile.id })
    .eq("id", recordId)
    .eq("school_id", ctx.profile.schoolId)
    .select("id")
    .single();
  throwForPostgrest(error, "Payment record not found");
  await logAudit(db, ctx, "fee_payment.verified", "fee_payment_records", recordId, {});
  return { id: (data as { id: string }).id };
}

/** Admin only. Void a record (maker ≠ checker; record retained + audited). */
export async function voidPaymentRecord(
  db: DbClient,
  ctx: SessionContext,
  recordId: string,
  input: FeeVoidInput,
): Promise<{ id: string }> {
  authorizeRoles(ctx, ["SCHOOL_ADMIN"]);
  const { data: record, error: recError } = await db
    .from("fee_payment_records")
    .select("id, recorded_by, is_voided")
    .eq("id", recordId)
    .eq("school_id", ctx.profile.schoolId)
    .single();
  throwForPostgrest(recError, "Payment record not found");
  const row = record as unknown as { id: string; recorded_by: string; is_voided: boolean };
  if (row.is_voided) {
    throw new ConflictError("Record is already voided");
  }
  if (row.recorded_by === ctx.profile.id) {
    throw new ConflictError(
      "Another admin must void your records (maker-checker)",
    );
  }
  const { data, error } = await db
    .from("fee_payment_records")
    .update({ is_voided: true, void_reason: input.reason })
    .eq("id", recordId)
    .eq("school_id", ctx.profile.schoolId)
    .select("id")
    .single();
  throwForPostgrest(error, "Payment record not found");
  await logAudit(db, ctx, "fee_payment.voided", "fee_payment_records", recordId, {
    reason: input.reason,
  });
  return { id: (data as { id: string }).id };
}

/* ------------------------------- receipts -------------------------------- */

/** Admin only. Sets/updates the receipt document on a record. */
export async function setPaymentReceipt(
  db: DbClient,
  ctx: SessionContext,
  recordId: string,
  file: { name: string; type: string; size: number; bytes: ArrayBuffer },
): Promise<{ id: string }> {
  authorizeRoles(ctx, ["SCHOOL_ADMIN"]);
  const problem = validateDocumentUpload(file);
  if (problem !== null) throw new ConflictError(problem);
  const { data: record, error: recError } = await db
    .from("fee_payment_records")
    .select("id")
    .eq("id", recordId)
    .eq("school_id", ctx.profile.schoolId)
    .single();
  throwForPostgrest(recError, "Payment record not found");
  void record;
  const path = buildAttachmentPath(ctx.profile.schoolId, "fee-receipts", recordId, file.name);
  await uploadToBucket(db, FEE_RECEIPTS_BUCKET, path, file.bytes, file.type);
  const { data, error } = await db
    .from("fee_payment_records")
    .update({
      receipt_bucket: FEE_RECEIPTS_BUCKET,
      receipt_path: path,
      receipt_name: file.name,
      receipt_mime: file.type,
      receipt_bytes: file.size,
    })
    .eq("id", recordId)
    .eq("school_id", ctx.profile.schoolId)
    .select("id")
    .single();
  throwForPostgrest(error, "Payment record not found");
  await logAudit(db, ctx, "fee_payment.receipt_set", "fee_payment_records", recordId, {
    name: file.name,
  });
  return { id: (data as { id: string }).id };
}

/** Signed receipt URL; same scope as the fee read (parents and students included). */
export async function getPaymentReceiptUrl(
  db: DbClient,
  ctx: SessionContext,
  recordId: string,
): Promise<string> {
  authorizeRoles(ctx, ["SCHOOL_ADMIN", "PARENT", "STUDENT"]);
  const { data, error } = await db
    .from("fee_payment_records")
    .select(RECORD_COLUMNS)
    .eq("id", recordId)
    .eq("school_id", ctx.profile.schoolId)
    .single();
  throwForPostgrest(error, "Payment record not found");
  const row = toCamel<PaymentRecordDto>(data);
  if (row.receiptPath === null) {
    throw new NotFoundError("Record has no receipt");
  }
  if (!isAdmin(ctx)) {
    // Parent scope: the owning assignment's student must be linked.
    const { data: assignment, error: assignError } = await db
      .from("student_fees")
      .select("student_id")
      .eq("id", row.studentFeeId)
      .eq("school_id", ctx.profile.schoolId)
      .single();
    throwForPostgrest(assignError, "Payment record not found");
    await assertStudentFeeAccess(
      db,
      ctx,
      (assignment as { student_id: string }).student_id,
    );
  }
  return signedBucketUrl(db, FEE_RECEIPTS_BUCKET, row.receiptPath);
}

/* --------------------------------- types --------------------------------- */

export interface PaymentRecordDto {
  id: string;
  studentFeeId: string;
  amount: number;
  paidOn: string;
  mode: string;
  referenceNo: string | null;
  receiptPath: string | null;
  receiptName: string | null;
  receiptMime: string | null;
  receiptBytes: number | null;
  recordedBy: string | null;
  verifiedBy: string | null;
  isVoided: boolean;
  voidReason: string | null;
  version: number;
}

export interface StudentFeeDto {
  id: string;
  total: number;
  paid: number;
  due: number;
  status: "PAID" | "PARTIAL" | "DUE";
  overdue: boolean;
  dueDate: string | null;
  structureName: string;
  records: PaymentRecordDto[];
}

export interface FeeStructureDto {
  id: string;
  academicYearId: string;
  classId: string | null;
  name: string;
  dueDate: string | null;
  isActive: boolean;
  total: number;
  academicYears?: { name: string } | null;
  classes?: { name: string } | null;
  components?: { name: string; amount: number }[];
}

export { concessionAmount };
