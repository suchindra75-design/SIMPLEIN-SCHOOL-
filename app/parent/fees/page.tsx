import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { AttachmentLink } from "@/app/components/AttachmentLink";
import { listStudentFees } from "@/lib/services/fees";
import { getParentScope, listChildren } from "@/lib/services/parents";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { EmptyState } from "@/app/admin/_components/ui";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Parent view: child selector + fee summary + history + receipts (read-only, NO Pay Now). */
export default async function ParentFeesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const ctx = await requireRole("PARENT");
  const db = await createServerSupabaseClient();
  const scope = await getParentScope(db, ctx);
  const { children } =
    scope === null ? { children: [] } : await listChildren(db, ctx, scope.parentId);

  const requested = sp["studentId"];
  // Scope guard: only linked children are ever viewable (server-enforced).
  const selectedId =
    requested !== undefined && children.some((c) => c.id === requested)
      ? requested
      : (children[0]?.id ?? "");
  const selected = children.find((c) => c.id === selectedId);

  const { fees } =
    selectedId === "" ? { fees: [] } : await listStudentFees(db, ctx, selectedId);

  const grandTotal = fees.reduce((sum, f) => sum + f.total, 0);
  const grandPaid = fees.reduce((sum, f) => sum + f.paid, 0);

  return (
    <main>
      <h2 className="text-xl font-semibold">Fees</h2>
      <p className="mt-1 text-sm text-gray-600">
        {ctx.profile.fullName} · {ctx.school.name} · Read-only (pay at the
        school office)
      </p>

      {scope === null ? (
        <p className="mt-4 text-sm text-gray-600">
          No parent profile is linked to your login yet.
        </p>
      ) : children.length === 0 ? (
        <div className="mt-4">
          <EmptyState message="No children are linked to your account yet." />
        </div>
      ) : (
        <>
          <form method="get" className="mt-4">
            <label className="text-sm">
              <span className="mb-1 block text-gray-600">Child</span>
              <select name="studentId" defaultValue={selectedId} className="rounded border px-2 py-1.5">
                {children.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.displayName}
                    {c.classes?.name ? ` · ${c.classes.name}` : ""}
                    {c.sections?.name ? ` ${c.sections.name}` : ""}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" className="ml-3 rounded border px-3 py-1.5 text-sm">
              View
            </button>
          </form>

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
                    <h5 className="mb-1 mt-2 text-xs font-medium text-gray-600">
                      Payment history
                    </h5>
                    {f.records.length === 0 ? (
                      <p className="text-xs text-gray-500">No payments recorded.</p>
                    ) : (
                      <ul className="space-y-1 text-xs">
                        {f.records.map((r) => (
                          <li key={r.id}>
                            {r.paidOn} · {r.mode} · {r.amount}
                            {r.verifiedBy !== null
                              ? " · verified"
                              : " · pending verification"}
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
              <p className="mt-3 text-xs text-gray-500">
                Paid amounts reflect school-verified records. Receipts open via
                secure expiring links.
              </p>
            </>
          )}
        </>
      )}
      <p className="mt-4 text-sm">
        <Link href="/parent" className="underline">
          Back to dashboard
        </Link>
      </p>
    </main>
  );
}
