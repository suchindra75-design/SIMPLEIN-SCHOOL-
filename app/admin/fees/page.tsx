import { requireRole } from "@/lib/auth/session";
import {
  assignFeesAction,
  createFeeStructureAction,
  recordPaymentAction,
  uploadReceiptAction,
  verifyPaymentAction,
  voidPaymentAction,
} from "@/app/notification-actions";
import { ConfirmButton, SmartForm } from "@/app/admin/_components/forms";
import { AttachmentLink } from "@/app/components/AttachmentLink";
import { listAcademicYears } from "@/lib/services/years";
import { listClasses } from "@/lib/services/classes";
import { listStudents } from "@/lib/services/students";
import {
  listFeeStructures,
  listStudentFees,
} from "@/lib/services/fees";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { EmptyState, PageHeader, StatusBadge } from "@/app/admin/_components/ui";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function AdminFeesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const ctx = await requireRole("SCHOOL_ADMIN");
  const db = await createServerSupabaseClient();
  const { structures } = await listFeeStructures(db, ctx);
  const [{ academicYears }, { classes }] = await Promise.all([
    listAcademicYears(db, ctx),
    listClasses(db, ctx),
  ]);
  const { students } = await listStudents(db, ctx, {
    status: "active",
    page: 1,
    limit: 100,
  });

  // Student fee panel: ?studentId=
  const studentId = sp["studentId"] !== undefined && UUID_RE.test(sp["studentId"]) ? sp["studentId"] : "";
  const { fees } =
    studentId === ""
      ? { fees: [] }
      : await listStudentFees(db, ctx, studentId);

  return (
    <main>
      <PageHeader title="Fees" />

      <p className="mb-4 text-xs text-gray-500">
        V1 records school-received payments only — no online payments, no
        refunds. Verification is maker-checker (a second admin confirms).
      </p>

      <h3 className="mb-2 font-semibold">Fee structures</h3>
      {structures.length === 0 ? (
        <EmptyState message="No fee structures yet." />
      ) : (
        <ul className="space-y-2 text-sm">
          {structures.map((s) => (
            <li key={s.id} className="rounded border p-3">
              <div className="flex flex-wrap items-center gap-3">
                <span className="font-medium">{s.name}</span>
                <StatusBadge active={s.isActive} />
                <span className="text-gray-600">
                  {s.academicYears?.name ?? ""} · Total {s.total}
                  {s.dueDate !== null ? ` · due ${s.dueDate}` : ""}
                </span>
                {s.components !== undefined && s.components.length > 0 && (
                  <span className="text-xs text-gray-500">
                    ({s.components.map((c) => `${c.name} ${c.amount}`).join(", ")})
                  </span>
                )}
              </div>
              <div className="mt-2">
                <SmartForm
                  action={assignFeesAction.bind(null, s.id)}
                  submitLabel="Assign to students"
                  fields={[
                    {
                      name: "studentIds",
                      label: "Students (multi-select)",
                      type: "select",
                      required: true,
                      options: students.map((st) => ({
                        value: st.id,
                        label: `${st.displayName} (${st.admissionNo})`,
                      })),
                    },
                    {
                      name: "totalAmount",
                      label: `Concession total (blank = structure total ${s.total})`,
                      type: "number",
                    },
                    { name: "dueDate", label: "Due date", type: "date", defaultValue: s.dueDate ?? "" },
                  ]}
                />
              </div>
            </li>
          ))}
        </ul>
      )}

      <h4 className="mb-2 mt-4 font-medium">New fee structure</h4>
      <SmartForm
        action={createFeeStructureAction}
        submitLabel="Create structure"
        fields={[
          { name: "name", label: "Structure name", required: true, placeholder: "2026-27 · Grade 5" },
          {
            name: "academicYearId",
            label: "Academic year",
            type: "select",
            required: true,
            options: academicYears.map((y) => ({ value: y.id, label: y.name })),
          },
          {
            name: "classId",
            label: "Class (optional)",
            type: "select",
            options: classes.map((c) => ({ value: c.id, label: c.name })),
          },
          { name: "dueDate", label: "Default due date", type: "date" },
          { name: "component_name_0", label: "Component 1 name", placeholder: "Tuition Fee", required: true },
          { name: "component_amount_0", label: "Component 1 amount", type: "number", required: true, placeholder: "30000" },
          { name: "component_name_1", label: "Component 2 name", placeholder: "Transport Fee" },
          { name: "component_amount_1", label: "Component 2 amount", type: "number" },
          { name: "component_name_2", label: "Component 3 name", placeholder: "Activity Fee" },
          { name: "component_amount_2", label: "Component 3 amount", type: "number" },
        ]}
      />

      <h3 className="mb-2 mt-8 font-semibold">Student fees</h3>
      <form method="get" className="mb-4">
        <label className="text-sm">
          <span className="mb-1 block text-gray-600">Student</span>
          <select name="studentId" defaultValue={studentId} className="rounded border px-2 py-1.5">
            <option value="">Select…</option>
            {students.map((s) => (
              <option key={s.id} value={s.id}>
                {s.displayName} ({s.admissionNo})
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="ml-3 rounded border px-3 py-1.5 text-sm">
          View
        </button>
      </form>

      {studentId === "" ? (
        <EmptyState message="Select a student to view fees, record payments, and upload receipts." />
      ) : fees.length === 0 ? (
        <EmptyState message="No fees assigned to this student yet." />
      ) : (
        <ul className="space-y-3 text-sm">
          {fees.map((f) => (
            <li key={f.id} className="rounded border p-3">
              <div className="flex flex-wrap items-center gap-3">
                <span className="font-medium">{f.structureName}</span>
                <span
                  className={`rounded px-2 py-0.5 text-xs ${
                    f.status === "PAID"
                      ? "bg-green-100 text-green-800"
                      : f.status === "PARTIAL"
                        ? "bg-amber-100 text-amber-800"
                        : "bg-red-100 text-red-800"
                  }`}
                >
                  {f.status}
                  {f.overdue ? " · OVERDUE" : ""}
                </span>
                <span className="text-gray-600">
                  Total {f.total} · Paid {f.paid} · Due {f.due}
                  {f.dueDate !== null ? ` · due ${f.dueDate}` : ""}
                </span>
              </div>
              <h5 className="mb-1 mt-2 text-xs font-medium text-gray-600">Payment history</h5>
              {f.records.length === 0 ? (
                <p className="text-xs text-gray-500">No payments recorded.</p>
              ) : (
                <ul className="space-y-1 text-xs">
                  {f.records.map((r) => (
                    <li key={r.id} className={r.isVoided ? "text-gray-400 line-through" : ""}>
                      {r.paidOn} · {r.mode} · {r.amount}
                      {r.referenceNo !== null ? ` · ref ${r.referenceNo}` : ""}
                      {r.isVoided ? " · VOIDED" : r.verifiedBy !== null ? " · verified" : " · unverified"}
                      {r.receiptName !== null && (
                        <span className="ml-2">
                          <AttachmentLink
                            homeworkId={r.id}
                            attachmentId={r.id}
                            label={r.receiptName}
                            kind="receipt"
                          />
                        </span>
                      )}
                      {!r.isVoided && (
                        <span className="ml-2 flex gap-2">
                          {r.verifiedBy === null && (
                            <ConfirmButton
                              label="Verify"
                              confirmMessage={`Verify ${r.amount} received on ${r.paidOn}? (maker-checker: another admin must have recorded it)`}
                              run={verifyPaymentAction.bind(null, r.id)}
                            />
                          )}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {!f.overdue || true ? (
                <div className="mt-2 grid gap-3 md:grid-cols-2">
                  <SmartForm
                    action={recordPaymentAction.bind(null, f.id)}
                    submitLabel="Record payment received"
                    fields={[
                      { name: "amount", label: `Amount (outstanding ${f.due})`, type: "number", required: true },
                      { name: "paidOn", label: "Paid on", type: "date", required: true },
                      {
                        name: "mode",
                        label: "Mode",
                        type: "select",
                        required: true,
                        options: ["CASH", "CHEQUE", "BANK_TRANSFER", "OTHER"].map((m) => ({
                          value: m,
                          label: m,
                        })),
                      },
                      { name: "referenceNo", label: "Reference no (optional)" },
                    ]}
                  />
                  <div>
                    <h5 className="mb-1 text-xs font-medium text-gray-600">Void a record (another admin confirms)</h5>
                    {f.records.filter((r) => !r.isVoided).length === 0 ? (
                      <p className="text-xs text-gray-500">No records to void.</p>
                    ) : (
                      f.records.filter((r) => !r.isVoided).map((r) => (
                        <div key={r.id} className="mb-2">
                          <SmartForm
                            action={voidPaymentAction.bind(null, r.id)}
                            submitLabel={`Void ${r.amount} (${r.paidOn})`}
                            fields={[{ name: "reason", label: "Reason", required: true }]}
                          />
                        </div>
                      ))
                    )}
                  </div>
                </div>
              ) : null}
              <div className="mt-2">
                <SmartForm
                  action={uploadReceiptAction.bind(null, f.records[0]?.id ?? "")}
                  submitLabel="Upload receipt for latest record"
                  fields={[{ name: "file", label: "Receipt file (PDF/images, ≤10 MB)", type: "file", required: true }]}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
