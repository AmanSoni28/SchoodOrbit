// One student's performance report — rendered for the student themself and (scope-limited) for their parents.
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, CalendarCheck, CheckCircle2, ChevronDown, ClipboardList, Info, Lock, Target, TrendingUp } from 'lucide-react';
import { fmtDate } from '../lib/format';
import { Badge, Card, EmptyState, Stat, cx } from './ui';
import { AreaChart } from './charts';
import { GradePill } from '../pages/student/Results';

type Item = { id: string; kind: 'assignment' | 'quiz'; title: string; date: string | null; earned: number; max: number; pct: number; classAvg: number | null; late: boolean };
type Course = {
  offeringId: string; status: string; course: { code: string; title: string; credits: number }; semester: { id: string; name: string; startDate: string }; instructors: string[];
  marks?: { totalPct: number | null; grade: string | null; assignmentsPct: number | null; quizzesPct: number | null; classAverage: number | null; items: Item[] };
  attendance?: { percent: number | null; attended: number; marked: number; sessions: number; recent: { date: string; status: string }[] };
  progress?: { completionPct: number | null; completed: number; required: number; missing: number; upcoming: { id: string; title: string; dueAt: string; submitted: boolean }[] };
  topics?: { name: string; accuracy: number | null; level: string; total: number }[];
  risks: string[]; atRisk: boolean;
};
export type Report = {
  student: { id: string; firstName: string; lastName: string };
  scopes: { grades: boolean; attendance: boolean; progress: boolean };
  rules: { attendanceMin: number };
  summary: { courses: number; overall?: number | null; classAverage?: number | null; attendance?: number | null; completion?: number | null; missing?: number; atRisk: number };
  insights: { tone: 'good' | 'warn' | 'bad'; text: string }[];
  trend: (Item & { course: string })[];
  courses: Course[];
};

const pct = (v: number | null | undefined) => (v === null || v === undefined ? '—' : `${+v.toFixed(1)}%`);
const color = (v: number | null | undefined, good = 75, ok = 50) => (v == null ? 'var(--color-line)' : v >= good ? 'var(--color-accent)' : v >= ok ? 'var(--color-gold)' : 'var(--color-danger)');
const ATT: Record<string, { cls: string; label: string }> = {
  PRESENT: { cls: 'bg-accent', label: 'Present' }, LATE: { cls: 'bg-gold', label: 'Late' }, ABSENT: { cls: 'bg-danger', label: 'Absent' }, EXCUSED: { cls: 'bg-line', label: 'Excused' },
};
const TOPIC: Record<string, { tone: 'danger' | 'warning' | 'success' | 'neutral'; label: string }> = {
  NEEDS_WORK: { tone: 'danger', label: 'Needs work' }, DEVELOPING: { tone: 'warning', label: 'Developing' }, STRONG: { tone: 'success', label: 'Strong' }, NOT_ENOUGH_DATA: { tone: 'neutral', label: 'Not enough data' },
};
const NotShared = () => <span className="inline-flex items-center gap-1 text-base font-medium text-muted"><Lock className="size-4" aria-hidden />Not shared</span>;

/** Two bars: this student vs. the class. */
function VsClass({ me, cls, who }: { me: number | null; cls: number | null; who: string }) {
  return (
    <div className="space-y-1.5">
      {[[who, me, color(me, 60, 40)], ['Class average', cls, 'var(--color-navy-2)']].map(([label, v, c]) => (
        <div key={label as string} className="flex items-center gap-2 text-xs">
          <span className="w-24 shrink-0 truncate text-muted">{label}</span>
          <span className="h-2 flex-1 overflow-hidden rounded-full bg-cloud"><span className="block h-full rounded-full transition-[width] duration-700" style={{ width: `${v ?? 0}%`, background: c as string, opacity: label === who ? 1 : 0.35 }} /></span>
          <span className="w-12 text-right font-semibold tabular-nums">{pct(v as number | null)}</span>
        </div>
      ))}
    </div>
  );
}

