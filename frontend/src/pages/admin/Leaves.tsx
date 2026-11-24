import { useState } from 'react';
import { CalendarOff, Check, X } from 'lucide-react';
import { send } from '../../lib/api';
import { useAct, useGet } from '../../lib/hooks';
import { ROLE_LABEL, type Role } from '../../lib/auth';
import { fmtDate, fmtDateTime, titleCase } from '../../lib/format';
import { Button, Card, EmptyState, Input, Modal, PageHeader, QueryView, StatusBadge, Table, Tabs, Td, Textarea } from '../../components/ui';

type Status = 'PENDING' | 'APPROVED' | 'REJECTED' | 'ALL';
type Decision = 'APPROVED' | 'REJECTED';

export default function Leaves() {
  const [tab, setTab] = useState<Status>('PENDING');
  const [search, setSearch] = useState('');
  const params = new URLSearchParams({ ...(tab !== 'ALL' && { status: tab }), ...(search.trim() && { search: search.trim() }) });
  const q = useGet<any[]>(`/leaves?${params}`);
  const pending = useGet<any[]>('/leaves?status=PENDING');
  const [review, setReview] = useState<{ leave: any; decision: Decision } | null>(null);
  const [note, setNote] = useState('');
  const act = useAct(() => send('POST', `/leaves/${review!.leave.id}/review`, { decision: review!.decision, note: note.trim() || undefined }), {
    success: review?.decision === 'APPROVED' ? 'Leave approved' : 'Leave rejected', invalidate: ['/leaves'], onDone: () => setReview(null),
  });
  const open = (leave: any, decision: Decision) => { setNote(''); act.reset(); setReview({ leave, decision }); };

  return (
    <>
      <PageHeader title="Leave requests" subtitle="Review leave applied for by students and faculty. Applicants and linked parents are notified of each decision." />
      <Tabs<Status> value={tab} onChange={setTab} tabs={[
        { id: 'PENDING', label: 'Pending', badge: pending.data?.length },
        { id: 'APPROVED', label: 'Approved' }, { id: 'REJECTED', label: 'Rejected' }, { id: 'ALL', label: 'All' },
      ]} />
      <div className="mb-4 max-w-sm"><Input label="Search applicant" type="search" placeholder="Name or email" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
      <QueryView q={q} isEmpty={(d) => !d.length} empty={<EmptyState icon={<CalendarOff className="size-6" />} title={tab === 'PENDING' ? 'No pending requests' : 'No leave requests'} body={tab === 'PENDING' ? "You're all caught up." : undefined} />}>
        {(rows) => (
          <Table head={['Applicant', 'Dates', 'Type', 'Reason', 'Status', '']} caption="Leave requests">
            {rows.map((l) => (
              <tr key={l.id}>
                <Td><div className="font-medium text-navy">{l.applicant.firstName} {l.applicant.lastName}</div><div className="text-xs text-muted">{l.applicant.roles.filter((r: Role) => r === 'STUDENT' || r === 'FACULTY').map((r: Role) => ROLE_LABEL[r]).join(', ')} · {l.applicant.email}</div></Td>
                <Td className="whitespace-nowrap"><div>{fmtDate(l.fromDate)}{l.toDate !== l.fromDate && <> – {fmtDate(l.toDate)}</>}</div><div className="text-xs text-muted">{l.days} day{l.days > 1 ? 's' : ''} · applied {fmtDateTime(l.createdAt)}</div></Td>
                <Td>{titleCase(l.type)}</Td>
                <Td className="max-w-sm"><p className="whitespace-pre-wrap text-sm">{l.reason}</p>{l.reviewer && <p className="mt-1 text-xs text-muted">{titleCase(l.status)} by {l.reviewer.firstName} {l.reviewer.lastName}{l.reviewNote && `: ${l.reviewNote}`}</p>}</Td>
                <Td><StatusBadge status={l.status} /></Td>
                <Td className="text-right">{l.status === 'PENDING' && (
                  <div className="flex justify-end gap-1.5">
                    <Button size="sm" variant="accent" onClick={() => open(l, 'APPROVED')}><Check className="size-4" aria-hidden />Approve</Button>
                    <Button size="sm" variant="secondary" onClick={() => open(l, 'REJECTED')}><X className="size-4" aria-hidden />Reject</Button>
                  </div>
                )}</Td>
              </tr>
            ))}
          </Table>
        )}
      </QueryView>

      <Modal open={!!review} onClose={() => setReview(null)} title={review?.decision === 'APPROVED' ? 'Approve leave' : 'Reject leave'}>
        {review && (
          <form onSubmit={(e) => { e.preventDefault(); act.mutate(); }} className="space-y-4">
            <Card className="!p-4 text-sm">
              <div className="font-medium text-navy">{review.leave.applicant.firstName} {review.leave.applicant.lastName}</div>
              <div className="text-muted">{titleCase(review.leave.type)} · {fmtDate(review.leave.fromDate)} – {fmtDate(review.leave.toDate)} ({review.leave.days} day{review.leave.days > 1 ? 's' : ''})</div>
            </Card>
            <Textarea label={review.decision === 'REJECTED' ? 'Reason for rejection' : 'Note (optional)'} required={review.decision === 'REJECTED'} rows={3} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} hint="Shared with the applicant." />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setReview(null)}>Cancel</Button>
              <Button type="submit" variant={review.decision === 'APPROVED' ? 'accent' : 'danger'} loading={act.isPending}>{review.decision === 'APPROVED' ? 'Approve' : 'Reject'}</Button>
            </div>
          </form>
        )}
      </Modal>
    </>
  );
}
