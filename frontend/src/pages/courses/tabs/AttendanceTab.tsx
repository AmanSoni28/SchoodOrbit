import { useState } from 'react';
import { Plus, Video } from 'lucide-react';
import { send } from '../../../lib/api';
import { useAct, useGet } from '../../../lib/hooks';
import { fmtDateTime, pct } from '../../../lib/format';
import { Button, Card, EmptyState, Input, Modal, QueryView, Stat, StatusBadge, Table, Td } from '../../../components/ui';
import type { TabProps } from '../OfferingPage';

const STATUSES = ['PRESENT', 'LATE', 'ABSENT', 'EXCUSED'] as const;

export default function AttendanceTab(p: TabProps) {
  return p.access.isStudent && !p.access.isInstructor ? <Mine {...p} /> : <Staff {...p} />;
}

function Mine({ offeringId }: TabProps) {
  const q = useGet<any>(`/offerings/${offeringId}/attendance/me`);
  const sessions = useGet<any[]>(`/offerings/${offeringId}/sessions`);
  const upcoming = (sessions.data ?? []).filter((s) => new Date(s.startsAt) > new Date());
  return (
    <QueryView q={q}>
      {(d) => (
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="space-y-4">
            <Stat label="Attendance" value={pct(d.summary.percent)} hint={`${d.summary.attended} of ${d.summary.marked} marked sessions (excused not counted)`} tone="accent" />
            <Card title="Upcoming sessions">
              {upcoming.length === 0 ? <p className="text-sm text-muted">None scheduled.</p> : upcoming.map((s) => (
                <div key={s.id} className="mb-2 text-sm"><div className="font-medium">{s.title}</div><div className="text-xs text-muted">{fmtDateTime(s.startsAt)}</div>{s.meetingUrl && <a className="inline-flex items-center gap-1 text-xs font-medium text-primary" href={s.meetingUrl} target="_blank" rel="noreferrer noopener"><Video className="size-3.5" aria-hidden />Join</a>}</div>
              ))}
            </Card>
          </div>
          <div className="lg:col-span-2">
            {d.records.length === 0 ? <EmptyState title="No attendance recorded yet" /> : (
              <Table head={['Session', 'Date', 'Status']}>{d.records.map((r: any) => <tr key={r.sessionId}><Td>{r.session.title}</Td><Td>{fmtDateTime(r.session.startsAt)}</Td><Td><StatusBadge status={r.status} /></Td></tr>)}</Table>
            )}
          </div>
        </div>
      )}
    </QueryView>
  );
}

function Staff({ offeringId, access }: TabProps) {
  const path = `/offerings/${offeringId}/sessions`;
  const q = useGet<any[]>(path);
  const report = useGet<any[]>(`/offerings/${offeringId}/attendance/report`);
  const [creating, setCreating] = useState(false);
  const [marking, setMarking] = useState<string | null>(null);
  return (
    <div className="grid gap-6 lg:grid-cols-5">
      <Card className="lg:col-span-3" title="Class sessions" action={access.isInstructor && <Button size="sm" onClick={() => setCreating(true)}><Plus className="size-4" aria-hidden />Session</Button>}>
        <QueryView q={q} empty={<EmptyState title="No sessions yet" body="Schedule a class session to take attendance and share a live link." />}>
          {(rows) => (
            <ul className="divide-y divide-line">{rows.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-3 py-3">
                <div><div className="font-medium">{s.title}</div><div className="text-xs text-muted">{fmtDateTime(s.startsAt)} · {s._count.records} marked</div></div>
                <Button size="sm" variant="secondary" onClick={() => setMarking(s.id)}>{access.isInstructor ? 'Take attendance' : 'View'}</Button>
              </li>
            ))}</ul>
          )}
        </QueryView>
      </Card>
      <Card className="lg:col-span-2" title="Attendance report">
        <QueryView q={report} empty={<p className="text-sm text-muted">No students.</p>}>
          {(rows) => <ul className="space-y-2 text-sm">{rows.map((r) => <li key={r.studentId} className="flex justify-between"><span>{r.student.firstName} {r.student.lastName}</span><span className="font-medium">{pct(r.percent)}</span></li>)}</ul>}
        </QueryView>
      </Card>
      {creating && <NewSession offeringId={offeringId} onClose={() => setCreating(false)} />}
      {marking && <MarkAttendance sessionId={marking} offeringId={offeringId} editable={access.isInstructor} onClose={() => setMarking(null)} />}
    </div>
  );
}

