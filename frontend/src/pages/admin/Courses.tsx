import { useState } from 'react';
import { Plus } from 'lucide-react';
import { send } from '../../lib/api';
import { useAct, useGet } from '../../lib/hooks';
import { Button, EmptyState, Input, Modal, PageHeader, QueryView, Select, StatusBadge, Table, Td, Textarea, fieldErrors } from '../../components/ui';
import { AdminSummary } from './Summary';

export default function Courses() {
  const [search, setSearch] = useState('');
  const q = useGet<any[]>(`/courses${search ? `?search=${encodeURIComponent(search)}` : ''}`);
  const [edit, setEdit] = useState<any | 'new' | null>(null);
  return (
    <>
      <PageHeader title="Courses" subtitle="Course definitions. Each semester's delivery is a separate course offering." actions={<Button onClick={() => setEdit('new')}><Plus className="size-4" aria-hidden />New course</Button>} />
      <AdminSummary kind="courses" />
      <div className="mb-4 max-w-sm"><Input label="Search by code or title" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
      <QueryView q={q} empty={<EmptyState title="No courses yet" body="Create a course, then offer it in a semester." />}>
        {(rows) => (
          <Table head={['Code', 'Title', 'Department', 'Credits', 'Offerings', 'Status', '']}>
            {rows.map((c) => (
              <tr key={c.id}>
                <Td className="font-semibold">{c.code}</Td><Td>{c.title}</Td><Td>{c.department.code}</Td><Td>{c.credits}</Td><Td>{c._count.offerings}</Td><Td><StatusBadge status={c.status} /></Td>
                <Td><Button size="sm" variant="secondary" onClick={() => setEdit(c)}>Edit</Button></Td>
              </tr>
            ))}
          </Table>
        )}
      </QueryView>
      {edit && <CourseForm course={edit === 'new' ? null : edit} onClose={() => setEdit(null)} />}
    </>
  );
}

function CourseForm({ course, onClose }: { course: any | null; onClose: () => void }) {
  const depts = useGet<any[]>('/departments');
  const [f, setF] = useState({ departmentId: course?.departmentId ?? '', code: course?.code ?? '', title: course?.title ?? '', description: course?.description ?? '', credits: course?.credits ?? 3, status: course?.status ?? 'ACTIVE' });
  const save = useAct(() => (course
    ? send('PATCH', `/courses/${course.id}`, { title: f.title, description: f.description || null, credits: Number(f.credits), status: f.status })
    : send('POST', '/courses', { departmentId: f.departmentId, code: f.code, title: f.title, description: f.description || undefined, credits: Number(f.credits) })), { success: 'Course saved', invalidate: ['/courses'], onDone: onClose });
  const errs = fieldErrors(save.error);
  return (
    <Modal open onClose={onClose} title={course ? 'Edit course' : 'New course'}>
      <form onSubmit={(e) => { e.preventDefault(); save.mutate(); }} className="space-y-4">
        {!course && <Select label="Department" required value={f.departmentId} onChange={(e) => setF({ ...f, departmentId: e.target.value })}><option value="">Choose…</option>{depts.data?.map((d) => <option key={d.id} value={d.id}>{d.code} — {d.name}</option>)}</Select>}
        <div className="grid grid-cols-[1fr_100px] gap-3">
          <Input label="Course code" required disabled={!!course} value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} error={errs.code} />
          <Input label="Credits" type="number" min={0} max={20} value={f.credits} onChange={(e) => setF({ ...f, credits: e.target.value })} />
        </div>
        <Input label="Title" required value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} error={errs.title} />
        <Textarea label="Description" rows={3} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
        {course && <Select label="Status" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}><option>ACTIVE</option><option>ARCHIVED</option></Select>}
        <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" loading={save.isPending}>Save</Button></div>
      </form>
    </Modal>
  );
}
