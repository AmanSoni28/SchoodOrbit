import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { send } from '../../lib/api';
import { useAct, useGet } from '../../lib/hooks';
import { Button, EmptyState, Input, Modal, PageHeader, QueryView, Select, StatusBadge, Table, Td } from '../../components/ui';
import { AdminSummary } from './Summary';

export default function Offerings() {
  const semesters = useGet<any[]>('/semesters');
  const [semesterId, setSemesterId] = useState('');
  const q = useGet<any[]>(`/offerings?scope=all${semesterId ? `&semesterId=${semesterId}` : ''}`);
  const [open, setOpen] = useState(false);
  return (
    <>
      <PageHeader title="Course offerings" subtitle="A course taught in a specific semester and section, with its instructors and students." actions={<Button onClick={() => setOpen(true)}><Plus className="size-4" aria-hidden />New offering</Button>} />
      <AdminSummary kind="offerings" />
      <div className="mb-4 max-w-xs"><Select label="Semester" value={semesterId} onChange={(e) => setSemesterId(e.target.value)}><option value="">All semesters</option>{semesters.data?.map((s) => <option key={s.id} value={s.id}>{s.academicYear.label} · {s.name}</option>)}</Select></div>
      <QueryView q={q} empty={<EmptyState title="No offerings" body="Create an offering to assign faculty and enroll students." />}>
        {(rows) => (
          <Table head={['Course', 'Semester', 'Section', 'Instructors', 'Students', 'Status', '']}>
            {rows.map((o) => (
              <tr key={o.id}>
                <Td><div className="font-semibold">{o.course.code}</div><div className="text-xs text-muted">{o.course.title}</div></Td>
                <Td>{o.semester.academicYear.label} · {o.semester.name}</Td>
                <Td>{o.section ? `${o.section.batch.program.code} ${o.section.name}` : '—'}</Td>
                <Td className="text-xs">{o.instructors.map((i: any) => `${i.faculty.firstName} ${i.faculty.lastName}`).join(', ') || <span className="text-danger">None</span>}</Td>
                <Td><div className="flex items-center gap-2"><div className="h-2 w-16 overflow-hidden rounded-full bg-cloud"><div className="h-full rounded-full bg-primary" style={{ width: `${(o._count.enrollments / Math.max(1, ...rows.map((r) => r._count.enrollments))) * 100}%` }} /></div><span className="text-xs font-semibold tabular-nums">{o._count.enrollments}</span></div></Td>
                <Td><StatusBadge status={o.status} /></Td>
                <Td><Link to={`/offerings/${o.id}?tab=people`} className="text-sm font-medium text-primary">Manage</Link></Td>
              </tr>
            ))}
          </Table>
        )}
      </QueryView>
      {open && <NewOffering onClose={() => setOpen(false)} />}
    </>
  );
}

function NewOffering({ onClose }: { onClose: () => void }) {
  const nav = useNavigate();
  const courses = useGet<any[]>('/courses');
  const semesters = useGet<any[]>('/semesters');
  const sections = useGet<any[]>('/sections');
  const [f, setF] = useState({ courseId: '', semesterId: '', sectionId: '', meetingUrl: '' });
  const save = useAct(() => send('POST', '/offerings', { courseId: f.courseId, semesterId: f.semesterId, sectionId: f.sectionId || undefined, meetingUrl: f.meetingUrl || undefined }), {
    success: 'Offering created as draft — assign faculty and enroll students next', invalidate: ['/offerings'], onDone: (o: any) => nav(`/offerings/${o.id}?tab=people`),
  });
  return (
    <Modal open onClose={onClose} title="New course offering">
      <form onSubmit={(e) => { e.preventDefault(); save.mutate(); }} className="space-y-4">
        <Select label="Course" required value={f.courseId} onChange={(e) => setF({ ...f, courseId: e.target.value })}><option value="">Choose…</option>{courses.data?.filter((c) => c.status === 'ACTIVE').map((c) => <option key={c.id} value={c.id}>{c.code} — {c.title}</option>)}</Select>
        <Select label="Semester" required value={f.semesterId} onChange={(e) => setF({ ...f, semesterId: e.target.value })}><option value="">Choose…</option>{semesters.data?.map((s) => <option key={s.id} value={s.id}>{s.academicYear.label} · {s.name}</option>)}</Select>
        <Select label="Section (optional)" value={f.sectionId} onChange={(e) => setF({ ...f, sectionId: e.target.value })}><option value="">Whole cohort</option>{sections.data?.map((s) => <option key={s.id} value={s.id}>{s.batch.program.code} {s.batch.name} · {s.name}</option>)}</Select>
        <Input label="Live class link (optional)" type="url" value={f.meetingUrl} onChange={(e) => setF({ ...f, meetingUrl: e.target.value })} />
        <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" loading={save.isPending}>Create</Button></div>
      </form>
    </Modal>
  );
}
