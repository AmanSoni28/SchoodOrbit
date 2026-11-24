import { useMemo, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AlertTriangle, ArrowDownUp, Award, BarChart3, CalendarCheck, ClipboardCheck, Download, GraduationCap, Search, Target, TrendingUp, Users } from 'lucide-react';
import { useGet } from '../../lib/hooks';
import { fmtDate, fromNow } from '../../lib/format';
import { Badge, Card, EmptyState, PageHeader, QueryView, Select, StatusBadge, Stat, Table, Tabs, Td, cx } from '../../components/ui';
import { AreaChart, BarList } from '../../components/charts';
import { GRADE_COLOR, GradePill } from '../student/Results';

type Stats = { students: number; graded: number; average: number | null; median: number | null; highest: number | null; lowest: number | null; passRate: number | null; attendance: number | null; belowAttendance: number; atRisk: number; distribution: { grade: string; n: number }[] };
type CourseSummary = { id: string; status: string; course: { code: string; title: string }; semester: { name: string }; stats: Stats };
type Row = { student: { id: string; firstName: string; lastName: string; email: string }; totalPct: number | null; assignmentsPct: number | null; quizzesPct: number | null; grade: string | null; attendancePct: number | null; completionPct: number | null; missing: number; lastActivity: string | null; risks: string[]; atRisk: boolean };
type Metric = { value: number | null; numerator: number; denominator: number; lowData: boolean };
type Report = {
  offering: { id: string; status: string; gradingWeights: { assignments: number; quizzes: number }; course: { code: string; title: string; credits: number }; semester: { name: string }; section: { name: string; batch: { program: { code: string } } } | null };
  rules: { passPct: number; attendanceMin: number };
  stats: Stats & { submissionRate: number | null; lessonCompletion: number | null; quizAccuracy: number | null };
  students: Row[];
  assessments: { id: string; kind: 'assignment' | 'quiz'; title: string; dueAt: string | null; graded: number; students: number; average: number | null; highest: number | null; lowest: number | null; belowPass: number }[];
  attendanceTrend: { id: string; title: string; date: string; pct: number | null; present: number; marked: number }[];
  topics: { topicId: string; name: string; quizAccuracy: Metric; practiceAccuracy: Metric; doubts: number }[];
  missedQuestions: { questionVersionId: string; prompt: string; total: number; wrong: number; wrongRate: number | null; mostCommonWrong: { text: string; count: number } | null; lowData: boolean }[];
};

const pct = (v: number | null | undefined, d = 0) => (v === null || v === undefined ? '—' : `${+v.toFixed(d)}%`);
/** Traffic-light colour for a percentage against a pass line. */
const tone = (v: number | null, good = 75, ok = 40) => (v === null ? 'text-muted' : v >= good ? 'text-success' : v >= ok ? 'text-[#9a6a12]' : 'text-danger');
const barColor = (v: number | null, good = 75, ok = 40) => (v === null ? 'var(--color-line)' : v >= good ? 'var(--color-accent)' : v >= ok ? 'var(--color-gold)' : 'var(--color-danger)');

function Meter({ value, good, ok }: { value: number | null; good?: number; ok?: number }) {
  return (
    <div className="flex items-center gap-2">
      <span className={cx('w-11 text-right text-sm font-semibold tabular-nums', tone(value, good, ok))}>{pct(value)}</span>
      <span className="hidden h-1.5 w-14 overflow-hidden rounded-full bg-cloud sm:block" aria-hidden><span className="block h-full rounded-full" style={{ width: `${value ?? 0}%`, background: barColor(value, good, ok) }} /></span>
    </div>
  );
}

