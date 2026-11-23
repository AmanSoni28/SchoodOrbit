import { useEffect, useState } from 'react';
import { CheckCircle2, EyeOff, GraduationCap, Megaphone, Percent, Search, Trophy, Users } from 'lucide-react';
import { api, send } from '../../lib/api';
import { useAct, useGet } from '../../lib/hooks';
import { fmtDateTime, pct } from '../../lib/format';
import { Badge, Button, Card, EmptyState, Input, PageHeader, QueryView, Select, Stat, StatusBadge, Table, Td, useConfirm } from '../../components/ui';
import { BarList, Columns, Ring, StackedBar } from '../../components/charts';
import { GRADE_COLOR, GradePill } from '../student/Results';

export default function Results() {
  const sems = useGet<any[]>('/results/semesters');
  const [id, setId] = useState('');
  useEffect(() => { if (!id && sems.data?.[0]) setId(sems.data[0].id); }, [sems.data, id]);
  return (
    <>
      <PageHeader eyebrow="Academics" title="Results" subtitle="Semester results are computed from published marks (10-point scale, credit-weighted SGPA). Review them, then publish to students and parents." />
      <QueryView q={sems} empty={<EmptyState icon={<GraduationCap className="size-6" />} title="No semesters yet" body="Set up semesters under Academic structure first." />}>
        {(rows) => (
          <>
            <div className="mb-6 flex flex-wrap gap-2" role="tablist" aria-label="Semester">
              {rows.map((s) => (
                <button key={s.id} role="tab" aria-selected={id === s.id} onClick={() => setId(s.id)}
                  className={`flex items-center gap-2 rounded-xl border px-3.5 py-2 text-sm font-medium transition ${id === s.id ? 'border-primary bg-primary text-white shadow-lg shadow-primary/25' : 'border-line bg-white hover:border-primary/40'}`}>
                  {s.year} · {s.name}
                  {s.publication ? <CheckCircle2 className={`size-4 ${id === s.id ? 'text-white' : 'text-success'}`} aria-label="published" /> : <span className={`rounded-full px-1.5 text-[10px] ${id === s.id ? 'bg-white/20' : 'bg-cloud text-muted'}`}>draft</span>}
                </button>
              ))}
            </div>
            {id && <SemesterResult id={id} />}
          </>
        )}
      </QueryView>
    </>
  );
}

