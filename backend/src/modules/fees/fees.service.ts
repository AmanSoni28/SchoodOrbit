export const r2 = (n: number) => Math.round(n * 100) / 100;

export type FeeStatus = 'PAID' | 'PARTIAL' | 'PENDING' | 'OVERDUE' | 'WAIVED';

/** Derives money state from the charge and its payments. `today` is injectable for tests. */
export function feeState(f: { amount: unknown; discount: unknown; dueDate: Date; payments: { amount: unknown }[] }, today = new Date()) {
  const net = r2(Number(f.amount) - Number(f.discount));
  const paid = r2(f.payments.reduce((s, p) => s + Number(p.amount), 0));
  const balance = r2(Math.max(0, net - paid));
  const startOfToday = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const status: FeeStatus = net <= 0 ? 'WAIVED' : balance === 0 ? 'PAID' : f.dueDate < startOfToday ? 'OVERDUE' : paid > 0 ? 'PARTIAL' : 'PENDING';
  return { net, paid, balance, status };
}
