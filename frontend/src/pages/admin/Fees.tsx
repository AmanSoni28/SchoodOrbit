import { useState } from 'react';
import { AlertTriangle, CalendarClock, CircleDollarSign, HandCoins, IndianRupee, Plus, ReceiptText, Search, Users, Wallet } from 'lucide-react';
import { send } from '../../lib/api';
import { useAct, useGet } from '../../lib/hooks';
import { fmtDate, fmtDateTime, money, moneyShort, pct, titleCase } from '../../lib/format';
import { Badge, Button, Card, EmptyState, Input, Modal, PageHeader, QueryView, Select, Stat, StatusBadge, Table, Tabs, Td, Textarea, fieldErrors, useToast } from '../../components/ui';
import { AreaChart, BarList, Donut, PALETTE, Ring, Sparkline, StackedBar } from '../../components/charts';
import { ReceiptModal } from '../../components/Receipt';

type Tab = 'overview' | 'ledger' | 'structures';
const STATUSES = ['PAID', 'PARTIAL', 'PENDING', 'OVERDUE', 'WAIVED'] as const;
const STATUS_COLOR: Record<string, string> = { PAID: 'var(--color-accent)', PARTIAL: 'var(--color-primary)', PENDING: 'var(--color-gold)', OVERDUE: 'var(--color-danger)', WAIVED: '#94a3b8' };
const METHODS = ['CASH', 'UPI', 'BANK_TRANSFER', 'CARD', 'CHEQUE', 'ONLINE'] as const;
const monthLabel = (m: string) => new Date(`${m}-15T12:00:00`).toLocaleDateString(undefined, { month: 'short' });
const initials = (s: { firstName: string; lastName: string }) => `${s.firstName[0]}${s.lastName[0]}`;
const Avatar = ({ s }: { s: { firstName: string; lastName: string } }) => <span className="grid size-8 shrink-0 place-items-center rounded-full bg-gradient-to-br from-primary to-accent text-[11px] font-semibold text-white" aria-hidden>{initials(s)}</span>;

export default function Fees() {
  const [tab, setTab] = useState<Tab>('overview');
  const [newOpen, setNewOpen] = useState(false);
  const [receipt, setReceipt] = useState<string | null>(null);
  return (
    <>
      <PageHeader eyebrow="Finance" title="Fees & payments" subtitle="Bill students, record payments and track collections. Payments are recorded by staff; no card details are stored."
        actions={<Button onClick={() => setNewOpen(true)}><Plus className="size-4" aria-hidden />New fee structure</Button>} />
      <Tabs value={tab} onChange={setTab} tabs={[{ id: 'overview', label: 'Overview' }, { id: 'ledger', label: 'Student ledger' }, { id: 'structures', label: 'Fee structures' }]} />
      {tab === 'overview' && <Overview onReceipt={setReceipt} />}
      {tab === 'ledger' && <Ledger onReceipt={setReceipt} />}
      {tab === 'structures' && <Structures onNew={() => setNewOpen(true)} />}
      {newOpen && <NewStructure onClose={() => setNewOpen(false)} />}
      <ReceiptModal paymentId={receipt} onClose={() => setReceipt(null)} />
    </>
  );
}

