import { requireRole } from "@/lib/auth/session";
import { AttachmentLink } from "@/app/components/AttachmentLink";
import { listStudentFees } from "@/lib/services/fees";
import { getStudentScope } from "@/lib/services/students";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { EmptyState } from "@/app/admin/_components/ui";

export const dynamic = "force-dynamic";

/** Student fees: own only (read-only, NO Pay Now). */
export default async function StudentFeesPage() {
  const ctx = await requireRole("STUDENT");
  const db = await createServerSupabaseClient();
  const scope = await getStudentScope(db, ctx);
  if (scope === null) {
    return (
      <main>
        <h2 className="text-xl font-semibold">My fees</h2>
        <div className="mt-4">
          <EmptyState message="No student profile is linked to your login yet." />
        </div>
      </main>
    );
  }
  const { fees } = await listStudentFees(db, ctx, scope.studentId);
  const grandTotal = fees.reduce((sum, f) => sum + f.total, 0);
  const grandPaid = fees.reduce((sum, f) => sum + f.paid, 0);

  return (
    <main>
      <h2 className="text-xl font-semibold">My fees</h2>
      <p className="mt-1 text-sm text-gray-600">
        {ctx.school.name} · Read-only (pay at the school office)
      </p>
      {fees.length === 0 ? (
        <div className="mt-4">
          <EmptyState message="No fees assigned yet." />
        </div>
      ) : (
        <>
          <div className="mt-4 flex flex-wrap gap-4 text-sm">
            <div className="rounded border p-3">
              <p className="text-xs text-gray-600">Total fee</p>
              <p className="text-xl font-bold">{grandTotal}</p>
            </div>
            <div className="rounded border p-3">
              <p className="text-xs text-gray-600">Paid</p>
              <p className="text-xl font-bold">{grandPaid}</p>
            </div>
            <div className="rounded border p-3">
              <p className="text-xs text-gray-600">Amount due</p>
              <p className="text-xl font-bold">{grandTotal - grandPaid}</p>
            </div>
          </div>
          <ul className="mt-4 space-y-3 text-sm">
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
                {f.records.length > 0 && (
                  <ul className="mt-2 space-y-1 text-xs">
                    {f.records.map((r) => (
                      <li key={r.id}>
                        {r.paidOn} · {r.mode} · {r.amount}
                        {r.verifiedBy !== null ? " · verified" : " · pending"}
                        {r.receiptName !== null && (
                          <span className="ml-2">
                            <AttachmentLink
                              homeworkId={r.id}
                              attachmentId={r.id}
                              label={`Receipt: ${r.receiptName}`}
                              kind="receipt"
                            />
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </main>
  );
}
