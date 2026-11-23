import { Award, BookOpenCheck, GraduationCap, Printer, Trophy } from 'lucide-react';
import { useGet } from '../../lib/hooks';
import { useAuth } from '../../lib/auth';
import { useBranding } from '../../lib/branding';
import { fmtDate } from '../../lib/format';
import { Button, Card, EmptyState, Hero, HeroChip, QueryView, Stat, StatusBadge, Table, Td, cx } from '../../components/ui';
import { AreaChart, BarList, Ring } from '../../components/charts';

/** Colour per letter grade, shared by the admin result view. */
export const GRADE_COLOR: Record<string, string> = { O: '#0a8a80', 'A+': 'var(--color-accent)', A: 'var(--color-primary)', 'B+': '#6f8bff', B: '#8b5cf6', C: 'var(--color-gold)', F: 'var(--color-danger)' };
export const GradePill = ({ grade }: { grade: string | null }) => grade
  ? <span className="inline-grid min-w-9 place-items-center rounded-lg px-2 py-1 text-xs font-bold text-white" style={{ background: GRADE_COLOR[grade] }}>{grade}</span>
  : <span className="text-xs text-muted">—</span>;

export default function Results() {
  const { me } = useAuth();
  return <Transcript url="/results/me" name={me ? `${me.firstName} ${me.lastName}` : ''} />;
}

/** Published results + CGPA for one student. Used by the student page and the parent portal. */
export function Transcript({ url, name, compact }: { url: string; name: string; compact?: boolean }) {
  const q = useGet<any>(url);
  const b = useBranding();
  return (
    <QueryView q={q}>
      {(d) => {
        const sems = d.semesters as any[];
        const latest = sems[sems.length - 1];
        const credits = sems.reduce((a, s) => a + s.creditsEarned, 0);
        const courses = sems.flatMap((s) => s.courses);
        const best = [...courses].filter((c) => c.pct !== null).sort((a, z) => z.pct - a.pct)[0];
        if (sems.length === 0) return <EmptyState icon={<GraduationCap className="size-6" />} title="No results published yet" body="Semester results appear here once your college publishes them." />;
        return (
          <>
            {!compact && (
              <Hero eyebrow="Academics" title="My results" subtitle={`Official semester results published by ${b.name}.`}
                aside={<div className="flex items-center gap-4 rounded-2xl bg-white/10 p-4 ring-1 ring-white/15 backdrop-blur"><Ring value={d.cgpa === null ? null : d.cgpa * 10} size={96} label="CGPA out of 10"><span className="text-center"><span className="block text-2xl font-bold text-white">{d.cgpa?.toFixed(2) ?? '—'}</span><span className="text-[10px] text-white/70">CGPA / 10</span></span></Ring><div className="text-sm"><div className="font-semibold">Cumulative GPA</div><div className="text-white/65">{sems.length} semester{sems.length === 1 ? '' : 's'} · {credits} credits</div></div></div>}>
                <HeroChip icon={<Trophy />}>Latest SGPA {latest.sgpa?.toFixed(2) ?? '—'}</HeroChip>
                <HeroChip icon={<BookOpenCheck />}>{credits} credits earned</HeroChip>
              </Hero>
            )}
            {!compact && (
              <div className="mb-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <Stat label="CGPA" value={d.cgpa?.toFixed(2) ?? '—'} hint="credit-weighted, 10-point scale" icon={<GraduationCap />} />
                <Stat label="Latest SGPA" value={latest.sgpa?.toFixed(2) ?? '—'} hint={`${latest.year} · ${latest.name}`} icon={<Trophy />} tone="accent" />
                <Stat label="Credits earned" value={credits} hint={`${courses.length} courses`} icon={<BookOpenCheck />} tone="gold" />
                <Stat label="Best course" value={best ? best.grade : '—'} hint={best ? `${best.code} · ${best.pct}%` : undefined} icon={<Award />} tone="navy" />
              </div>
            )}
            <div className={cx('mb-6 grid gap-6', !compact && 'lg:grid-cols-3')}>
              {sems.length > 1 && (
                <Card title="SGPA trend" subtitle="Semester GPA over time" className={compact ? '' : 'lg:col-span-2'}>
                  <AreaChart label="SGPA trend" max={10} color="var(--color-primary)" format={(v) => v.toFixed(1)} data={sems.map((s) => ({ label: s.name, value: s.sgpa ?? 0 }))} />
                </Card>
              )}
              {!compact && (
                <Card title="Grade scale" className={sems.length > 1 ? '' : 'lg:col-span-3'}>
                  <ul className={cx('grid gap-2', sems.length > 1 ? 'grid-cols-1' : 'grid-cols-2 sm:grid-cols-4 lg:grid-cols-7')}>
                    {d.scale.map((g: any) => <li key={g.grade} className="flex items-center gap-2.5 text-sm"><GradePill grade={g.grade} /><span className="text-muted">≥ {g.min}%</span><span className="ml-auto font-semibold text-navy">{g.points} pts</span></li>)}
                  </ul>
                </Card>
              )}
            </div>
            <div className="print-area space-y-6">
              {[...sems].reverse().map((s) => (
                <section key={s.semesterId} className="overflow-hidden rounded-2xl border border-line/80 bg-white shadow-[0_1px_3px_rgba(16,27,58,0.05)]">
                  <div className="flex flex-wrap items-center justify-between gap-4 border-b border-line/70 bg-gradient-to-r from-cloud to-white p-5">
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-wider text-primary">{s.year}</div>
                      <h2 className="text-lg font-bold text-navy">{s.name}</h2>
                      <div className="text-xs text-muted">{name} · published {fmtDate(s.publishedAt)}</div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right"><div className="text-[11px] text-muted">SGPA</div><div className="text-2xl font-bold text-navy">{s.sgpa?.toFixed(2) ?? '—'}</div></div>
                      <div className="text-right"><div className="text-[11px] text-muted">Credits</div><div className="text-2xl font-bold text-navy">{s.creditsEarned}<span className="text-sm text-muted">/{s.credits}</span></div></div>
                      <StatusBadge status={s.status} />
                    </div>
                  </div>
                  <div className="grid gap-6 p-5 lg:grid-cols-5">
                    <div className="lg:col-span-3">
                      <Table head={['Course', 'Credits', 'Score', 'Grade', 'Points']}>
                        {s.courses.map((c: any) => (
                          <tr key={c.offeringId}>
                            <Td><div className="text-xs font-semibold text-muted">{c.code}</div><div className="font-medium">{c.title}</div></Td>
                            <Td className="tabular-nums">{c.credits}</Td>
                            <Td className="tabular-nums">{c.pct === null ? '—' : `${c.pct}%`}</Td>
                            <Td><GradePill grade={c.grade} /></Td>
                            <Td className="font-semibold tabular-nums">{c.points ?? '—'}</Td>
                          </tr>
                        ))}
                      </Table>
                    </div>
                    <div className="lg:col-span-2">
                      <div className="mb-3 text-sm font-semibold text-navy">Score by course</div>
                      <BarList max={100} format={(v) => `${v}%`} items={s.courses.map((c: any) => ({ label: c.code, value: c.pct === null ? null : Math.round(c.pct), color: c.grade ? GRADE_COLOR[c.grade] : undefined }))} />
                    </div>
                  </div>
                </section>
              ))}
            </div>
            {!compact && <div className="no-print mt-6 flex justify-end"><Button variant="secondary" onClick={() => window.print()}><Printer className="size-4" aria-hidden />Print results</Button></div>}
          </>
        );
      }}
    </QueryView>
  );
}
