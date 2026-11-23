import { useEffect, useState } from 'react';
import { CalendarClock, Lock } from 'lucide-react';
import { useGet } from '../../lib/hooks';
import { fmtDateTime, pct } from '../../lib/format';
import { Badge, Card, EmptyState, PageHeader, QueryView, Select, Table, Td } from '../../components/ui';
import { BarList, PALETTE, Ring } from '../../components/charts';
import { Transcript } from '../student/Results';

export default function ParentHome() {
  const students = useGet<any[]>('/parent/students');
  const [sid, setSid] = useState('');
  useEffect(() => { if (!sid && students.data?.[0]) setSid(students.data[0].student.id); }, [students.data, sid]);
  const current = students.data?.find((s) => s.student.id === sid);
  return (
    <>
      <PageHeader title="Student progress" subtitle="Published progress for students linked to your account." />
      <QueryView q={students} empty={<EmptyState title="No linked students" body="Your college verifies parent–student links. Contact the college office if this is unexpected." />}>
        {(rows) => (
          <>
            {rows.length > 1 && <div className="mb-5 max-w-xs"><Select label="Viewing" value={sid} onChange={(e) => setSid(e.target.value)}>{rows.map((s) => <option key={s.student.id} value={s.student.id}>{s.student.firstName} {s.student.lastName}</option>)}</Select></div>}
            {current && (
              <>
                <div className="relative mb-6 flex flex-wrap items-center gap-4 overflow-hidden rounded-3xl bg-gradient-to-br from-navy via-navy-2 to-primary p-6 text-white shadow-xl shadow-navy/15">
                  <div className="absolute -right-16 -top-20 size-64 rounded-full bg-accent/25 blur-3xl" aria-hidden />
                  <span className="relative grid size-14 place-items-center rounded-2xl bg-gradient-to-br from-accent to-primary text-lg font-bold shadow-lg">{current.student.firstName[0]}{current.student.lastName[0]}</span>
                  <div className="relative"><div className="text-xl font-bold">{current.student.firstName} {current.student.lastName}</div><div className="text-sm text-white/70">{current.relationship} · access: {current.scope.map((s: string) => s.toLowerCase()).join(', ') || 'none'}</div></div>
                </div>
                <div className="grid gap-6 lg:grid-cols-2">
                  <Scoped has={current.scope.includes('PROGRESS')} title="Course progress"><ProgressCard sid={sid} /></Scoped>
                  <Scoped has={current.scope.includes('PROGRESS')} title="Coming up"><Calendar sid={sid} /></Scoped>
                  <Scoped has={current.scope.includes('GRADES')} title="Semester results" wide><Transcript url={`/parent/students/${sid}/results`} name={`${current.student.firstName} ${current.student.lastName}`} compact /></Scoped>
                  <Scoped has={current.scope.includes('GRADES')} title="Published grades" wide><Grades sid={sid} /></Scoped>
                  <Scoped has={current.scope.includes('ATTENDANCE')} title="Attendance"><Attendance sid={sid} /></Scoped>
                </div>
              </>
            )}
          </>
        )}
      </QueryView>
    </>
  );
}

function Scoped({ has, title, children, wide }: { has: boolean; title: string; children: React.ReactNode; wide?: boolean }) {
  return <Card title={title} className={wide ? 'lg:col-span-2' : ''}>{has ? children : <p className="flex items-center gap-2 text-sm text-muted"><Lock className="size-4" aria-hidden />Not included in the access your college recorded.</p>}</Card>;
}

function ProgressCard({ sid }: { sid: string }) {
  const q = useGet<any[]>(`/parent/students/${sid}/progress`);
  return <QueryView q={q} empty={<p className="text-sm text-muted">No courses.</p>}>{(rows) => (
    <ul className="grid gap-4 sm:grid-cols-2">{rows.map((c, i) => (
      <li key={c.offeringId} className="flex items-center gap-3 rounded-2xl border border-line/80 p-3">
        <Ring value={c.percent} size={60} label={`${c.course.code} progress`} color={PALETTE[i % PALETTE.length]}><span className="text-xs font-bold text-navy">{pct(c.percent)}</span></Ring>
        <span className="min-w-0 text-sm"><span className="block truncate font-semibold text-navy">{c.course.code} {c.course.title}</span><span className="text-xs text-muted">{c.completed}/{c.requiredLessons} lessons</span></span>
      </li>
    ))}</ul>
  )}</QueryView>;
}

function Calendar({ sid }: { sid: string }) {
  const q = useGet<any[]>(`/parent/students/${sid}/calendar`);
  return <QueryView q={q} empty={<p className="text-sm text-muted">Nothing due in the next 30 days.</p>}>{(rows) => (
    <ul className="space-y-2">{rows.map((r, i) => <li key={i} className="flex items-center justify-between gap-2 text-sm"><span><CalendarClock className="mr-1 inline size-4 text-muted" aria-hidden />{r.course} · {r.title}<span className="block pl-5 text-xs text-muted">{fmtDateTime(r.at)}</span></span>{r.submitted === true ? <Badge tone="success">Submitted</Badge> : r.submitted === false ? <Badge tone="warning">Not yet</Badge> : <Badge>Quiz</Badge>}</li>)}</ul>
  )}</QueryView>;
}

function Grades({ sid }: { sid: string }) {
  const q = useGet<any[]>(`/parent/students/${sid}/grades`);
  return <QueryView q={q} empty={<p className="text-sm text-muted">No courses.</p>}>{(rows) => (
    <div className="space-y-4">{rows.map((c) => (
      <div key={c.offeringId}>
        <div className="mb-2 flex justify-between text-sm"><span className="font-semibold">{c.course.code} {c.course.title}</span><span>Total: <strong>{pct(c.totalPct)}</strong></span></div>
        {c.columns.length === 0 ? <p className="text-xs text-muted">No published grades yet.</p> : (
          <Table head={['Item', 'Score']}>{c.columns.map((col: any) => <tr key={col.id}><Td>{col.title}</Td><Td>{c.cells[col.id] ? `${c.cells[col.id].earned}/${c.cells[col.id].max}` : '—'}</Td></tr>)}</Table>
        )}
      </div>
    ))}<p className="text-xs text-muted">Only marks the instructor has published are shown.</p></div>
  )}</QueryView>;
}

function Attendance({ sid }: { sid: string }) {
  const q = useGet<any[]>(`/parent/students/${sid}/attendance`);
  return <QueryView q={q} empty={<p className="text-sm text-muted">No courses.</p>}>{(rows) => (
    <BarList max={100} format={(v) => `${v}%`} items={rows.map((r) => ({ label: r.course.code, value: r.percent, hint: `(${r.attended}/${r.marked})`, color: r.percent === null ? undefined : r.percent >= 75 ? 'var(--color-accent)' : r.percent >= 60 ? 'var(--color-gold)' : 'var(--color-danger)' }))} />
  )}</QueryView>;
}