function CourseCard({ c, who, attendanceMin }: { c: Course; who: string; attendanceMin: number }) {
  const m = c.marks, a = c.attendance, p = c.progress;
  return (
    <section className={cx('flex flex-col rounded-2xl border bg-white shadow-[0_1px_3px_rgba(16,27,58,0.05)]', c.atRisk ? 'border-danger/30' : 'border-line/80')} aria-label={`${c.course.code} ${c.course.title}`}>
      <div className="flex items-start justify-between gap-3 border-b border-line/60 p-5">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs"><span className="rounded-md bg-navy px-1.5 py-0.5 font-bold text-white">{c.course.code}</span><span className="text-muted">{c.course.credits} credits</span>{c.atRisk && <Badge tone="danger"><AlertTriangle className="size-3" aria-hidden />Needs attention</Badge>}</div>
          <h3 className="mt-1.5 truncate font-semibold text-navy">{c.course.title}</h3>
          <p className="truncate text-xs text-muted">{c.instructors.join(', ') || '—'}</p>
        </div>
        {m && <div className="shrink-0 text-right"><div className="text-2xl font-bold tabular-nums text-navy">{pct(m.totalPct)}</div><GradePill grade={m.grade} /></div>}
      </div>

      <div className="grid flex-1 gap-4 p-5">
        {m ? (
          <div>
            <VsClass me={m.totalPct} cls={m.classAverage} who={who} />
            <div className="mt-2 flex gap-4 text-xs text-muted"><span>Assignments <b className="text-ink">{pct(m.assignmentsPct)}</b></span><span>Quizzes <b className="text-ink">{pct(m.quizzesPct)}</b></span></div>
          </div>
        ) : <p className="text-xs text-muted"><Lock className="mr-1 inline size-3" aria-hidden />Marks not shared</p>}

        {a && (
          <div>
            <div className="mb-1.5 flex items-baseline justify-between text-xs"><span className="font-medium text-ink">Attendance</span><span className={cx('font-semibold tabular-nums', a.percent !== null && a.percent < attendanceMin ? 'text-danger' : 'text-ink')}>{pct(a.percent)} <span className="font-normal text-muted">({a.attended}/{a.marked})</span></span></div>
            <div className="flex gap-1" aria-label={`Last ${a.recent.length} classes`}>
              {a.recent.map((r, i) => <span key={i} title={`${fmtDate(r.date)} · ${ATT[r.status]?.label}`} className={cx('h-5 flex-1 rounded', ATT[r.status]?.cls ?? 'bg-line')} />)}
              {!a.recent.length && <span className="text-xs text-muted">No classes marked yet</span>}
            </div>
          </div>
        )}

        {p && (
          <div>
            <div className="mb-1.5 flex items-baseline justify-between text-xs"><span className="font-medium text-ink">Lessons completed</span><span className="font-semibold tabular-nums">{p.required ? `${p.completed}/${p.required}` : '—'}</span></div>
            <div className="h-2 overflow-hidden rounded-full bg-cloud"><div className="h-full rounded-full" style={{ width: `${p.completionPct ?? 0}%`, background: color(p.completionPct) }} /></div>
            {p.missing > 0 && <p className="mt-2 text-xs font-medium text-danger">{p.missing} overdue assignment{p.missing > 1 ? 's' : ''} not submitted</p>}
          </div>
        )}

        {c.risks.length > 0 && <ul className="space-y-1 rounded-xl bg-danger/[.05] p-3 text-xs text-danger">{c.risks.map((r) => <li key={r} className="flex gap-1.5"><AlertTriangle className="mt-0.5 size-3 shrink-0" aria-hidden />{r}</li>)}</ul>}
      </div>

      {(m?.items.length || c.topics?.length || p?.upcoming.length) ? (
        <details className="group border-t border-line/60">
          <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-3 text-sm font-medium text-primary hover:bg-cloud/60">Details<ChevronDown className="size-4 transition group-open:rotate-180" aria-hidden /></summary>
          <div className="space-y-5 px-5 pb-5">
            {m && m.items.length > 0 && (
              <div>
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">Assessments</h4>
                <ul className="divide-y divide-line/60 text-sm">
                  {m.items.map((i) => (
                    <li key={i.id} className="flex items-center gap-3 py-2">
                      <span className="min-w-0 flex-1"><span className="block truncate">{i.title}</span><span className="text-xs text-muted">{i.kind === 'quiz' ? 'Quiz' : 'Assignment'}{i.date && ` · ${fmtDate(i.date)}`}{i.late && ' · late'}</span></span>
                      <span className="text-right"><span className="block font-semibold tabular-nums">{+i.earned.toFixed(1)}/{i.max}</span><span className="text-[11px] text-muted">{i.classAvg !== null ? `class ${pct(i.classAvg)}` : ''}</span></span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {c.topics && c.topics.length > 0 && (
              <div>
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">Topics</h4>
                <div className="flex flex-wrap gap-1.5">{c.topics.map((t) => <Badge key={t.name} tone={TOPIC[t.level]?.tone ?? 'neutral'}>{t.name}{t.accuracy !== null && ` · ${t.accuracy}%`}</Badge>)}</div>
              </div>
            )}
            {p && p.upcoming.length > 0 && (
              <div>
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">Coming up</h4>
                <ul className="space-y-1 text-sm">{p.upcoming.map((u) => <li key={u.id} className="flex justify-between gap-2"><span className="truncate">{u.title}</span><span className="shrink-0 text-xs text-muted">{u.submitted ? <span className="text-success">Submitted</span> : `due ${fmtDate(u.dueAt)}`}</span></li>)}</ul>
              </div>
            )}
          </div>
        </details>
      ) : null}
    </section>
  );
}

export function StudentReport({ r, viewer }: { r: Report; viewer: 'student' | 'parent' }) {
  const who = viewer === 'student' ? 'You' : r.student.firstName;
  const semesters = useMemo(() => {
    const m = new Map<string, { id: string; name: string; start: string; live: boolean }>();
    for (const c of r.courses) if (!m.has(c.semester.id)) m.set(c.semester.id, { id: c.semester.id, name: c.semester.name, start: c.semester.startDate, live: c.status === 'PUBLISHED' });
    return [...m.values()].sort((a, b) => b.start.localeCompare(a.start));
  }, [r.courses]);
  const [sem, setSem] = useState(semesters[0]?.id);
  const shown = r.courses.filter((c) => c.semester.id === sem);
  const s = r.summary;
  const att = r.rules.attendanceMin;

  if (!r.courses.length) return <EmptyState icon={<TrendingUp className="size-6" />} title="No courses yet" body="Performance appears once enrolled courses have activity." />;
  return (
    <div className="space-y-6">
      {viewer === 'parent' && (!r.scopes.grades || !r.scopes.attendance || !r.scopes.progress) && (
        <p className="flex items-start gap-2 rounded-xl border border-line bg-white px-4 py-3 text-sm text-muted"><Info className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
          {r.student.firstName} has shared {[r.scopes.grades && 'marks', r.scopes.attendance && 'attendance', r.scopes.progress && 'progress'].filter(Boolean).join(' and ')} with you. Other sections stay private unless they choose to share them.</p>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Overall score" value={s.overall === undefined ? <NotShared /> : pct(s.overall)} icon={<TrendingUp />} hint={s.overall !== undefined && s.classAverage != null ? `Class average ${pct(s.classAverage)} · current semester` : 'Current semester, published marks'} />
        <Stat label="Attendance" value={s.attendance === undefined ? <NotShared /> : pct(s.attendance)} icon={<CalendarCheck />} tone="accent" hint={`College requirement ${att}%`} />
        <Stat label="Lessons completed" value={s.completion === undefined ? <NotShared /> : pct(s.completion)} icon={<Target />} tone="navy" hint="Required lessons, current courses" />
        <Stat label="Overdue work" value={s.missing === undefined ? <NotShared /> : s.missing} icon={<ClipboardList />} tone="gold" hint={s.missing ? 'Assignments past due, not submitted' : 'All caught up'} />
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <Card title="Highlights" subtitle="What stands out right now" className="lg:col-span-2">
          {r.insights.length ? (
            <ul className="space-y-3">
              {r.insights.map((i) => {
                const Icon = i.tone === 'good' ? CheckCircle2 : AlertTriangle;
                return <li key={i.text} className="flex gap-2.5 text-sm"><Icon className={cx('mt-0.5 size-4 shrink-0', i.tone === 'good' ? 'text-success' : i.tone === 'warn' ? 'text-[#c58a1c]' : 'text-danger')} aria-hidden /><span>{i.text}</span></li>;
              })}
            </ul>
          ) : <p className="text-sm text-muted">Nothing to flag yet.</p>}
        </Card>
        <Card title="Score trend" subtitle="Every published assessment this semester, in date order" className="lg:col-span-3">
          {r.scopes.grades
            ? <AreaChart data={r.trend.map((t) => ({ label: `${t.course} · ${t.title}`, value: t.pct }))} max={100} format={(v) => `${v}%`} label="Score per assessment" every={Math.max(1, Math.ceil(r.trend.length / 5))} />
            : <p className="py-8 text-center text-sm text-muted"><Lock className="mr-1 inline size-4" aria-hidden />Marks have not been shared.</p>}
        </Card>
      </div>

      <div>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-navy">Courses</h2>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Semester">
            {semesters.map((x) => (
              <button key={x.id} onClick={() => setSem(x.id)} aria-pressed={sem === x.id}
                className={cx('rounded-full border px-3 py-1 text-sm font-medium transition', sem === x.id ? 'border-primary bg-primary text-white' : 'border-line bg-white text-ink hover:bg-cloud')}>
                {x.name}{x.live && ' · current'}
              </button>
            ))}
          </div>
        </div>
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">{shown.map((c) => <CourseCard key={c.offeringId} c={c} who={who} attendanceMin={att} />)}</div>
        <p className="mt-4 text-xs text-muted">Only marks released by faculty are included. Class averages are shown when at least 5 students have been graded.
          {viewer === 'student' && <> Official grades and SGPA are on the <Link to="/results" className="font-medium text-primary hover:underline">Results</Link> page.</>}</p>
      </div>
    </div>
  );
}
