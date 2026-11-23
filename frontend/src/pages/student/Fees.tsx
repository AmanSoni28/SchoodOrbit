import { useState } from 'react';
import { AlertTriangle, CalendarClock, CheckCircle2, HandCoins, IndianRupee, ReceiptText, Wallet } from 'lucide-react';
import { useGet } from '../../lib/hooks';
import { useBranding } from '../../lib/branding';
import { fmtDate, fmtDateTime, fromNow, money, titleCase } from '../../lib/format';
import { Button, Card, EmptyState, Hero, HeroChip, QueryView, Stat, StatusBadge, Table, Td } from '../../components/ui';
import { Ring } from '../../components/charts';
import { ReceiptModal } from '../../components/Receipt';

export default function StudentFees() {
  const q = useGet<any>('/fees/me');
  const b = useBranding();
  const [receipt, setReceipt] = useState<string | null>(null);
  return (
    <QueryView q={q}>
      {(d) => {
        const t = d.totals;
        const paidPct = t.billed ? Math.round((t.paid / t.billed) * 100) : null;
        const payments = d.fees.flatMap((f: any) => f.payments.map((p: any) => ({ ...p, fee: f.structure.name }))).sort((a: any, z: any) => +new Date(z.paidAt) - +new Date(a.paidAt));
        return (
          <>
            <Hero eyebrow="Finance" title="My fees" subtitle={`Your charges and payments at ${b.name}. Contact the accounts office to pay or if something looks wrong.`}
              aside={<div className="flex items-center gap-4 rounded-2xl bg-white/10 p-4 ring-1 ring-white/15 backdrop-blur"><Ring value={paidPct} size={92} label="Fees paid"><span className="text-lg font-bold text-white">{paidPct === null ? '—' : `${paidPct}%`}</span></Ring><div className="text-sm"><div className="font-semibold">Paid so far</div><div className="text-white/65">{money(t.paid)} of {money(t.billed)}</div></div></div>}>
              {d.nextDue ? <HeroChip icon={<CalendarClock />}>Next due {fmtDate(d.nextDue.dueDate)} · {money(d.nextDue.balance)}</HeroChip> : <HeroChip icon={<CheckCircle2 />}>Nothing due</HeroChip>}
              {t.overdue > 0 && <HeroChip icon={<AlertTriangle />}>{money(t.overdue)} overdue</HeroChip>}
            </Hero>

            {d.fees.length === 0 ? <EmptyState icon={<Wallet className="size-6" />} title="No fees yet" body="Charges from your college will appear here." /> : (
              <>
                <div className="mb-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  <Stat label="Total fees" value={money(t.billed)} hint={`${d.fees.length} charge${d.fees.length === 1 ? '' : 's'}`} icon={<IndianRupee />} tone="navy" />
                  <Stat label="Paid" value={money(t.paid)} hint={`${payments.length} payment${payments.length === 1 ? '' : 's'}`} icon={<HandCoins />} tone="accent" />
                  <Stat label="Balance" value={money(t.balance)} icon={<Wallet />} tone="gold" />
                  <Stat label="Overdue" value={money(t.overdue)} hint={t.overdue > 0 ? 'Please contact the accounts office' : 'You are up to date'} icon={<AlertTriangle />} />
                </div>

                <h2 className="mb-3 text-[15px] font-semibold text-navy">Charges</h2>
                <ul className="mb-7 grid gap-5 md:grid-cols-2">
                  {d.fees.map((f: any) => {
                    const p = f.net ? Math.min(100, Math.round((f.paid / f.net) * 100)) : 100;
                    const color = f.status === 'OVERDUE' ? 'var(--color-danger)' : f.status === 'PAID' || f.status === 'WAIVED' ? 'var(--color-accent)' : 'var(--color-primary)';
                    return (
                      <li key={f.id} className="rounded-2xl border border-line/80 bg-white p-5 shadow-[0_1px_3px_rgba(16,27,58,0.05)]">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0"><div className="font-semibold text-navy">{f.structure.name}</div>{f.structure.description && <p className="mt-0.5 line-clamp-2 text-xs text-muted">{f.structure.description}</p>}</div>
                          <StatusBadge status={f.status} />
                        </div>
                        <div className="mt-4 flex items-end justify-between gap-3">
                          <div><div className="text-xs text-muted">Balance</div><div className="text-2xl font-bold tabular-nums" style={{ color: f.balance > 0 ? undefined : 'var(--color-success)' }}>{money(f.balance)}</div></div>
                          <div className="text-right text-xs text-muted"><div className="inline-flex items-center gap-1"><CalendarClock className="size-3.5" aria-hidden />Due {fmtDate(f.dueDate)}</div>{f.balance > 0 && <div>{fromNow(f.dueDate)}</div>}</div>
                        </div>
                        <div className="mt-3 h-2 overflow-hidden rounded-full bg-cloud" role="progressbar" aria-valuenow={p} aria-valuemin={0} aria-valuemax={100} aria-label={`${f.structure.name} paid`}><div className="h-full rounded-full transition-all" style={{ width: `${p}%`, background: color }} /></div>
                        <div className="mt-2 flex justify-between text-xs text-muted"><span>Paid {money(f.paid)} of {money(f.net)}</span>{f.discount > 0 && <span className="text-success">Includes {money(f.discount)} discount</span>}</div>
                      </li>
                    );
                  })}
                </ul>

                <Card title="Payment history" subtitle="Open any payment to view or print its receipt">
                  {payments.length === 0 ? <p className="py-4 text-sm text-muted">No payments recorded yet.</p> : (
                    <Table head={['Date', 'Fee', 'Method', 'Receipt', 'Amount', '']}>
                      {payments.map((p: any) => (
                        <tr key={p.id}>
                          <Td className="whitespace-nowrap text-xs">{fmtDateTime(p.paidAt)}</Td>
                          <Td>{p.fee}</Td>
                          <Td className="text-sm">{titleCase(p.method)}{p.reference && <div className="text-xs text-muted">{p.reference}</div>}</Td>
                          <Td className="font-mono text-xs">{p.receiptNo}</Td>
                          <Td className="font-semibold text-success tabular-nums">{money(p.amount)}</Td>
                          <Td><Button size="sm" variant="secondary" onClick={() => setReceipt(p.id)}><ReceiptText className="size-4" aria-hidden />Receipt</Button></Td>
                        </tr>
                      ))}
                    </Table>
                  )}
                </Card>
              </>
            )}
            <ReceiptModal paymentId={receipt} onClose={() => setReceipt(null)} />
          </>
        );
      }}
    </QueryView>
  );
}
