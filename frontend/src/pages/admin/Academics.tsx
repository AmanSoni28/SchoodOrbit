import { useState, type ReactNode } from 'react';
import { Plus } from 'lucide-react';
import { send } from '../../lib/api';
import { useAct, useGet } from '../../lib/hooks';
import { fmtDate } from '../../lib/format';
import { Badge, Button, Card, Input, Modal, PageHeader, QueryView } from '../../components/ui';

type Kind = 'department' | 'program' | 'batch' | 'section' | 'year' | 'semester';

export default function Academics() {
  const depts = useGet<any[]>('/departments');
  const programs = useGet<any[]>('/programs');
  const years = useGet<any[]>('/academic-years');
  const [modal, setModal] = useState<{ kind: Kind; parentId?: string } | null>(null);
  const add = (kind: Kind, parentId?: string) => () => setModal({ kind, parentId });
  return (
    <>
      <PageHeader title="Academic structure" subtitle="Departments, programs, batches, sections, academic years and semesters." />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Departments & programs" action={<Button size="sm" onClick={add('department')}><Plus className="size-4" aria-hidden />Department</Button>}>
          <QueryView q={depts} empty={<p className="text-sm text-muted">Add your first department.</p>}>
            {(rows) => (
              <ul className="space-y-4">{rows.map((d) => (
                <li key={d.id} className="rounded-xl border border-line p-4">
                  <div className="flex items-center justify-between"><div><Badge tone="navy">{d.code}</Badge> <span className="font-semibold">{d.name}</span></div><Button size="sm" variant="ghost" onClick={add('program', d.id)}><Plus className="size-4" aria-hidden />Program</Button></div>
                  <ul className="mt-3 space-y-2">
                    {programs.data?.filter((p) => p.departmentId === d.id).map((p) => (
                      <li key={p.id} className="rounded-lg bg-cloud p-3 text-sm">
                        <div className="flex items-center justify-between"><span><strong>{p.code}</strong> · {p.name} · {p.durationSemesters} sem</span><Button size="sm" variant="ghost" onClick={add('batch', p.id)}><Plus className="size-4" aria-hidden />Batch</Button></div>
                        {p.batches.map((b: any) => (
                          <div key={b.id} className="mt-2 flex flex-wrap items-center gap-2 pl-3 text-xs">
                            <span className="font-medium">Batch {b.name}:</span>{b.sections.map((s: any) => <Badge key={s.id}>Section {s.name}</Badge>)}
                            <button onClick={add('section', b.id)} className="font-medium text-primary">+ Section</button>
                          </div>
                        ))}
                      </li>
                    ))}
                  </ul>
                </li>
              ))}</ul>
            )}
          </QueryView>
        </Card>
        <Card title="Academic years & semesters" action={<Button size="sm" onClick={add('year')}><Plus className="size-4" aria-hidden />Academic year</Button>}>
          <QueryView q={years} empty={<p className="text-sm text-muted">Add an academic year, then its semesters.</p>}>
            {(rows) => (
              <ul className="space-y-3">{rows.map((y) => (
                <li key={y.id} className="rounded-xl border border-line p-4">
                  <div className="flex items-center justify-between"><div><span className="font-semibold">{y.label}</span> <span className="text-xs text-muted">{fmtDate(y.startDate)} – {fmtDate(y.endDate)}</span></div><Button size="sm" variant="ghost" onClick={add('semester', y.id)}><Plus className="size-4" aria-hidden />Semester</Button></div>
                  <ul className="mt-2 space-y-1">{y.semesters.map((s: any) => <li key={s.id} className="text-sm">{s.name} <span className="text-xs text-muted">· {fmtDate(s.startDate)} – {fmtDate(s.endDate)}</span></li>)}</ul>
                </li>
              ))}</ul>
            )}
          </QueryView>
        </Card>
      </div>
      {modal && <AddModal {...modal} depts={depts.data ?? []} onClose={() => setModal(null)} />}
    </>
  );
}

function AddModal({ kind, parentId, onClose }: { kind: Kind; parentId?: string; depts: any[]; onClose: () => void }) {
  const [f, setF] = useState<Record<string, any>>({ durationSemesters: 8 });
  const set = (k: string) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const cfg: Record<Kind, { title: string; path: string; body: () => object; fields: ReactNode }> = {
    department: { title: 'New department', path: '/departments', body: () => ({ code: f.code, name: f.name }), fields: <><Input label="Code" required value={f.code ?? ''} onChange={set('code')} hint="e.g. CSE" /><Input label="Name" required value={f.name ?? ''} onChange={set('name')} /></> },
    program: { title: 'New program', path: '/programs', body: () => ({ departmentId: parentId, code: f.code, name: f.name, durationSemesters: Number(f.durationSemesters) }), fields: <><Input label="Code" required value={f.code ?? ''} onChange={set('code')} hint="e.g. BTECH-CSE" /><Input label="Name" required value={f.name ?? ''} onChange={set('name')} /><Input label="Duration (semesters)" type="number" min={1} max={16} value={f.durationSemesters} onChange={set('durationSemesters')} /></> },
    batch: { title: 'New batch', path: '/batches', body: () => ({ programId: parentId, name: f.name }), fields: <Input label="Batch name" required value={f.name ?? ''} onChange={set('name')} hint="e.g. 2025-2029" /> },
    section: { title: 'New section', path: '/sections', body: () => ({ batchId: parentId, name: f.name }), fields: <Input label="Section name" required value={f.name ?? ''} onChange={set('name')} hint="e.g. A" /> },
    year: { title: 'New academic year', path: '/academic-years', body: () => ({ label: f.label, startDate: f.startDate, endDate: f.endDate }), fields: <><Input label="Label" required value={f.label ?? ''} onChange={set('label')} hint="e.g. 2026-27" /><Input label="Start" type="date" required value={f.startDate ?? ''} onChange={set('startDate')} /><Input label="End" type="date" required value={f.endDate ?? ''} onChange={set('endDate')} /></> },
    semester: { title: 'New semester', path: '/semesters', body: () => ({ academicYearId: parentId, name: f.name, startDate: f.startDate, endDate: f.endDate }), fields: <><Input label="Name" required value={f.name ?? ''} onChange={set('name')} hint="e.g. Semester 3" /><Input label="Start" type="date" required value={f.startDate ?? ''} onChange={set('startDate')} /><Input label="End" type="date" required value={f.endDate ?? ''} onChange={set('endDate')} /></> },
  };
  const c = cfg[kind];
  const save = useAct(() => send('POST', c.path, c.body()), { success: 'Saved', invalidate: ['/departments', '/programs', '/academic-years', '/semesters', '/sections'], onDone: onClose });
  return (
    <Modal open onClose={onClose} title={c.title}>
      <form onSubmit={(e) => { e.preventDefault(); save.mutate(); }} className="space-y-4">
        {c.fields}
        <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" loading={save.isPending}>Save</Button></div>
      </form>
    </Modal>
  );
}
