import { Link } from 'react-router-dom';
import { ArrowRight, CheckCircle2, Info, Target, TrendingDown, TrendingUp } from 'lucide-react';
import { useGet } from '../../lib/hooks';
import { useBranding, featureOn, type Branding } from '../../lib/branding';
import { pct } from '../../lib/format';
import { Badge, Card, EmptyState, PageHeader, QueryView, Stat } from '../../components/ui';

type Level = 'NEEDS_WORK' | 'DEVELOPING' | 'STRONG' | 'NOT_ENOUGH_DATA';
type Action = { text: string; to?: string; feature?: string };
type Mastery = { level: Level; accuracy: number | null; total: number; correct: number; wrong: number; trend: number | null };
type Topic = Mastery & { topicId: string; name: string; sections: string[]; summary: string; actions: Action[] };
type Section = Mastery & { sectionId: string; title: string; completionPct: number | null; lessonsLeft: number };
type Course = Mastery & { offeringId: string; course: { code: string; title: string }; completionPct: number | null; missingAssignments: number; sections: Section[]; topics: Topic[]; actions: Action[] };
export type Path = { overall: Mastery; courses: Course[]; focus: (Topic & { offeringId: string; course: { code: string } })[]; rules: { weakBelow: number; strongAt: number; minAnswers: number; trendDays: number } };

const LEVEL: Record<Level, { label: string; tone: 'danger' | 'warning' | 'success' | 'neutral'; bar: string }> = {
  NEEDS_WORK: { label: 'Needs work', tone: 'danger', bar: 'var(--color-danger)' },
  DEVELOPING: { label: 'Developing', tone: 'warning', bar: 'var(--color-gold)' },
  STRONG: { label: 'Strong', tone: 'success', bar: 'var(--color-accent)' },
  NOT_ENOUGH_DATA: { label: 'Not enough data', tone: 'neutral', bar: 'var(--color-line)' },
};

export const LevelBadge = ({ level }: { level: Level }) => <Badge tone={LEVEL[level].tone}>{LEVEL[level].label}</Badge>;