export default function Performance() {
  const [params, setParams] = useSearchParams();
  const selected = params.get('course') ?? '';
  const list = useGet<CourseSummary[]>('/performance/offerings');
  return (
    <>
      <PageHeader eyebrow="Insights" title="Performance analysis"
        subtitle="Marks, attendance, engagement and topic mastery for your courses — with the students who need attention and why."
        actions={list.data && list.data.length > 0 && (
          <div className="w-72"><Select label="Course" value={selected} onChange={(e) => setParams(e.target.value ? { course: e.target.value } : {})}>
            <option value="">All courses — comparison</option>
            {list.data.map((o) => <option key={o.id} value={o.id}>{o.course.code} — {o.course.title}{o.status === 'ARCHIVED' ? ` (${o.semester.name}, archived)` : ''}</option>)}
          </Select></div>
        )} />
      {selected ? <CourseReport id={selected} /> : (
        <QueryView q={list} isEmpty={(d) => !d.length} empty={<EmptyState icon={<BarChart3 className="size-6" />} title="No courses to analyse yet" body="Performance appears once you have a course with enrolled students." />}>
          {(rows) => <Overview rows={rows} />}
        </QueryView>
      )}
    </>
  );
}

// ───────── All courses ─────────
function Overview({ rows }: { rows: CourseSummary[] }) {
  const students = rows.reduce((s, r) => s + r.stats.students, 0);
  const graded = rows.filter((r) => r.stats.average !== null);
  const wavg = (k: 'average' | 'attendance' | 'passRate') => {
    const xs = rows.filter((r) => r.stats[k] !== null);
    const w = xs.reduce((s, r) => s + r.stats.students, 0);
    return w ? xs.reduce((s, r) => s + (r.stats[k] as number) * r.stats.students, 0) / w : null;
  };
  const at = (r: CourseSummary) => `?course=${r.id}`;
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Courses analysed" value={rows.length} hint={`${students} student enrolments`} icon={<BarChart3 />} tone="navy" />
        <Stat label="Average score" value={pct(wavg('average'), 1)} hint="Weighted by class size" icon={<TrendingUp />} />
        <Stat label="Attendance" value={pct(wavg('attendance'), 1)} hint="Across all classes held" icon={<CalendarCheck />} tone="accent" />
        <Stat label="Students at risk" value={rows.reduce((s, r) => s + r.stats.atRisk, 0)} hint="Open a course to see who and why" icon={<AlertTriangle />} tone="gold" />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Class average by course" subtitle="Weighted total of assignments and quizzes">
          <BarList max={100} format={(v) => `${v}%`} items={graded.map((r) => ({ label: `${r.course.code} · ${r.course.title}`, value: r.stats.average, href: at(r), color: barColor(r.stats.average, 60) }))} />
        </Card>
        <Card title="Attendance by course" subtitle="Present or late, out of sessions marked">
          <BarList max={100} format={(v) => `${v}%`} items={rows.map((r) => ({ label: `${r.course.code} · ${r.course.title}`, value: r.stats.attendance, href: at(r), color: barColor(r.stats.attendance) }))} />
        </Card>
      </div>
      <Card title="Course comparison" subtitle="Select a course for the full breakdown">
        <Table head={['Course', 'Students', 'Average', 'Median', 'Pass rate', 'Attendance', 'At risk', '']} caption="Course comparison">
          {rows.map((r) => (
            <tr key={r.id}>
              <Td><Link to={at(r)} className="font-semibold text-navy hover:text-primary">{r.course.code}</Link><div className="text-xs text-muted">{r.course.title} · {r.semester.name}</div></Td>
              <Td className="tabular-nums">{r.stats.students}</Td>
              <Td><Meter value={r.stats.average} good={60} /></Td>
              <Td className="tabular-nums text-muted">{pct(r.stats.median, 1)}</Td>
              <Td><Meter value={r.stats.passRate} good={90} ok={70} /></Td>
              <Td><Meter value={r.stats.attendance} /></Td>
              <Td>{r.stats.atRisk ? <Badge tone="danger">{r.stats.atRisk}</Badge> : <Badge tone="success">0</Badge>}</Td>
              <Td className="text-right"><StatusBadge status={r.status} /></Td>
            </tr>
          ))}
        </Table>
      </Card>
    </div>
  );
}

// ───────── One course ─────────
type Sort = 'name' | 'totalPct' | 'attendancePct' | 'completionPct';
function CourseReport({ id }: { id: string }) {
  const q = useGet<Report>(`/performance/offerings/${id}`);
  return <QueryView q={q} rows={6}>{(r) => <ReportView r={r} />}</QueryView>;
}