function NewSession({ offeringId, onClose }: { offeringId: string; onClose: () => void }) {
  const [f, setF] = useState({ title: '', startsAt: '', endsAt: '', meetingUrl: '' });
  const save = useAct(() => send('POST', `/offerings/${offeringId}/sessions`, { title: f.title, startsAt: new Date(f.startsAt).toISOString(), endsAt: new Date(f.endsAt).toISOString(), meetingUrl: f.meetingUrl || undefined }), { success: 'Session scheduled', invalidate: [`/offerings/${offeringId}/sessions`], onDone: onClose });
  return (
    <Modal open onClose={onClose} title="Schedule a session">
      <form onSubmit={(e) => { e.preventDefault(); save.mutate(); }} className="space-y-4">
        <Input label="Title" required value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Starts" type="datetime-local" required value={f.startsAt} onChange={(e) => setF({ ...f, startsAt: e.target.value })} />
          <Input label="Ends" type="datetime-local" required value={f.endsAt} onChange={(e) => setF({ ...f, endsAt: e.target.value })} />
        </div>
        <Input label="Live class link (optional)" type="url" value={f.meetingUrl} onChange={(e) => setF({ ...f, meetingUrl: e.target.value })} />
        <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" loading={save.isPending}>Schedule</Button></div>
      </form>
    </Modal>
  );
}

function MarkAttendance({ sessionId, offeringId, editable, onClose }: { sessionId: string; offeringId: string; editable: boolean; onClose: () => void }) {
  const q = useGet<any>(`/sessions/${sessionId}/attendance`);
  const [marks, setMarks] = useState<Record<string, string>>({});
  const save = useAct(() => send('PUT', `/sessions/${sessionId}/attendance`, { records: Object.entries(marks).map(([studentId, status]) => ({ studentId, status })) }), {
    success: 'Attendance saved', invalidate: [`/offerings/${offeringId}/sessions`, `/offerings/${offeringId}/attendance`, `/sessions/${sessionId}`], onDone: onClose,
  });
  return (
    <Modal open onClose={onClose} title="Attendance" wide>
      <QueryView q={q}>
        {(d) => {
          const current = (sid: string, s: string | null) => marks[sid] ?? s ?? '';
          return (
            <>
              <p className="mb-3 text-sm text-muted">{d.session.title} · {fmtDateTime(d.session.startsAt)}. Corrections to existing marks are recorded in the audit log.</p>
              {editable && <div className="mb-3"><Button size="sm" variant="secondary" onClick={() => setMarks(Object.fromEntries(d.roster.map((r: any) => [r.student.id, current(r.student.id, r.status) || 'PRESENT'])))}>Mark unmarked as present</Button></div>}
              <ul className="max-h-96 divide-y divide-line overflow-y-auto">
                {d.roster.map((r: any) => (
                  <li key={r.student.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <span className="text-sm font-medium">{r.student.firstName} {r.student.lastName}</span>
                    <div role="radiogroup" aria-label={`Attendance for ${r.student.firstName} ${r.student.lastName}`} className="flex gap-1">
                      {STATUSES.map((s) => (
                        <button key={s} type="button" role="radio" aria-checked={current(r.student.id, r.status) === s} disabled={!editable}
                          onClick={() => setMarks({ ...marks, [r.student.id]: s })}
                          className={`rounded-md border px-2 py-1 text-xs font-medium ${current(r.student.id, r.status) === s ? 'border-primary bg-primary text-white' : 'border-line hover:bg-cloud'}`}>
                          {s[0] + s.slice(1).toLowerCase()}
                        </button>
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
              {editable && <div className="mt-4 flex justify-end gap-2"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={save.isPending} disabled={!Object.keys(marks).length} onClick={() => save.mutate()}>Save attendance</Button></div>}
            </>
          );
        }}
      </QueryView>
    </Modal>
  );
}
