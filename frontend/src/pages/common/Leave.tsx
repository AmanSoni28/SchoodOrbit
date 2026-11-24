import { useState } from 'react';
import { CalendarOff } from 'lucide-react';
import { send } from '../../lib/api';
import { useAct, useGet } from '../../lib/hooks';
import { fmtDate, fmtDateTime, titleCase } from '../../lib/format';
import { Button, Card, EmptyState, Input, PageHeader, QueryView, Select, StatusBadge, Table, Td, Textarea, fieldErrors, useConfirm } from '../../components/ui';

export const LEAVE_TYPES = ['SICK', 'CASUAL', 'MEDICAL', 'FAMILY', 'OTHER'] as const;
const todayInput = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const days = (a: string, b: string) => (a && b && b >= a ? Math.round((Date.parse(b) - Date.parse(a)) / 86400000) + 1 : 0);
const blank = () => ({ type: 'SICK', fromDate: todayInput(), toDate: todayInput(), reason: '' });

export default function Leave() {
  const q = useGet<any[]>('/leaves/mine');
  const [f, setF] = useState(blank);
  const { confirm, dialog } = useConfirm();
  const apply = useAct(() => send('POST', '/leaves', f), { success: 'Leave request submitted', invalidate: ['/leaves'], onDone: () => setF(blank()) });
  const cancel = useAct((id: string) => send('POST', `/leaves/${id}/cancel`), { success: 'Request cancelled', invalidate: ['/leaves'] });
  const errs = fieldErrors(apply.error);
  const n = days(f.fromDate, f.toDate);

  return (
    <>
      <PageHeader title="Apply for leave" subtitle="Request time off and track the status of your requests. The college office reviews each request." />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="New request" className="lg:order-2 lg:self-start">
          <form onSubmit={(e) => { e.preventDefault(); apply.mutate(); }} className="space-y-4">
            <Select label="Leave type" required value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })} error={errs.type}>
              {LEAVE_TYPES.map((t) => <option key={t} value={t}>{titleCase(t)}</option>)}
            </Select>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
              <Input label="From" type="date" required value={f.fromDate} onChange={(e) => setF({ ...f, fromDate: e.target.value, toDate: f.toDate < e.target.value ? e.target.value : f.toDate })} error={errs.fromDate} />
              <Input label="To" type="date" required min={f.fromDate} value={f.toDate} onChange={(e) => setF({ ...f, toDate: e.target.value })} error={errs.toDate} />
            </div>
            <p className="rounded-lg bg-cloud px-3 py-2 text-sm text-muted">{n ? <><span className="font-semibold text-navy">{n}</span> day{n > 1 ? 's' : ''} of leave</> : 'Pick a valid date range'}</p>
            <Textarea label="Reason" required rows={4} minLength={10} maxLength={2000} placeholder="Briefly explain why you need leave" value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} error={errs.reason} />
            <Button type="submit" className="w-full" loading={apply.isPending} disabled={!n}>Submit request</Button>
          </form>
        </Card>

        <div className="lg:order-1 lg:col-span-2">
          <Card title="My requests">
            <QueryView q={q} isEmpty={(d) => !d.length} empty={<EmptyState icon={<CalendarOff className="size-6" />} title="No leave requests yet" body="Requests you submit will appear here with their status." />}>
              {(rows) => (
                <Table head={['Dates', 'Type', 'Reason', 'Status', '']}>
                  {rows.map((l) => (
                    <tr key={l.id}>
                      <Td className="whitespace-nowrap"><div className="font-medium text-navy">{fmtDate(l.fromDate)}{l.toDate !== l.fromDate && <> – {fmtDate(l.toDate)}</>}</div><div className="text-xs text-muted">{l.days} day{l.days > 1 ? 's' : ''} · applied {fmtDateTime(l.createdAt)}</div></Td>
                      <Td>{titleCase(l.type)}</Td>
                      <Td className="max-w-xs"><p className="line-clamp-2 text-sm">{l.reason}</p>{l.reviewNote && <p className="mt-1 text-xs text-muted">Note{l.reviewer ? ` from ${l.reviewer.firstName}` : ''}: {l.reviewNote}</p>}</Td>
                      <Td><StatusBadge status={l.status} /></Td>
                      <Td className="text-right">{l.status === 'PENDING' && (
                        <Button size="sm" variant="ghost" loading={cancel.isPending && cancel.variables === l.id}
                          onClick={async () => { if (await confirm({ title: 'Cancel this request?', body: 'You can apply again later if you still need leave.', confirm: 'Cancel request' })) cancel.mutate(l.id); }}>Cancel</Button>
                      )}</Td>
                    </tr>
                  ))}
                </Table>
              )}
            </QueryView>
          </Card>
        </div>
      </div>
      {dialog}
    </>
  );
}