function ReportView({ r }: { r: Report }) {
  const s = r.stats, o = r.offering;
  const [view, setView] = useState<'all' | 'risk' | 'top'>('all');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<{ by: Sort; desc: boolean }>({ by: 'name', desc: false });
  const top = useMemo(() => r.students.filter((x) => x.totalPct !== null).sort((a, b) => b.totalPct! - a.totalPct!).slice(0, 5), [r.students]);
  const rows = useMemo(() => {
    const val = (x: Row) => (sort.by === 'name' ? `${x.student.lastName} ${x.student.firstName}` : x[sort.by] ?? -1);
    return r.students
      .filter((x) => view === 'all' || (view === 'risk' ? x.atRisk : top.includes(x)))
      .filter((x) => !search || `${x.student.firstName} ${x.student.lastName} ${x.student.email}`.toLowerCase().includes(search.toLowerCase()))
      .sort((a, b) => { const A = val(a), B = val(b); return (A < B ? -1 : A > B ? 1 : 0) * (sort.desc ? -1 : 1); });
  }, [r.students, view, search, sort, top]);
  const sortBy = (by: Sort) => setSort((p) => ({ by, desc: p.by === by ? !p.desc : by !== 'name' }));
  const Th = ({ by, children }: { by: Sort; children: ReactNode }) => (
    <button onClick={() => sortBy(by)} className="inline-flex items-center gap-1 uppercase hover:text-ink" aria-label={`Sort by ${String(children)}`}>{children}<ArrowDownUp className={cx('size-3', sort.by === by ? 'text-primary' : 'opacity-40')} aria-hidden /></button>
  );

  const exportCsv = () => {
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = [['Student', 'Email', 'Attendance %', 'Assignments %', 'Quizzes %', 'Overall %', 'Grade', 'Lesson completion %', 'Missing assignments', 'At risk', 'Reasons'].map(esc).join(',')];
    for (const x of r.students) lines.push([`${x.student.firstName} ${x.student.lastName}`, x.student.email, x.attendancePct, x.assignmentsPct, x.quizzesPct, x.totalPct, x.grade, x.completionPct, x.missing, x.atRisk ? 'Yes' : 'No', x.risks.join('; ')].map(esc).join(','));
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv' })), download: `${o.course.code}-performance.csv` });
    a.click(); URL.revokeObjectURL(a.href);
  };

  const graded = r.assessments.filter((a) => a.graded > 0);
  return (
    <div className="space-y-6">
      {/* Course banner */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-gradient-to-r from-navy to-navy-2 px-6 py-5 text-white">
        <div>
          <div className="flex flex-wrap items-center gap-2 text-sm text-white/70"><span className="rounded-md bg-white/15 px-2 py-0.5 font-semibold text-white">{o.course.code}</span>{o.semester.name}{o.section && ` · ${o.section.batch.program.code} ${o.section.name}`} · {o.course.credits} credits</div>
          <h2 className="mt-1.5 text-xl font-bold">{o.course.title}</h2>
          <p className="mt-0.5 text-xs text-white/60">Overall = {o.gradingWeights.assignments}% assignments + {o.gradingWeights.quizzes}% quizzes · pass mark {r.rules.passPct}% · attendance requirement {r.rules.attendanceMin}%</p>
        </div>
        <Link to={`/offerings/${o.id}`} className="rounded-xl bg-white/10 px-4 py-2 text-sm font-semibold ring-1 ring-white/20 hover:bg-white/20">Open course</Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Class average" value={pct(s.average, 1)} hint={`Median ${pct(s.median, 1)} · range ${pct(s.lowest)}–${pct(s.highest)}`} icon={<TrendingUp />} />
        <Stat label="Pass rate" value={pct(s.passRate, 1)} hint={`${s.graded} of ${s.students} students have marks`} icon={<GraduationCap />} tone="accent" />
        <Stat label="Attendance" value={pct(s.attendance, 1)} hint={`${s.belowAttendance} student${s.belowAttendance === 1 ? '' : 's'} below ${r.rules.attendanceMin}%`} icon={<CalendarCheck />} tone="navy" />
        <Stat label="Need attention" value={s.atRisk} hint="Low marks, attendance or engagement" icon={<AlertTriangle />} tone="gold" />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        {([['Assignment submission', s.submissionRate, ClipboardCheck], ['Lesson completion', s.lessonCompletion, Target], ['Quiz accuracy', s.quizAccuracy, Award]] as const).map(([label, v, Icon]) => (
          <div key={label} className="flex items-center gap-4 rounded-2xl border border-line/80 bg-white p-4">
            <span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary"><Icon className="size-5" aria-hidden /></span>
            <div className="min-w-0 flex-1"><div className="text-xs font-medium text-muted">{label}</div><div className="mt-1 h-2 overflow-hidden rounded-full bg-cloud"><div className="h-full rounded-full" style={{ width: `${v ?? 0}%`, background: barColor(v) }} /></div></div>
            <span className={cx('text-lg font-bold tabular-nums', tone(v))}>{pct(v)}</span>
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Grade distribution" subtitle={`On the ${r.rules.passPct}% pass scale`}>
          <BarList items={s.distribution.map((d) => ({ label: d.grade, value: d.n, color: GRADE_COLOR[d.grade] ?? 'var(--color-line)' }))} format={(v) => `${v} student${v === 1 ? '' : 's'}`} />
        </Card>
        <Card title="Attendance by session" subtitle={`${r.attendanceTrend.length} classes held`}>
          <AreaChart data={r.attendanceTrend.map((t) => ({ label: fmtDate(t.date), value: t.pct ?? 0 }))} max={100} format={(v) => `${v}%`} label="Attendance per session" color="var(--color-accent)" every={Math.ceil(r.attendanceTrend.length / 6)} />
        </Card>
      </div>

      <Card title="Assessments" subtitle="How the class did on each assignment and quiz">
        {r.assessments.length ? (
          <Table head={['Assessment', 'Graded', 'Average', 'Highest', 'Lowest', `Below ${r.rules.passPct}%`]} caption="Assessment results">
            {r.assessments.map((a) => (
              <tr key={a.id}>
                <Td><div className="font-medium text-navy">{a.title}</div><div className="text-xs text-muted">{a.kind === 'quiz' ? 'Quiz' : 'Assignment'}{a.dueAt && ` · due ${fmtDate(a.dueAt)}`}</div></Td>
                <Td className="tabular-nums text-muted">{a.graded}/{a.students}</Td>
                <Td><Meter value={a.average} good={60} /></Td>
                <Td className="tabular-nums">{pct(a.highest)}</Td>
                <Td className="tabular-nums">{pct(a.lowest)}</Td>
                <Td>{a.belowPass ? <Badge tone="danger">{a.belowPass}</Badge> : <span className="text-muted">0</span>}</Td>
              </tr>
            ))}
          </Table>
        ) : <p className="text-sm text-muted">No published assessments yet.</p>}
        {graded.length > 0 && <p className="mt-3 text-xs text-muted">Hardest so far: <b className="text-ink">{[...graded].sort((a, b) => (a.average ?? 0) - (b.average ?? 0))[0].title}</b>.</p>}
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Topic mastery" subtitle="Quiz accuracy per topic — weakest first">
          <BarList max={100} format={(v) => `${v}%`} empty="Tag questions with topics to see mastery."
            items={[...r.topics].sort((a, b) => (a.quizAccuracy.value ?? 101) - (b.quizAccuracy.value ?? 101)).map((t) => ({
              label: t.name, value: t.quizAccuracy.value, color: barColor(t.quizAccuracy.value, 75, 60),
              hint: <>({t.quizAccuracy.denominator} answers{t.doubts ? ` · ${t.doubts} doubts` : ''}{t.quizAccuracy.lowData ? ' · low data' : ''})</>,
            }))} />
        </Card>
        <Card title="Most-missed questions" subtitle="Worth re-teaching in class">
          {r.missedQuestions.length ? (
            <ol className="space-y-3">
              {r.missedQuestions.map((m, i) => (
                <li key={m.questionVersionId} className="flex gap-3">
                  <span className="grid size-6 shrink-0 place-items-center rounded-full bg-danger/10 text-xs font-bold text-danger">{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 text-sm text-ink">{m.prompt}</p>
                    <p className="text-xs text-muted">{m.wrong} of {m.total} wrong ({pct(m.wrongRate)}){m.mostCommonWrong && <> · most chose “{m.mostCommonWrong.text}”</>}</p>
                  </div>
                </li>
              ))}
            </ol>
          ) : <p className="text-sm text-muted">No incorrect quiz answers yet.</p>}
        </Card>
      </div>

      {top.length > 0 && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card title="Top performers">
            <ul className="space-y-2">{top.map((x, i) => (
              <li key={x.student.id} className="flex items-center gap-3 text-sm"><span className="w-5 text-center font-bold text-muted">{i + 1}</span><span className="flex-1 font-medium text-navy">{x.student.firstName} {x.student.lastName}</span><GradePill grade={x.grade} /><span className="w-14 text-right font-semibold tabular-nums">{pct(x.totalPct, 1)}</span></li>
            ))}</ul>
          </Card>
          <Card title="Needs attention" subtitle="Each student is listed with the reasons">
            {s.atRisk ? <ul className="space-y-2.5">{r.students.filter((x) => x.atRisk).slice(0, 6).map((x) => (
              <li key={x.student.id} className="text-sm"><span className="font-medium text-navy">{x.student.firstName} {x.student.lastName}</span><span className="block text-xs text-danger">{x.risks.join(' · ')}</span></li>
            ))}</ul> : <p className="text-sm text-muted">No students are currently at risk. 🎉</p>}
          </Card>
        </div>
      )}

      <Card title="Student performance" subtitle={`${r.students.length} students`}
        action={<button onClick={exportCsv} className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-sm font-medium text-ink hover:bg-cloud"><Download className="size-4" aria-hidden />Export CSV</button>}>
        <Tabs value={view} onChange={setView} tabs={[{ id: 'all', label: 'All', badge: r.students.length }, { id: 'risk', label: 'At risk', badge: s.atRisk }, { id: 'top', label: 'Top 5' }]} />
        <div className="-mt-2 mb-4 flex justify-end">
          <label className="relative w-full sm:w-64">
            <span className="sr-only">Search students</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
            <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search students" className="w-full rounded-lg border border-line py-2 pl-9 pr-3 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20" />
          </label>
        </div>
        {rows.length ? (
          <Table head={[<Th by="name">Student</Th>, <Th by="attendancePct">Attendance</Th>, 'Assignments', 'Quizzes', <Th by="totalPct">Overall</Th>, 'Grade', <Th by="completionPct">Lessons</Th>, 'Status']} caption="Student performance">
            {rows.map((x) => (
              <tr key={x.student.id} className={cx(x.atRisk && 'bg-danger/[.03]')}>
                <Td><div className="font-medium text-navy">{x.student.firstName} {x.student.lastName}</div><div className="text-xs text-muted">{x.lastActivity ? `Active ${fromNow(x.lastActivity)}` : 'No activity yet'}</div></Td>
                <Td><Meter value={x.attendancePct} good={r.rules.attendanceMin} ok={60} /></Td>
                <Td className="tabular-nums">{pct(x.assignmentsPct)}{x.missing > 0 && <div className="text-[11px] text-danger">{x.missing} missing</div>}</Td>
                <Td className="tabular-nums">{pct(x.quizzesPct)}</Td>
                <Td><Meter value={x.totalPct} good={60} ok={r.rules.passPct} /></Td>
                <Td><GradePill grade={x.grade} /></Td>
                <Td className="tabular-nums text-muted">{pct(x.completionPct)}</Td>
                <Td className="max-w-56">{x.atRisk
                  ? <><Badge tone="danger"><AlertTriangle className="size-3" aria-hidden />At risk</Badge><div className="mt-1 text-[11px] leading-snug text-muted">{x.risks.join(' · ')}</div></>
                  : <Badge tone="success">On track</Badge>}</Td>
              </tr>
            ))}
          </Table>
        ) : <EmptyState icon={<Users className="size-6" />} title="No students match" />}
      </Card>
    </div>
  );
}