// ── Overview ──
function Overview({ onReceipt }: { onReceipt: (id: string) => void }) {
  const q = useGet<any>('/fees/overview');
  return (
    <QueryView q={q}>
      {(d) => {
        const t = d.totals;
        const rate = t.billed ? Math.round((t.collected / t.billed) * 100) : null;
        if (t.charges === 0) return <EmptyState icon={<Wallet className="size-6" />} title="No fees billed yet" body="Create a fee structure (for example “Semester 1 tuition”), then assign it to students to start tracking collections." />;
        return (
          <>
            <div className="mb-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <Stat label="Total billed" value={moneyShort(t.billed)} hint={`${t.charges} charges · ${t.students} students · ${money(t.discounts)} discounts`} icon={<IndianRupee />} tone="navy" />
              <Stat label="Collected" value={moneyShort(t.collected)} hint={`${pct(rate)} of billed`} icon={<HandCoins />} tone="accent" footer={<Sparkline values={d.months.map((m: any) => m.total)} color="var(--color-accent)" />} />
              <Stat label="Outstanding" value={moneyShort(t.outstanding)} hint="still to be collected" icon={<CircleDollarSign />} tone="gold" />
              <Stat label="Overdue" value={moneyShort(t.overdue)} hint={`${d.statusCounts.find((s: any) => s.status === 'OVERDUE')?.n ?? 0} charges past due date`} icon={<AlertTriangle />} />
            </div>

            <div className="mb-6 grid gap-6 lg:grid-cols-3">
              <Card title="Collections" subtitle="Amount received per month, last 12 months" className="lg:col-span-2">
                <AreaChart label="Monthly collections" color="var(--color-accent)" format={moneyShort} data={d.months.map((m: any) => ({ label: monthLabel(m.month), value: m.total }))} />
              </Card>
              <Card title="Collection rate">
                <div className="flex flex-col items-center">
                  <Ring value={rate} size={150} label="Collection rate" color="var(--color-accent)">
                    <span className="text-center"><span className="block text-3xl font-bold text-navy">{pct(rate)}</span><span className="text-xs text-muted">collected</span></span>
                  </Ring>
                  <div className="mt-5 w-full"><StackedBar segments={[{ label: 'Collected', value: t.collected, color: 'var(--color-accent)' }, { label: 'Outstanding', value: t.outstanding - t.overdue, color: 'var(--color-gold)' }, { label: 'Overdue', value: t.overdue, color: 'var(--color-danger)' }]} /></div>
                </div>
              </Card>
            </div>

            <div className="mb-6 grid gap-6 lg:grid-cols-3">
              <Card title="Charges by status"><Donut sub="charges" size={140} segments={d.statusCounts.filter((s: any) => s.n > 0).map((s: any) => ({ label: titleCase(s.status), value: s.n, color: STATUS_COLOR[s.status] }))} /></Card>
              <Card title="Payment methods">
                {d.methods.length === 0 ? <p className="py-6 text-center text-sm text-muted">No payments yet</p> :
                  <Donut sub="payments" size={140} segments={d.methods.map((m: any) => ({ label: titleCase(m.method), value: m.n }))} />}
              </Card>
              <Card title="Collected by fee" subtitle="% of each fee's billed amount">
                <BarList max={100} format={(v) => `${v}%`} items={d.structures.map((s: any, i: number) => ({ label: s.name, value: s.billed ? Math.round((s.collected / s.billed) * 100) : null, hint: `(${moneyShort(s.collected)})`, color: PALETTE[i % PALETTE.length] }))} />
              </Card>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <Card title="Overdue students" subtitle="Largest overdue balances first">
                {d.defaulters.length === 0 ? <EmptyState title="No overdue fees" body="Every charge past its due date has been paid." /> : (
                  <ul className="divide-y divide-line/70">
                    {d.defaulters.map((x: any) => (
                      <li key={x.student.id} className="flex items-center gap-3 py-3">
                        <Avatar s={x.student} />
                        <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{x.student.firstName} {x.student.lastName}</span><span className="block truncate text-xs text-muted">{x.student.email}</span></span>
                        <span className="text-right"><span className="block text-sm font-bold text-danger">{money(x.overdue)}</span><span className="text-[11px] text-muted">overdue of {money(x.balance)}</span></span>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
              <Card title="Recent payments">
                {d.recent.length === 0 ? <p className="py-6 text-center text-sm text-muted">No payments recorded yet.</p> : (
                  <ul className="divide-y divide-line/70">
                    {d.recent.map((p: any) => (
                      <li key={p.id}>
                        <button onClick={() => onReceipt(p.id)} className="flex w-full items-center gap-3 py-3 text-left transition hover:bg-cloud/60">
                          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-accent/10 text-success" aria-hidden><ReceiptText className="size-4" /></span>
                          <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{p.student.firstName} {p.student.lastName} · {p.fee}</span><span className="block text-xs text-muted">{titleCase(p.method)} · {p.receiptNo} · {fmtDateTime(p.paidAt)}</span></span>
                          <span className="text-sm font-bold text-success">+{money(p.amount)}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </div>
          </>
        );
      }}
    </QueryView>
  );
}

// ── Ledger ──
function Ledger({ onReceipt }: { onReceipt: (id: string) => void }) {
  const [f, setF] = useState({ search: '', status: '', structureId: '' });
  const [page, setPage] = useState(1);
  const [pay, setPay] = useState<any>(null);
  const [history, setHistory] = useState<any>(null);
  const structures = useGet<any[]>('/fees/structures');
  const qs = new URLSearchParams({ page: String(page), pageSize: '15', ...Object.fromEntries(Object.entries(f).filter(([, v]) => v)) });
  const ledger = useGet<any>(`/fees/ledger?${qs}`);
  const set = (k: keyof typeof f, v: string) => { setF({ ...f, [k]: v }); setPage(1); };
  return (
    <>
      <div className="mb-4 grid gap-3 sm:grid-cols-[1fr_180px_220px]">
        <div className="relative"><Search className="pointer-events-none absolute bottom-2.5 left-3 size-4 text-muted" aria-hidden /><Input label="Search student" className="pl-9" value={f.search} onChange={(e) => set('search', e.target.value)} /></div>
        <Select label="Status" value={f.status} onChange={(e) => set('status', e.target.value)}><option value="">Any status</option>{STATUSES.map((s) => <option key={s} value={s}>{titleCase(s)}</option>)}</Select>
        <Select label="Fee" value={f.structureId} onChange={(e) => set('structureId', e.target.value)}><option value="">All fees</option>{structures.data?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select>
      </div>
      <QueryView q={ledger} empty={<EmptyState title="No charges match" body="Assign a fee structure to students from the Fee structures tab." />} isEmpty={(d: any) => d.data.length === 0}>
        {(d: any) => (
          <>
            <Table head={['Student', 'Fee', 'Due', 'Amount', 'Paid', 'Balance', 'Status', '']}>
              {d.data.map((x: any) => (
                <tr key={x.id}>
                  <Td><div className="flex items-center gap-2.5"><Avatar s={x.student} /><span className="min-w-0"><span className="block truncate font-medium">{x.student.firstName} {x.student.lastName}</span><span className="block truncate text-xs text-muted">{x.student.email}</span></span></div></Td>
                  <Td className="text-sm">{x.structure.name}</Td>
                  <Td className="whitespace-nowrap text-xs">{fmtDate(x.dueDate)}</Td>
                  <Td className="whitespace-nowrap"><div className="font-medium tabular-nums">{money(x.net)}</div>{x.discount > 0 && <div className="text-[11px] text-success">−{money(x.discount)} discount</div>}</Td>
                  <Td><div className="flex items-center gap-2"><div className="h-2 w-16 overflow-hidden rounded-full bg-cloud"><div className="h-full rounded-full bg-accent" style={{ width: `${x.net ? Math.min(100, (x.paid / x.net) * 100) : 100}%` }} /></div><span className="text-xs tabular-nums">{money(x.paid)}</span></div></Td>
                  <Td className={`whitespace-nowrap font-semibold tabular-nums ${x.status === 'OVERDUE' ? 'text-danger' : 'text-navy'}`}>{money(x.balance)}</Td>
                  <Td><StatusBadge status={x.status} /></Td>
                  <Td><div className="flex justify-end gap-1.5">
                    {x.payments.length > 0 && <Button size="sm" variant="ghost" onClick={() => setHistory(x)}>History</Button>}
                    {x.balance > 0 && <Button size="sm" onClick={() => setPay(x)}>Record payment</Button>}
                  </div></Td>
                </tr>
              ))}
            </Table>
            <div className="mt-4 flex items-center justify-between">
              <Button size="sm" variant="secondary" disabled={page === 1} onClick={() => setPage(page - 1)}>Previous</Button>
              <span className="text-sm text-muted">{d.meta.total} charges · page {page} of {Math.max(1, Math.ceil(d.meta.total / 15))}</span>
              <Button size="sm" variant="secondary" disabled={page * 15 >= d.meta.total} onClick={() => setPage(page + 1)}>Next</Button>
            </div>
          </>
        )}
      </QueryView>
      {pay && <RecordPayment fee={pay} onClose={() => setPay(null)} onReceipt={onReceipt} />}
      <Modal open={!!history} onClose={() => setHistory(null)} title={history ? `Payments · ${history.student.firstName} ${history.student.lastName}` : ''}>
        {history && (
          <ul className="divide-y divide-line/70">
            {history.payments.map((p: any) => (
              <li key={p.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                <span><span className="block font-medium">{money(p.amount)} · {titleCase(p.method)}</span><span className="text-xs text-muted">{p.receiptNo} · {fmtDateTime(p.paidAt)}{p.reference ? ` · ${p.reference}` : ''}</span></span>
                <Button size="sm" variant="secondary" onClick={() => { setHistory(null); onReceipt(p.id); }}>Receipt</Button>
              </li>
            ))}
          </ul>
        )}
      </Modal>
    </>
  );
}

function RecordPayment({ fee, onClose, onReceipt }: { fee: any; onClose: () => void; onReceipt: (id: string) => void }) {
  const [v, setV] = useState({ amount: String(fee.balance), method: 'UPI', reference: '', paidAt: new Date().toISOString().slice(0, 10), note: '' });
  const act = useAct((b: typeof v) => send('POST', `/fees/student-fees/${fee.id}/payments`, { ...b, amount: Number(b.amount), paidAt: b.paidAt || undefined }),
    { success: 'Payment recorded', invalidate: ['/fees'], onDone: (p: any) => { onClose(); onReceipt(p.id); } });
  const err = fieldErrors(act.error);
  const amt = Number(v.amount);
  return (
    <Modal open onClose={onClose} title="Record payment">
      <div className="mb-5 flex items-center gap-3 rounded-2xl bg-cloud p-4">
        <Avatar s={fee.student} />
        <div className="min-w-0 flex-1 text-sm"><div className="font-semibold">{fee.student.firstName} {fee.student.lastName}</div><div className="text-xs text-muted">{fee.structure.name} · due {fmtDate(fee.dueDate)}</div></div>
        <div className="text-right"><div className="text-[11px] text-muted">Balance</div><div className="text-lg font-bold text-navy">{money(fee.balance)}</div></div>
      </div>
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); act.mutate(v); }}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Amount (₹)" type="number" min="0.01" step="0.01" max={fee.balance} required value={v.amount} onChange={(e) => setV({ ...v, amount: e.target.value })} error={err.amount} hint={amt > 0 && amt < fee.balance ? `${money(fee.balance - amt)} will remain` : undefined} />
          <Select label="Method" value={v.method} onChange={(e) => setV({ ...v, method: e.target.value })}>{METHODS.map((m) => <option key={m} value={m}>{titleCase(m)}</option>)}</Select>
          <Input label="Reference (UTR, cheque no.)" value={v.reference} onChange={(e) => setV({ ...v, reference: e.target.value })} />
          <Input label="Payment date" type="date" max={new Date().toISOString().slice(0, 10)} value={v.paidAt} onChange={(e) => setV({ ...v, paidAt: e.target.value })} error={err.paidAt} />
        </div>
        <Textarea label="Note (optional)" value={v.note} onChange={(e) => setV({ ...v, note: e.target.value })} />
        <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={onClose}>Cancel</Button><Button loading={act.isPending}>Record {amt > 0 ? money(amt) : 'payment'}</Button></div>
      </form>
    </Modal>
  );
}

// ── Structures ──
function Structures({ onNew }: { onNew: () => void }) {
  const q = useGet<any[]>('/fees/structures');
  const [assign, setAssign] = useState<any>(null);
  return (
    <>
      <QueryView q={q} empty={<EmptyState icon={<Wallet className="size-6" />} title="No fee structures" body="A fee structure defines an amount and due date, e.g. “Semester 1 tuition — ₹45,000”." action={<Button onClick={onNew}><Plus className="size-4" aria-hidden />New fee structure</Button>} />}>
        {(rows) => (
          <ul className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {rows.map((s, i) => {
              const rate = s.billed ? Math.round((s.collected / s.billed) * 100) : null;
              const c = PALETTE[i % PALETTE.length];
              return (
                <li key={s.id} className="flex flex-col overflow-hidden rounded-2xl border border-line/80 bg-white shadow-[0_1px_3px_rgba(16,27,58,0.05)]">
                  <div className="relative overflow-hidden p-5 text-white" style={{ background: `linear-gradient(135deg, ${c}, color-mix(in srgb, ${c} 50%, #101b3a))` }}>
                    <div className="absolute -right-6 -top-8 size-28 rounded-full bg-white/15" aria-hidden />
                    <div className="relative text-xs font-medium text-white/80">{s.semester ? `${s.semester.academicYear.label} · ${s.semester.name}` : 'General'}</div>
                    <div className="relative mt-1 text-lg font-semibold">{s.name}</div>
                    <div className="relative mt-2 text-2xl font-bold">{money(s.amount)}</div>
                  </div>
                  <div className="flex flex-1 flex-col p-5">
                    {s.description && <p className="mb-3 line-clamp-2 text-sm text-muted">{s.description}</p>}
                    <div className="mb-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
                      <span className="inline-flex items-center gap-1"><CalendarClock className="size-3.5" aria-hidden />Due {fmtDate(s.dueDate)}</span>
                      <span className="inline-flex items-center gap-1"><Users className="size-3.5" aria-hidden />{s.assigned} students</span>
                    </div>
                    <div className="mt-auto">
                      <div className="mb-1.5 flex justify-between text-xs"><span className="text-muted">Collected {money(s.collected)} of {money(s.billed)}</span><span className="font-semibold text-navy">{pct(rate)}</span></div>
                      <div className="h-2 overflow-hidden rounded-full bg-cloud"><div className="h-full rounded-full" style={{ width: `${rate ?? 0}%`, background: c }} /></div>
                      <div className="mt-4 flex items-center justify-between">
                        <Badge tone={s.assigned && s.paidCount === s.assigned ? 'success' : 'neutral'}>{s.paidCount}/{s.assigned} settled</Badge>
                        <Button size="sm" variant="secondary" onClick={() => setAssign(s)}><Users className="size-4" aria-hidden />Assign to students</Button>
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </QueryView>
      {assign && <AssignFee structure={assign} onClose={() => setAssign(null)} />}
    </>
  );
}

function NewStructure({ onClose }: { onClose: () => void }) {
  const semesters = useGet<any[]>('/semesters');
  const [v, setV] = useState({ name: '', description: '', amount: '', dueDate: '', semesterId: '' });
  const act = useAct((b: typeof v) => send('POST', '/fees/structures', { ...b, amount: Number(b.amount), semesterId: b.semesterId || null }), { success: 'Fee structure created', invalidate: ['/fees'], onDone: onClose });
  const err = fieldErrors(act.error);
  return (
    <Modal open onClose={onClose} title="New fee structure">
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); act.mutate(v); }}>
        <Input label="Name" placeholder="Semester 1 tuition" required value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} error={err.name} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Amount (₹)" type="number" min="1" step="0.01" required value={v.amount} onChange={(e) => setV({ ...v, amount: e.target.value })} error={err.amount} />
          <Input label="Due date" type="date" required value={v.dueDate} onChange={(e) => setV({ ...v, dueDate: e.target.value })} error={err.dueDate} />
        </div>
        <Select label="Semester (optional)" value={v.semesterId} onChange={(e) => setV({ ...v, semesterId: e.target.value })}><option value="">Not tied to a semester</option>{semesters.data?.map((s) => <option key={s.id} value={s.id}>{s.academicYear.label} · {s.name}</option>)}</Select>
        <Textarea label="Description (optional)" value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} />
        <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={onClose}>Cancel</Button><Button loading={act.isPending}>Create</Button></div>
      </form>
    </Modal>
  );
}

function AssignFee({ structure, onClose }: { structure: any; onClose: () => void }) {
  const semesters = useGet<any[]>('/semesters');
  const programs = useGet<any[]>('/programs');
  const toast = useToast();
  const [v, setV] = useState({ target: structure.semesterId ? 'SEMESTER' : 'ALL', semesterId: structure.semesterId ?? '', programId: '', discount: '0' });
  const act = useAct((b: typeof v) => send<any>('POST', `/fees/structures/${structure.id}/assign`, { target: b.target, semesterId: b.semesterId || undefined, programId: b.programId || undefined, discount: Number(b.discount) || 0 }),
    { invalidate: ['/fees'], onDone: (r: any) => { toast.success(r.created ? `Billed ${r.created} student${r.created === 1 ? '' : 's'}${r.matched > r.created ? ` · ${r.matched - r.created} already billed` : ''}` : r.matched ? 'Everyone matching was already billed' : 'No students matched'); onClose(); } });
  const net = structure.amount - (Number(v.discount) || 0);
  return (
    <Modal open onClose={onClose} title={`Assign “${structure.name}”`}>
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); act.mutate(v); }}>
        <fieldset>
          <legend className="mb-2 text-sm font-medium">Who should be billed?</legend>
          <div className="grid gap-2 sm:grid-cols-3">
            {([['ALL', 'All active students'], ['SEMESTER', 'Enrolled in a semester'], ['PROGRAM', 'Students of a program']] as const).map(([k, l]) => (
              <label key={k} className={`cursor-pointer rounded-xl border p-3 text-sm transition ${v.target === k ? 'border-primary bg-primary/5 font-medium text-primary' : 'border-line hover:bg-cloud'}`}>
                <input type="radio" name="target" value={k} checked={v.target === k} onChange={() => setV({ ...v, target: k })} className="sr-only" />{l}
              </label>
            ))}
          </div>
        </fieldset>
        {v.target === 'SEMESTER' && <Select label="Semester" required value={v.semesterId} onChange={(e) => setV({ ...v, semesterId: e.target.value })}><option value="">Choose…</option>{semesters.data?.map((s) => <option key={s.id} value={s.id}>{s.academicYear.label} · {s.name}</option>)}</Select>}
        {v.target === 'PROGRAM' && <Select label="Program" required value={v.programId} onChange={(e) => setV({ ...v, programId: e.target.value })}><option value="">Choose…</option>{programs.data?.map((p) => <option key={p.id} value={p.id}>{p.code} · {p.name}</option>)}</Select>}
        <Input label="Discount per student (₹)" type="number" min="0" max={structure.amount} step="0.01" value={v.discount} onChange={(e) => setV({ ...v, discount: e.target.value })} hint={`Each student will be billed ${money(Math.max(0, net))}. Students already billed for this fee are skipped.`} />
        <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={onClose}>Cancel</Button><Button loading={act.isPending}>Assign fee</Button></div>
      </form>
    </Modal>
  );
}