function SemesterResult({ id }: { id: string }) {
  const q = useGet<any>(`/results/semesters/${id}`);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const { confirm, dialog } = useConfirm();
  const publish = useAct(() => send('POST', `/results/semesters/${id}/publish`), { success: 'Results published to students and parents', invalidate: ['/results'] });
  const unpublish = useAct(() => api(`/results/semesters/${id}/publish`, { method: 'DELETE' }), { success: 'Results hidden from students', invalidate: ['/results'] });
  return (
    <QueryView q={q}>
      {(d) => {
        const s = d.stats;
        const passRate = s.students ? Math.round((s.pass / s.students) * 100) : null;
        const rows = d.students.filter((x: any) => (!status || x.status === status) && (!search || `${x.student.firstName} ${x.student.lastName} ${x.student.email}`.toLowerCase().includes(search.toLowerCase())));
        if (s.students === 0) return <EmptyState icon={<Users className="size-6" />} title="No enrolled students" body="This semester has no published offerings with enrolled students yet." />;
        return (
          <>
            <div className={`mb-6 flex flex-wrap items-center gap-4 rounded-2xl border p-4 ${d.publication ? 'border-accent/30 bg-accent/5' : 'border-gold/40 bg-gold/10'}`}>
              <span className={`grid size-10 place-items-center rounded-xl text-white ${d.publication ? 'bg-accent' : 'bg-[#e09a2a]'}`} aria-hidden>{d.publication ? <CheckCircle2 className="size-5" /> : <Megaphone className="size-5" />}</span>
              <div className="min-w-0 flex-1 text-sm">
                <div className="font-semibold text-navy">{d.publication ? 'Published — visible to students and parents' : 'Not published — only administrators can see these results'}</div>
                <div className="text-muted">{d.publication ? `Published ${fmtDateTime(d.publication.publishedAt)}. Marks published later will update results automatically.` : `${s.incomplete} student${s.incomplete === 1 ? ' has' : 's have'} courses without published marks.`}</div>
              </div>
              {d.publication
                ? <Button variant="secondary" loading={unpublish.isPending} onClick={async () => { if (await confirm({ title: 'Unpublish results?', body: 'Students and parents will no longer see this semester’s results until you publish again.', confirm: 'Unpublish', danger: true })) unpublish.mutate(); }}><EyeOff className="size-4" aria-hidden />Unpublish</Button>
                : <Button loading={publish.isPending} onClick={async () => { if (await confirm({ title: `Publish ${d.semester.year} · ${d.semester.name} results?`, body: <>All {s.students} students and their linked parents will be able to see their grades and SGPA.{s.incomplete > 0 && <><br /><br /><strong>{s.incomplete}</strong> student{s.incomplete === 1 ? ' is' : 's are'} still incomplete.</>}</>, confirm: 'Publish results' })) publish.mutate(); }}><Megaphone className="size-4" aria-hidden />Publish results</Button>}
            </div>

            <div className="mb-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <Stat label="Students" value={s.students} hint={`${d.courses.length} courses`} icon={<Users />} />
              <Stat label="Pass rate" value={pct(passRate)} hint={`${s.pass} pass · ${s.fail} fail · ${s.incomplete} incomplete`} icon={<Percent />} tone="accent" />
              <Stat label="Average SGPA" value={s.avgSgpa?.toFixed(2) ?? '—'} hint="students with graded courses" icon={<GraduationCap />} tone="gold" />
              <Stat label="Top SGPA" value={s.topSgpa?.toFixed(2) ?? '—'} hint={d.students[0]?.sgpa !== null && d.students[0] ? `${d.students[0].student.firstName} ${d.students[0].student.lastName}` : undefined} icon={<Trophy />} tone="navy" />
            </div>

            <div className="mb-6 grid gap-6 lg:grid-cols-3">
              <Card title="Grade distribution" subtitle="Course grades awarded this semester" className="lg:col-span-2">
                <Columns label="Grade distribution" height={170} series={[{ name: 'Course grades', color: 'var(--color-primary)' }]} data={d.gradeDist.map((g: any) => ({ label: g.grade, values: [g.n] }))} />
              </Card>
              <Card title="Outcome">
                <div className="flex flex-col items-center">
                  <Ring value={passRate} size={130} label="Pass rate"><span className="text-center"><span className="block text-2xl font-bold text-navy">{pct(passRate)}</span><span className="text-xs text-muted">pass rate</span></span></Ring>
                  <div className="mt-5 w-full"><StackedBar segments={[{ label: 'Pass', value: s.pass, color: 'var(--color-accent)' }, { label: 'Fail', value: s.fail, color: 'var(--color-danger)' }, { label: 'Incomplete', value: s.incomplete, color: 'var(--color-gold)' }]} /></div>
                </div>
              </Card>
            </div>

            <Card title="Course performance" subtitle="Average score and pass count per course" className="mb-6">
              <div className="grid gap-6 lg:grid-cols-2">
                <BarList max={100} format={(v) => `${v}%`} items={d.courseStats.map((c: any) => ({ label: `${c.code} · ${c.title}`, value: c.avg, hint: `(${c.pass}/${c.graded} pass)`, color: c.avg === null ? undefined : c.avg >= 70 ? 'var(--color-accent)' : c.avg >= 50 ? 'var(--color-gold)' : 'var(--color-danger)' }))} />
                <ul className="grid content-start gap-2 sm:grid-cols-2">
                  {d.gradeDist.map((g: any) => <li key={g.grade} className="flex items-center gap-2.5 rounded-xl bg-cloud/70 px-3 py-2 text-sm"><GradePill grade={g.grade} /><span className="text-muted">awarded</span><span className="ml-auto font-bold text-navy">{g.n}</span></li>)}
                </ul>
              </div>
            </Card>

            <Card title="Student results" subtitle="Ranked by SGPA">
              <div className="mb-4 grid gap-3 sm:grid-cols-[1fr_180px]">
                <div className="relative"><Search className="pointer-events-none absolute bottom-2.5 left-3 size-4 text-muted" aria-hidden /><Input label="Search student" className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
                <Select label="Result" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">All</option><option value="PASS">Pass</option><option value="FAIL">Fail</option><option value="INCOMPLETE">Incomplete</option></Select>
              </div>
              <Table head={['#', 'Student', ...d.courses.map((c: any) => c.code), 'Credits', 'SGPA', 'Result']}>
                {rows.map((x: any) => {
                  const rank = d.students.indexOf(x) + 1;
                  return (
                    <tr key={x.studentId}>
                      <Td>{x.sgpa !== null && rank <= 3 ? <span className="grid size-7 place-items-center rounded-full text-xs font-bold text-white" style={{ background: ['#e0a82e', '#94a3b8', '#c2793f'][rank - 1] }}>{rank}</span> : <span className="pl-2 text-xs text-muted">{rank}</span>}</Td>
                      <Td><div className="font-medium">{x.student.firstName} {x.student.lastName}</div><div className="text-xs text-muted">{x.student.email}</div></Td>
                      {d.courses.map((c: any) => {
                        const cr = x.courses.find((y: any) => y.offeringId === c.offeringId);
                        return <Td key={c.offeringId}>{cr ? <span className="inline-flex items-center gap-1.5"><GradePill grade={cr.grade} />{cr.pct !== null && <span className="text-xs tabular-nums text-muted">{Math.round(cr.pct)}%</span>}</span> : <span className="text-xs text-muted">n/a</span>}</Td>;
                      })}
                      <Td className="tabular-nums">{x.creditsEarned}/{x.credits}</Td>
                      <Td>{x.sgpa === null ? <span className="text-muted">—</span> : <span className="text-base font-bold" style={{ color: x.sgpa >= 8 ? GRADE_COLOR.O : x.sgpa >= 6 ? 'var(--color-primary)' : x.sgpa >= 5 ? '#b7791f' : 'var(--color-danger)' }}>{x.sgpa.toFixed(2)}</span>}</Td>
                      <Td><StatusBadge status={x.status} /></Td>
                    </tr>
                  );
                })}
              </Table>
              {rows.length === 0 && <p className="py-6 text-center text-sm text-muted">No students match.</p>}
              <p className="mt-3 text-xs text-muted"><Badge>Incomplete</Badge> means at least one course has no published marks yet; it is excluded from SGPA until graded.</p>
            </Card>
            {dialog}
          </>
        );
      }}
    </QueryView>
  );
}