export function Trend({ value }: { value: number | null }) {
  if (value === null || Math.abs(value) < 5) return null;
  const up = value > 0;
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-semibold ${up ? 'text-success' : 'text-danger'}`} title="Change in accuracy over the last 2 weeks vs before">
      {up ? <TrendingUp className="size-3.5" aria-hidden /> : <TrendingDown className="size-3.5" aria-hidden />}{up ? '+' : '−'}{Math.abs(value)} pts
    </span>
  );
}

function Bar({ value, level, label }: { value: number | null; level: Level; label: string }) {
  return (
    <div className="flex items-center gap-2" role="img" aria-label={`${label}: ${pct(value)}`}>
      <div className="h-2 w-full min-w-16 overflow-hidden rounded-full bg-cloud"><div className="h-full rounded-full" style={{ width: `${value ?? 0}%`, background: LEVEL[level].bar }} /></div>
      <span className="w-10 shrink-0 text-right text-xs font-semibold tabular-nums text-navy">{pct(value)}</span>
    </div>
  );
}

export const visibleActions = (b: Branding, xs: Action[]) => xs.filter((a) => !a.feature || featureOn(b, a.feature));

export function Actions({ items }: { items: Action[] }) {
  const b = useBranding();
  const xs = visibleActions(b, items);
  if (!xs.length) return null;
  return (
    <ul className="mt-2 space-y-1.5">
      {xs.map((a) => (
        <li key={a.text}>
          {a.to ? (
            <Link to={a.to} className="group inline-flex items-start gap-1.5 text-sm text-primary hover:underline"><ArrowRight className="mt-0.5 size-3.5 shrink-0 transition group-hover:translate-x-0.5" aria-hidden />{a.text}</Link>
          ) : <span className="inline-flex items-start gap-1.5 text-sm text-ink"><ArrowRight className="mt-0.5 size-3.5 shrink-0" aria-hidden />{a.text}</span>}
        </li>
      ))}
    </ul>
  );
}

export default function LearningPath() {
  const q = useGet<Path>('/learning-path');
  return (
    <>
      <PageHeader title="My learning path" subtitle="Where you're strong, where you need work — by course, section and topic — and exactly what to do next." />
      <QueryView q={q} isEmpty={(d) => !d.courses.length} empty={<EmptyState title="No courses yet" body="Your learning path appears once you're enrolled in a course." />}>
        {(d) => {
          const all = d.courses.flatMap((c) => c.topics);
          const weak = all.filter((t) => t.level === 'NEEDS_WORK').length;
          const improving = all.filter((t) => (t.trend ?? 0) >= 10).length;
          return (
            <>
              <div className="mb-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <Stat label="Overall accuracy" value={pct(d.overall.accuracy)} hint={`${d.overall.correct} of ${d.overall.total} answers correct`} icon={<Target />} />
                <Stat label="Topics needing work" value={weak} hint={`out of ${all.length} topics`} icon={<TrendingDown />} tone="gold" />
                <Stat label="Topics improving" value={improving} hint={`up 10+ points in the last ${d.rules.trendDays} days`} icon={<TrendingUp />} tone="accent" />
                <Stat label="Strong topics" value={all.filter((t) => t.level === 'STRONG').length} hint={`${d.rules.strongAt}% or more correct`} icon={<CheckCircle2 />} tone="navy" />
              </div>

              <Card title="Focus this week" subtitle="Your weakest topics across all courses, with what to do about each" className="mb-6">
                {d.focus.length === 0 ? (
                  <EmptyState icon={<CheckCircle2 className="size-6" />} title="No weak topics right now" body="Keep attempting quizzes and daily revision — new weak spots will show up here." />
                ) : (
                  <ol className="divide-y divide-line/70">
                    {d.focus.map((t, i) => (
                      <li key={t.topicId} className="flex gap-4 py-4 first:pt-0 last:pb-0">
                        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary/10 text-sm font-bold text-primary">{i + 1}</span>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold text-navy">{t.name}</span><LevelBadge level={t.level} /><Trend value={t.trend} />
                          </div>
                          <div className="mt-0.5 text-xs text-muted">{t.course.code}{t.sections.length ? ` · Section: ${t.sections.join(', ')}` : ''}</div>
                          <p className="mt-1.5 text-sm text-ink">{t.summary}</p>
                          <Actions items={t.actions} />
                        </div>
                      </li>
                    ))}
                  </ol>
                )}
              </Card>

              <div className="space-y-6">
                {d.courses.map((c) => <CourseCard key={c.offeringId} c={c} />)}
              </div>

              <p className="mt-6 flex gap-2 text-xs text-muted">
                <Info className="size-4 shrink-0" aria-hidden />
                Based on your graded quiz answers (once results are published) and daily revision answers. Under {d.rules.weakBelow}% correct is "Needs work", {d.rules.strongAt}%+ is "Strong", and at least {d.rules.minAnswers} answers are needed before we judge a topic. Trends compare the last {d.rules.trendDays} days with earlier.
              </p>
            </>
          );
        }}
      </QueryView>
    </>
  );
}

function CourseCard({ c }: { c: Course }) {
  const ranked = c.topics.filter((t) => t.level !== 'STRONG');
  const strong = c.topics.filter((t) => t.level === 'STRONG');
  return (
    <Card
      title={<span className="flex flex-wrap items-center gap-2"><span className="text-primary">{c.course.code}</span> {c.course.title} <LevelBadge level={c.level} /><Trend value={c.trend} /></span>}
      subtitle={`${pct(c.accuracy)} correct (${c.correct}/${c.total} answers) · ${pct(c.completionPct)} of required lessons done${c.missingAssignments ? ` · ${c.missingAssignments} overdue assignment(s)` : ''}`}
      action={<Link to={`/offerings/${c.offeringId}`} className="shrink-0 text-sm font-medium text-primary">Open course</Link>}>
      {c.actions.length > 0 && (
        <div className="mb-5 rounded-xl bg-primary/5 p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-primary">How to improve in this course</div>
          <Actions items={c.actions} />
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          <h3 className="mb-2 text-sm font-semibold text-navy">By section</h3>
          {c.sections.length === 0 ? <p className="text-sm text-muted">No lessons published yet.</p> : (
            <ul className="space-y-3">
              {c.sections.map((s) => (
                <li key={s.sectionId} className="rounded-xl border border-line/70 p-3">
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium text-ink">{s.title}</span><LevelBadge level={s.level} />
                  </div>
                  <Bar value={s.accuracy} level={s.level} label={`${s.title} accuracy`} />
                  <div className="mt-1 text-xs text-muted">{s.total ? `${s.correct}/${s.total} correct` : 'No answers yet'} · {pct(s.completionPct)} lessons done{s.lessonsLeft ? ` (${s.lessonsLeft} left)` : ''}</div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <h3 className="mb-2 text-sm font-semibold text-navy">By topic</h3>
          {c.topics.length === 0 ? <p className="text-sm text-muted">Your faculty hasn't tagged topics for this course yet.</p> : (
            <ul className="space-y-2">
              {ranked.map((t) => (
                <li key={t.topicId}>
                  <details className="group rounded-xl border border-line/70 p-3 open:bg-cloud/50" open={t.level === 'NEEDS_WORK'}>
                    <summary className="flex cursor-pointer list-none items-center gap-2">
                      <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">{t.name}</span>
                      <Trend value={t.trend} /><LevelBadge level={t.level} />
                    </summary>
                    <div className="mt-2">
                      <Bar value={t.accuracy} level={t.level} label={`${t.name} accuracy`} />
                      {t.sections.length > 0 && <div className="mt-1 text-xs text-muted">Section: {t.sections.join(', ')}</div>}
                      <p className="mt-1.5 text-sm text-ink">{t.summary}</p>
                      <Actions items={t.actions} />
                    </div>
                  </details>
                </li>
              ))}
              {strong.length > 0 && (
                <li className="flex flex-wrap items-center gap-1.5 pt-1 text-xs text-muted">
                  <CheckCircle2 className="size-4 text-success" aria-hidden />Strong: {strong.map((t) => <Badge key={t.topicId} tone="success">{t.name} · {pct(t.accuracy)}</Badge>)}
                </li>
              )}
            </ul>
          )}
        </div>
      </div>
    </Card>
  );
}
