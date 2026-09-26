/**
 * Fee balance calculation (pure, unit-tested, ONE home — see
 * docs/ARCHITECTURE.md §25). One consistent rule:
 * - paid  = Σ(amount WHERE NOT is_voided AND verified)
 * - due   = total − paid (never negative — overpayment is rejected upstream)
 * - status: PAID (paid >= total) / PARTIAL (paid > 0) / DUE; overdue when the
 *   due date has passed and due > 0.
 * - concession: the assignment's total_amount snapshot may sit BELOW the
 *   structure total (per-student discount); full waiver = 0.
 */

export interface BalanceRecord {
  amount: number;
  isVoided: boolean;
  verified: boolean;
}

export interface FeeBalance {
  total: number;
  paid: number;
  due: number;
  status: "PAID" | "PARTIAL" | "DUE";
  overdue: boolean;
}

export function feeBalance(
  totalAmount: number,
  records: readonly BalanceRecord[],
  opts: { today?: string; dueDate?: string | null } = {},
): FeeBalance {
  const paid =
    Math.round(
      records
        .filter((r) => !r.isVoided && r.verified)
        .reduce((sum, r) => sum + r.amount, 0) * 100,
    ) / 100;
  const due = Math.max(0, Math.round((totalAmount - paid) * 100) / 100);
  const status: FeeBalance["status"] =
    due === 0 ? "PAID" : paid > 0 ? "PARTIAL" : "DUE";
  const overdue =
    opts.dueDate !== null &&
    opts.dueDate !== undefined &&
    opts.today !== undefined &&
    opts.dueDate < opts.today &&
    due > 0;
  return { total: totalAmount, paid, due, status, overdue };
}

/** Structure total = Σ components (pure). */
export function structureTotal(
  components: readonly { amount: number }[],
): number {
  return Math.round(components.reduce((sum, c) => sum + c.amount, 0) * 100) / 100;
}

/** Concession label: how much the assignment snapshot is below the structure total. */
export function concessionAmount(
  structureTotalAmount: number,
  assignedTotal: number,
): number {
  return (
    Math.round(Math.max(0, structureTotalAmount - assignedTotal) * 100) / 100
  );
}
