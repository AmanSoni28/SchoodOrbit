import { useState } from 'react';
import { Award, Trash2, UserPlus } from 'lucide-react';
import { send } from '../../../lib/api';
import { useAct, useGet } from '../../../lib/hooks';
import { pct } from '../../../lib/format';
import { Button, Card, EmptyState, Modal, QueryView, Select, StatusBadge, Table, Td, Textarea, useConfirm, useToast } from '../../../components/ui';
import type { TabProps } from '../OfferingPage';

export default function PeopleTab({ offeringId, access, offering }: TabProps) {
  const enrPath = `/offerings/${offeringId}/enrollments`;
  const enr = useGet<any[]>(enrPath);
  const progress = useGet<any>(`/offerings/${offeringId}/progress`);
  const faculty = useGet<any[]>(access.isAdmin ? '/users?role=FACULTY&pageSize=100' : null);
  const [adding, setAdding] = useState(false);
  const [emails, setEmails] = useState('');
  const [facultyId, setFacultyId] = useState('');
  const { confirm, dialog } = useConfirm();
  const toast = useToast();
  const inv = [enrPath, `/offerings/${offeringId}`];
  const enroll = useAct(() => send('POST', enrPath, { emails: emails.split(/[\s,;]+/).filter(Boolean) }), {
    invalidate: inv, onDone: (r: any) => { toast.success(`${r.enrolled} student(s) enrolled`); if (r.notFound.length) toast.error(`No student account for: ${r.notFound.join(', ')}`); setAdding(false); setEmails(''); },
  });
  const setStatus = useAct(({ studentId, status }: { studentId: string; status: string }) => send('PATCH', `${enrPath}/${studentId}`, { status }), { success: 'Enrollment updated', invalidate: inv });
  const assign = useAct(() => send('POST', `/offerings/${offeringId}/instructors`, { facultyId }), { success: 'Instructor assigned', invalidate: inv, onDone: () => setFacultyId('') });
  const unassign = useAct((fid: string) => send('DELETE', `/offerings/${offeringId}/instructors/${fid}`), { success: 'Instructor removed', invalidate: inv });
  const certify = useAct((studentId: string) => send('POST', `/offerings/${offeringId}/certificates`, { studentId }), { success: 'Certificate issued', invalidate: inv });
  const prog = (sid: string) => progress.data?.students?.find((s: any) => s.student.id === sid);

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <Card title="Instructors">
        <ul className="space-y-2">
          {offering.instructors.map((i: any) => (
            <li key={i.faculty.id} className="flex items-center justify-between text-sm">
              <span>{i.faculty.firstName} {i.faculty.lastName}<span className="block text-xs text-muted">{i.faculty.email}</span></span>
              {access.isAdmin && <button onClick={async () => (await confirm({ title: 'Remove instructor?', body: `${i.faculty.firstName} will lose access to manage this course.`, confirm: 'Remove', danger: true })) && unassign.mutate(i.faculty.id)} className="rounded p-1.5 text-muted hover:bg-cloud" aria-label={`Remove ${i.faculty.firstName}`}><Trash2 className="size-4" /></button>}
            </li>
          ))}
          {offering.instructors.length === 0 && <li className="text-sm text-muted">No instructor assigned.</li>}
        </ul>
        {access.isAdmin && (
          <form onSubmit={(e) => { e.preventDefault(); assign.mutate(); }} className="mt-4 space-y-2">
            <Select label="Assign faculty" value={facultyId} onChange={(e) => setFacultyId(e.target.value)}><option value="">Choose…</option>{faculty.data?.map((u) => <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>)}</Select>
            <Button type="submit" size="sm" disabled={!facultyId} loading={assign.isPending}>Assign</Button>
          </form>
        )}
      </Card>
      <Card className="lg:col-span-2" title={`Students (${enr.data?.filter((e) => e.status !== 'DROPPED').length ?? 0})`} action={access.isAdmin && <Button size="sm" onClick={() => setAdding(true)}><UserPlus className="size-4" aria-hidden />Enroll students</Button>}>
        <QueryView q={enr} empty={<EmptyState title="No students enrolled" />}>
          {(rows) => (
            <Table head={['Student', 'Progress', 'Status', '']}>
              {rows.map((e) => {
                const p = prog(e.student.id);
                return (
                  <tr key={e.id}>
                    <Td><div className="font-medium">{e.student.firstName} {e.student.lastName}</div><div className="text-xs text-muted">{e.student.email}</div></Td>
                    <Td>{p ? `${p.completed}/${progress.data.requiredLessons} lessons · ${pct(p.percent)}` : '—'}</Td>
                    <Td>{access.isAdmin ? (
                      <select aria-label="Enrollment status" value={e.status} onChange={(ev) => setStatus.mutate({ studentId: e.student.id, status: ev.target.value })} className="rounded-lg border border-line px-2 py-1 text-sm"><option>ACTIVE</option><option>DROPPED</option><option>COMPLETED</option></select>
                    ) : <StatusBadge status={e.status} />}</Td>
                    <Td>{access.isInstructor && p && p.percent === 100 && e.status !== 'DROPPED' && <Button size="sm" variant="secondary" loading={certify.isPending} onClick={() => certify.mutate(e.student.id)}><Award className="size-4" aria-hidden />Certificate</Button>}</Td>
                  </tr>
                );
              })}
            </Table>
          )}
        </QueryView>
      </Card>
      <Modal open={adding} onClose={() => setAdding(false)} title="Enroll students">
        <form onSubmit={(ev) => { ev.preventDefault(); enroll.mutate(); }} className="space-y-4">
          <Textarea label="Student emails" rows={6} value={emails} onChange={(e) => setEmails(e.target.value)} hint="One per line, or separated by commas. Already-enrolled students are skipped." />
          <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => setAdding(false)}>Cancel</Button><Button type="submit" loading={enroll.isPending}>Enroll</Button></div>
        </form>
      </Modal>
      {dialog}
    </div>
  );
}
