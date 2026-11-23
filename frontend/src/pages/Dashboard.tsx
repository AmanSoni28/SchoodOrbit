import { lazy, Suspense, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  AlarmClock, ArrowRight, Award, BookOpen, Bot, Building2, CalendarCheck, CalendarDays, CheckCircle2, ClipboardCheck, ClipboardList, Database, FileText, Flame,
  GraduationCap, HelpCircle, Layers, Megaphone, Server, Sparkles, UserPlus, Users, Video,
} from 'lucide-react';
import { get } from '../lib/api';
import { useAuth, ROLE_LABEL, type Role } from '../lib/auth';
import { useBranding, featureOn } from '../lib/branding';
import { fmtDateTime, fromNow, pct } from '../lib/format';
import { Badge, Card, EmptyState, Hero, HeroChip, LoadingBlock, QueryView, Stat, StatusBadge, Table, Td } from '../components/ui';
import { AreaChart, BarList, Columns, Donut, Heatmap, Kpi, PALETTE, Ring, Sparkline, StackedBar } from '../components/charts';

const ParentHome = lazy(() => import('./parent/ParentHome'));

export default function Dashboard() {
  const { role } = useAuth();
  if (role === 'STUDENT') return <StudentDashboard />;
  if (role === 'FACULTY') return <FacultyDashboard />;
  if (role === 'COLLEGE_ADMIN') return <AdminDashboard />;
  if (role === 'SUPER_ADMIN') return <SuperAdminDashboard />;
  if (role === 'PARENT') return <Suspense fallback={<LoadingBlock />}><ParentHome /></Suspense>;
  return <LoadingBlock />;
}

// ── shared bits ──
const greeting = () => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'; };
const today = () => new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
const short = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
const avg = (xs: (number | null | undefined)[]) => { const v = xs.filter((x): x is number => typeof x === 'number'); return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null; };
const sum = (o: Record<string, number> | undefined, ...keys: string[]) => keys.reduce((a, k) => a + (o?.[k] ?? 0), 0);
const tone = (v: number | null | undefined, good = 70, ok = 50) => (v === null || v === undefined ? 'var(--color-line)' : v >= good ? 'var(--color-accent)' : v >= ok ? 'var(--color-gold)' : 'var(--color-danger)');
const Grid = ({ cols = 3, children }: { cols?: 2 | 3; children: ReactNode }) => <div className={`mb-6 grid gap-6 ${cols === 3 ? 'lg:grid-cols-3' : 'lg:grid-cols-2'}`}>{children}</div>;
const StatRow = ({ children }: { children: ReactNode }) => <div className="mb-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{children}</div>;
const ViewAll = ({ to, children = 'View all' }: { to: string; children?: string }) => (
  <Link to={to} className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-primary transition-all hover:gap-1.5">{children}<ArrowRight className="size-3.5" aria-hidden /></Link>
);
const histogram = (grades: { range: string; n: number }[]) => (
  <Columns label="Score distribution" series={[{ name: 'Graded items', color: 'var(--color-primary)' }]} data={grades.map((g) => ({ label: g.range.split('–')[0], values: [g.n] }))} height={170} />
);
const MiniBar = ({ value, label }: { value: number | null; label: string }) => (
  <div className="flex items-center gap-2" aria-label={`${label}: ${pct(value)}`}>
    <div className="h-2 w-20 overflow-hidden rounded-full bg-cloud"><div className="h-full rounded-full" style={{ width: `${value ?? 0}%`, background: tone(value) }} /></div>
    <span className="w-9 text-xs font-semibold tabular-nums text-navy">{pct(value)}</span>
  </div>
);

// ── Student ──
function StudentDashboard() {
  const { me } = useAuth();
  const b = useBranding();
  const q = useQuery({ queryKey: ['dash', 'student'], queryFn: () => get('/dashboard/student') });
  const rev = useQuery({ queryKey: ['revision', 'today'], queryFn: () => get('/revision/today'), enabled: featureOn(b, 'dailyRevision') });
  return (
    <QueryView q={q}>
      {(d: any) => {
        const overall = avg(d.courses.map((c: any) => c.percent));
        const attendance = avg(d.attendance.map((a: any) => a.percent));
        const pending = d.upcoming.filter((u: any) => !u.done).length;
        const gradeAvg = avg(d.gradeTrend.map((g: any) => g.pct));
        return (
          <>
            <Hero eyebrow={greeting()} title={`Welcome back, ${me?.firstName} 👋`} subtitle={`${today()} · Here's how your learning is going.`}
              aside={<div className="flex items-center gap-4 rounded-2xl bg-white/10 p-4 ring-1 ring-white/15 backdrop-blur"><Ring value={overall} size={92} label="Overall completion"><span className="text-lg font-bold text-white">{pct(overall)}</span></Ring><div className="text-sm"><div className="font-semibold">Overall progress</div><div className="text-white/65">across {d.courses.length} course{d.courses.length === 1 ? '' : 's'}</div></div></div>}>
              <HeroChip icon={<AlarmClock />}>{pending} due soon</HeroChip>
              {rev.data && <HeroChip icon={<Flame />}>{rev.data.streak.currentStreak}-day streak</HeroChip>}
              {d.sessions[0] && <HeroChip icon={<Video />}>Next class {fromNow(d.sessions[0].startsAt)}</HeroChip>}
              <HeroChip icon={<CalendarCheck />}>Attendance {pct(attendance)}</HeroChip>
            </Hero>

            <StatRow>
              <Stat label="Enrolled courses" value={d.courses.length} hint={`${d.counts.lessonsDone} lessons completed`} icon={<BookOpen />} />
              <Stat label="Average grade" value={pct(gradeAvg)} hint="last 10 published grades" icon={<GraduationCap />} tone="accent" footer={<Sparkline values={d.gradeTrend.map((g: any) => g.pct)} color="var(--color-accent)" />} />
              <Stat label="Learning activity" value={d.heat.reduce((a: number, x: any) => a + x.n, 0)} hint="actions in 12 weeks" icon={<Flame />} tone="gold" footer={<Sparkline values={d.heat.slice(-28).map((x: any) => x.n)} color="var(--color-gold)" />} />
              <Stat label="Certificates" value={d.counts.certificates} hint={`${d.counts.submissions} submissions · ${d.counts.quizAttempts} quizzes`} icon={<Award />} tone="navy" />
            </StatRow>

            <Grid>
              <Card title="Grade trend" subtitle="Your last published grades, as % of maximum" className="lg:col-span-2">
                <AreaChart label="Grade trend" max={100} format={(v) => `${v}%`} color="var(--color-accent)" data={d.gradeTrend.map((g: any) => ({ label: g.course, value: g.pct }))} />
              </Card>
              <Card title="Attendance by course" subtitle="Present or late out of marked sessions">
                <BarList max={100} format={(v) => `${v}%`} items={d.attendance.map((a: any) => ({ label: a.code, value: a.percent, hint: `(${a.attended}/${a.marked})`, color: tone(a.percent, 75, 60) }))} empty="No attendance recorded yet" />
              </Card>
            </Grid>

            <Grid>
              <Card title="My courses" subtitle="Lesson completion per course" className="lg:col-span-2" action={<ViewAll to="/courses" />}>
                {d.courses.length === 0 ? <EmptyState title="No courses yet" body="You'll see your courses here once your college enrolls you." /> : (
                  <ul className="grid gap-4 sm:grid-cols-2">
                    {d.courses.map((c: any, i: number) => (
                      <li key={c.offeringId}>
                        <Link to={`/offerings/${c.offeringId}`} className="group flex items-center gap-4 rounded-2xl border border-line/80 p-4 transition hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md">
                          <Ring value={c.percent} size={64} label={`${c.course.code} completion`} color={PALETTE[i % PALETTE.length]}><span className="text-xs font-bold text-navy">{pct(c.percent)}</span></Ring>
                          <div className="min-w-0">
                            <div className="text-xs font-semibold" style={{ color: PALETTE[i % PALETTE.length] }}>{c.course.code}</div>
                            <div className="truncate font-semibold text-navy group-hover:text-primary">{c.course.title}</div>
                            <div className="mt-0.5 truncate text-xs text-muted">{c.instructors.map((x: any) => `${x.firstName} ${x.lastName}`).join(', ') || 'Instructor to be assigned'}</div>
                          </div>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
              {featureOn(b, 'dailyRevision') ? (
                <Card title="Daily revision" action={<ViewAll to="/revision">Open</ViewAll>}>
                  {rev.data ? (
                    <>
                      <div className="mb-4 flex items-center gap-3 rounded-xl bg-gradient-to-r from-gold/25 to-transparent p-3"><Flame className="size-8 text-[#e09a2a]" aria-hidden /><div><div className="text-2xl font-bold text-navy">{rev.data.streak.currentStreak} days</div><div className="text-xs text-muted">current streak</div></div></div>
                      <ul className="space-y-2.5">
                        {rev.data.items.map((it: any) => (
                          <li key={it.quizId} className="flex items-center justify-between text-sm">
                            <span className="font-medium">{it.course.code}</span>
                            {it.status === 'COMPLETED' ? <Badge tone="success">{it.score}/{it.maxScore}</Badge> : it.status === 'NO_CONTENT' ? <Badge>No questions yet</Badge> : <Link to={`/revision/${it.quizId}`} className="font-medium text-primary">Start · {it.questionCount} Qs</Link>}
                          </li>
                        ))}
                      </ul>
                    </>
                  ) : <LoadingBlock rows={1} />}
                </Card>
              ) : <Card title="Upcoming classes">{d.sessions.length === 0 ? <p className="text-sm text-muted">No scheduled sessions.</p> : <SessionList sessions={d.sessions} />}</Card>}
            </Grid>

            <Card title="My learning activity" subtitle="Lessons, quizzes and submissions per day over the last 12 weeks" className="mb-6">
              <Heatmap days={d.heat} label="My learning activity" color="var(--color-accent)" unit="actions" />
            </Card>

            <Grid>
              <Card title="Upcoming deadlines" subtitle="Assignments and quizzes in the next two weeks" className="lg:col-span-2">
                {d.upcoming.length === 0 ? <EmptyState title="You're all caught up" body="Nothing due in the next two weeks." icon={<CheckCircle2 className="size-6" />} /> : (
                  <ul className="space-y-1">
                    {d.upcoming.map((u: any) => (
                      <li key={u.type + u.id}>
                        <Link to={`/${u.type === 'QUIZ' ? 'quizzes' : 'assignments'}/${u.id}`} className="flex items-center gap-3 rounded-xl p-3 transition hover:bg-cloud">
                          <span className={`grid size-10 shrink-0 place-items-center rounded-xl ${u.type === 'QUIZ' ? 'bg-[#8b5cf6]/10 text-[#8b5cf6]' : 'bg-primary/10 text-primary'}`} aria-hidden>{u.type === 'QUIZ' ? <HelpCircle className="size-5" /> : <ClipboardCheck className="size-5" />}</span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-medium text-ink">{u.title}</span>
                            <span className="block text-xs text-muted">{u.course} · {u.type === 'QUIZ' ? 'Quiz' : 'Assignment'}{u.at ? ` · due ${fmtDateTime(u.at)}` : ''}</span>
                          </span>
                          {u.done ? <Badge tone="success"><CheckCircle2 className="size-3" aria-hidden />Done</Badge> : u.at ? <Badge tone="warning"><AlarmClock className="size-3" aria-hidden />{fromNow(u.at)}</Badge> : <Badge>Open</Badge>}
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
              <div className="space-y-6">
                {featureOn(b, 'dailyRevision') && <Card title="Upcoming classes">{d.sessions.length === 0 ? <p className="text-sm text-muted">No scheduled sessions.</p> : <SessionList sessions={d.sessions} />}</Card>}
                {featureOn(b, 'aiHomework') && (
                  <Link to="/ai-helper" className="group relative flex items-center gap-4 overflow-hidden rounded-2xl bg-gradient-to-br from-navy to-[#3b2a8a] p-5 text-white shadow-lg transition hover:-translate-y-0.5">
                    <div className="absolute -right-8 -top-8 size-32 rounded-full bg-accent/30 blur-2xl" aria-hidden />
                    <span className="relative grid size-11 place-items-center rounded-xl bg-white/10"><Sparkles className="size-6 text-accent" aria-hidden /></span>
                    <span className="relative"><span className="block font-semibold">Stuck on a problem?</span><span className="text-sm text-white/70">Get hints from the AI Homework Helper</span></span>
                  </Link>
                )}
              </div>
            </Grid>
          </>
        );
      }}
    </QueryView>
  );
}

function SessionList({ sessions }: { sessions: any[] }) {
  return (
    <ul className="space-y-3">
      {sessions.map((s) => {
        const at = new Date(s.startsAt);
        return (
          <li key={s.id} className="flex gap-3">
            <span className="grid w-12 shrink-0 place-items-center rounded-xl bg-gradient-to-b from-primary/10 to-cloud py-1.5 text-center leading-tight" aria-hidden>
              <span className="text-[10px] font-semibold uppercase text-primary">{at.toLocaleDateString(undefined, { month: 'short' })}</span>
              <span className="text-lg font-bold text-navy">{at.getDate()}</span>
            </span>
            <span className="min-w-0 text-sm">
              <span className="block truncate font-medium">{s.title}</span>
              <span className="block text-xs text-muted">{s.offering.course.code} · {fmtDateTime(s.startsAt)}</span>
              {s.meetingUrl && <a href={s.meetingUrl} target="_blank" rel="noreferrer noopener" className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-primary"><Video className="size-3.5" aria-hidden />Join link</a>}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

// ── Faculty ──
function FacultyDashboard() {
  const { me } = useAuth();
  const q = useQuery({ queryKey: ['dash', 'faculty'], queryFn: () => get('/dashboard/faculty') });
  return (
    <QueryView q={q}>
      {(d: any) => {
        const students = d.offerings.reduce((a: number, o: any) => a + o._count.enrollments, 0);
        const work = d.counts.toGrade + d.counts.quizReview + d.counts.openDoubts;
        const m = (k: string) => avg(d.offerings.map((o: any) => o.metrics?.[k]));
        return (
          <>
            <Hero eyebrow={greeting()} title={`Welcome, ${me?.firstName}`} subtitle={`${today()} · Your teaching at a glance.`}
              aside={<div className="flex gap-3">{([['Submission', m('submissionRate')], ['Avg score', m('avgScore')], ['Attendance', m('attendance')]] as const).map(([l, v]) => (
                <div key={l} className="flex flex-col items-center rounded-2xl bg-white/10 p-3 ring-1 ring-white/15 backdrop-blur"><Ring value={v} size={68} label={l}><span className="text-sm font-bold text-white">{pct(v)}</span></Ring><span className="mt-1.5 text-[11px] text-white/70">{l}</span></div>
              ))}</div>}>
              <HeroChip icon={<BookOpen />}>{d.offerings.length} offerings</HeroChip>
              <HeroChip icon={<Users />}>{students} students</HeroChip>
              <HeroChip icon={<ClipboardCheck />}>{work} items need attention</HeroChip>
            </Hero>
            <StatRow>
              <Stat label="Submissions to grade" value={d.counts.toGrade} hint={`${d.counts.graded30d} graded in last 30 days`} icon={<ClipboardCheck />} />
              <Stat label="Quiz answers to review" value={d.counts.quizReview} icon={<CheckCircle2 />} tone="accent" />
              <Stat label="Open doubts" value={d.counts.openDoubts} hint={`${sum(d.doubts, 'ANSWERED', 'RESOLVED')} answered or resolved`} icon={<HelpCircle />} tone="gold" />
              <Stat label="Student activity" value={d.heat.reduce((a: number, x: any) => a + x.n, 0)} hint="learning actions in 12 weeks" icon={<Flame />} tone="navy" footer={<Sparkline values={d.heat.slice(-28).map((x: any) => x.n)} color="var(--color-navy-2)" />} />
            </StatRow>
            <Grid>
              <Card title="Pending work" subtitle="What's waiting on you right now">
                {work === 0 ? <EmptyState title="Inbox zero" body="Nothing to grade or answer." icon={<CheckCircle2 className="size-6" />} /> : (
                  <Donut sub="to do" segments={[{ label: 'Submissions', value: d.counts.toGrade }, { label: 'Quiz reviews', value: d.counts.quizReview }, { label: 'Open doubts', value: d.counts.openDoubts, color: 'var(--color-gold)' }]} />
                )}
              </Card>
              <Card title="Score distribution" subtitle="Graded assignments and quizzes across your courses, by % band" className="lg:col-span-2">{histogram(d.grades)}</Card>
            </Grid>
            <Card title="Course performance" subtitle="Submission rate on past-due work, average score and attendance per offering" className="mb-6" action={<ViewAll to="/courses" />}>
              {d.offerings.length === 0 ? <EmptyState title="No assigned courses" body="Your college admin assigns you to course offerings." /> : (
                <Table head={['Offering', 'Students', 'Submission rate', 'Average score', 'Attendance', 'Status']}>
                  {d.offerings.map((o: any, i: number) => (
                    <tr key={o.id}>
                      <Td><Link to={`/offerings/${o.id}`} className="flex items-center gap-2.5 font-medium text-navy hover:text-primary"><span className="h-8 w-1 rounded-full" style={{ background: PALETTE[i % PALETTE.length] }} aria-hidden /><span><span className="block text-xs font-semibold text-muted">{o.course.code} · {o.semester.name}</span>{o.course.title}</span></Link></Td>
                      <Td className="tabular-nums">{o._count.enrollments}</Td>
                      <Td><MiniBar value={o.metrics?.submissionRate ?? null} label="Submission rate" /></Td>
                      <Td><MiniBar value={o.metrics?.avgScore ?? null} label="Average score" /></Td>
                      <Td><MiniBar value={o.metrics?.attendance ?? null} label="Attendance" /></Td>
                      <Td><StatusBadge status={o.status} /></Td>
                    </tr>
                  ))}
                </Table>
              )}
            </Card>
            <Grid>
              <Card title="Student learning activity" subtitle="Daily learning actions in your courses, last 12 weeks" className="lg:col-span-2">
                <Heatmap days={d.heat} label="Student learning activity" unit="actions" />
              </Card>
              <div className="space-y-6">
                <Card title="Doubts by status"><StackedBar segments={[{ label: 'Open', value: d.doubts.OPEN ?? 0, color: 'var(--color-gold)' }, { label: 'Answered', value: d.doubts.ANSWERED ?? 0, color: 'var(--color-primary)' }, { label: 'Resolved', value: d.doubts.RESOLVED ?? 0, color: 'var(--color-accent)' }]} empty="No doubts posted yet" /></Card>
                <Card title="Class sizes"><BarList items={d.offerings.map((o: any) => ({ label: o.course.code, value: o._count.enrollments, href: `/offerings/${o.id}` }))} empty="No assigned courses" /></Card>
              </div>
            </Grid>
            <Card title="Upcoming sessions">{d.sessions.length === 0 ? <p className="text-sm text-muted">No upcoming sessions.</p> : <SessionList sessions={d.sessions} />}</Card>
          </>
        );
      }}
    </QueryView>
  );
}

// ── College admin ──
const ROLE_COLOR: Record<string, string> = { STUDENT: 'var(--color-primary)', FACULTY: 'var(--color-accent)', PARENT: 'var(--color-gold)', COLLEGE_ADMIN: '#8b5cf6', SUPER_ADMIN: 'var(--color-navy-2)' };
const STATUS_COLOR: Record<string, string> = { PUBLISHED: 'var(--color-accent)', DRAFT: 'var(--color-gold)', ARCHIVED: '#94a3b8', CLOSED: 'var(--color-navy-2)' };

function AdminDashboard() {
  const q = useQuery({ queryKey: ['dash', 'admin'], queryFn: () => get('/dashboard/admin') });
  return (
    <QueryView q={q}>
      {(d: any) => {
        const logins = d.activity.reduce((a: number, x: any) => a + x.logins, 0);
        const att = d.attendance, attMarked = sum(att, 'PRESENT', 'LATE', 'ABSENT');
        const attRate = attMarked ? Math.round((sum(att, 'PRESENT', 'LATE') / attMarked) * 100) : null;
        const subsTotal = sum(d.submissions, 'SUBMITTED', 'GRADED');
        const gradedRate = subsTotal ? Math.round(((d.submissions.GRADED ?? 0) / subsTotal) * 100) : null;
        const doubtsTotal = sum(d.doubts, 'OPEN', 'ANSWERED', 'RESOLVED');
        const doubtRate = doubtsTotal ? Math.round((sum(d.doubts, 'ANSWERED', 'RESOLVED') / doubtsTotal) * 100) : null;
        return (
          <>
            <Hero eyebrow="College overview" title="Your college at a glance" subtitle={`${today()} · Academic setup, engagement and outcomes across the college.`}
              aside={<div className="flex gap-3">{([['Attendance', attRate], ['Graded', gradedRate], ['Doubts solved', doubtRate]] as const).map(([l, v]) => (
                <div key={l} className="flex flex-col items-center rounded-2xl bg-white/10 p-3 ring-1 ring-white/15 backdrop-blur"><Ring value={v} size={68} label={l}><span className="text-sm font-bold text-white">{pct(v)}</span></Ring><span className="mt-1.5 text-[11px] text-white/70">{l}</span></div>
              ))}</div>}>
              <HeroChip icon={<Users />}>{d.users} active users</HeroChip>
              <HeroChip icon={<Building2 />}>{d.departments} departments · {d.programs} programs</HeroChip>
              <HeroChip icon={<CalendarDays />}>{d.semesters} semesters</HeroChip>
              <HeroChip icon={<CalendarCheck />}>{logins} sign-ins in 14 days</HeroChip>
            </Hero>
            <StatRow>
              <Stat label="Active students" value={d.roles.STUDENT ?? 0} hint={`${d.signups.reduce((a: number, x: any) => a + x.n, 0)} new accounts in 30 days`} icon={<GraduationCap />} footer={<Sparkline values={d.signups.map((x: any) => x.n)} />} />
              <Stat label="Faculty" value={d.roles.FACULTY ?? 0} hint={`${d.courses} active courses`} icon={<Users />} tone="accent" />
              <Stat label="Published offerings" value={d.offerings.PUBLISHED ?? 0} hint={`${d.offerings.DRAFT ?? 0} in draft`} icon={<BookOpen />} tone="navy" />
              <Stat label="Active enrollments" value={d.enrollments} hint={`${logins} sign-ins in 14 days`} icon={<CalendarCheck />} tone="gold" footer={<Sparkline values={d.activity.map((x: any) => x.logins)} color="var(--color-gold)" />} />
            </StatRow>

            <Grid>
              <Card title="Platform activity" subtitle="Sign-ins and changes per day, last 14 days" className="lg:col-span-2">
                <Columns label="Daily activity" series={[{ name: 'Sign-ins', color: 'var(--color-primary)' }, { name: 'Changes', color: 'var(--color-accent)' }]}
                  data={d.activity.map((x: any) => ({ label: short(x.day), values: [x.logins, x.changes] }))} />
              </Card>
              <Card title="Users by role"><Donut sub="role grants" segments={Object.entries(d.roles).map(([r, n]) => ({ label: ROLE_LABEL[r as Role] ?? r, value: n as number, color: ROLE_COLOR[r] }))} /></Card>
            </Grid>

            <Grid>
              <Card title="Learning activity" subtitle="Lessons viewed, quizzes taken and work submitted per day — last 12 weeks" className="lg:col-span-2">
                <Heatmap days={d.heat} label="College learning activity" unit="learning actions" />
              </Card>
              <Card title="Content library" subtitle="Published learning material">
                <div className="grid grid-cols-2 gap-3">
                  <Kpi label="Lessons" value={d.content.lessons} color={PALETTE[0]} />
                  <Kpi label="Assignments" value={d.content.assignments} color={PALETTE[1]} />
                  <Kpi label="Quizzes" value={d.content.quizzes} hint={`${d.content.attempts} attempts`} color={PALETTE[2]} />
                  <Kpi label="Announcements" value={d.content.announcements} color={PALETTE[3]} />
                  <Kpi label="Certificates" value={d.content.certificates} color={PALETTE[4]} />
                  <Kpi label="Late submissions" value={d.content.lateSubs} color="var(--color-danger)" />
                </div>
              </Card>
            </Grid>

            <Grid cols={2}>
              <Card title="Score distribution" subtitle="All graded assignments and quizzes, by % band">{histogram(d.grades)}</Card>
              <Card title="Engagement health" subtitle="Status breakdowns across the college">
                <div className="space-y-6">
                  <div><div className="mb-2 flex justify-between text-sm"><span className="font-medium text-navy">Attendance</span><span className="text-muted">{pct(attRate)} present</span></div>
                    <StackedBar segments={[{ label: 'Present', value: att.PRESENT ?? 0, color: 'var(--color-accent)' }, { label: 'Late', value: att.LATE ?? 0, color: 'var(--color-gold)' }, { label: 'Absent', value: att.ABSENT ?? 0, color: 'var(--color-danger)' }, { label: 'Excused', value: att.EXCUSED ?? 0, color: '#94a3b8' }]} empty="No attendance marked yet" /></div>
                  <div><div className="mb-2 flex justify-between text-sm"><span className="font-medium text-navy">Submissions</span><span className="text-muted">{pct(gradedRate)} graded</span></div>
                    <StackedBar segments={[{ label: 'Graded', value: d.submissions.GRADED ?? 0, color: 'var(--color-primary)' }, { label: 'Awaiting grade', value: d.submissions.SUBMITTED ?? 0, color: 'var(--color-gold)' }]} empty="No submissions yet" /></div>
                  <div><div className="mb-2 flex justify-between text-sm"><span className="font-medium text-navy">Doubts</span><span className="text-muted">{pct(doubtRate)} answered</span></div>
                    <StackedBar segments={[{ label: 'Open', value: d.doubts.OPEN ?? 0, color: 'var(--color-gold)' }, { label: 'Answered', value: d.doubts.ANSWERED ?? 0, color: 'var(--color-primary)' }, { label: 'Resolved', value: d.doubts.RESOLVED ?? 0, color: 'var(--color-accent)' }]} empty="No doubts posted yet" /></div>
                </div>
              </Card>
            </Grid>

            <Grid>
              <Card title="Enrollments by department" action={<ViewAll to="/admin/reports">Reports</ViewAll>}>
                <BarList items={d.enrollmentsByDept.map((x: any) => ({ label: `${x.code} · ${x.name}`, value: x.n }))} empty="No departments yet" />
              </Card>
              <Card title="Most popular offerings" subtitle="By active enrollments">
                <BarList items={d.topOfferings.map((o: any, i: number) => ({ label: `${o.course.code} · ${o.course.title}`, value: o.students, href: `/offerings/${o.id}`, color: PALETTE[(i + 2) % PALETTE.length] }))} empty="No published offerings" />
              </Card>
              <Card title="Offerings by status">
                <Donut size={140} sub="offerings" segments={Object.entries(d.offerings).map(([s, n]) => ({ label: s.charAt(0) + s.slice(1).toLowerCase(), value: n as number, color: STATUS_COLOR[s] }))} />
              </Card>
            </Grid>

            <Grid cols={2}>
              <Card title="New accounts" subtitle="Users created per day, last 30 days">
                <AreaChart label="New accounts" every={5} data={d.signups.map((x: any) => ({ label: short(x.day), value: x.n }))} />
              </Card>
              <Card title="AI usage" subtitle="Last 30 days">
                {d.ai.length === 0 ? <EmptyState title="No AI usage yet" body="Homework help and content generation will appear here." icon={<Bot className="size-6" />} /> : (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {d.ai.map((x: any, i: number) => (
                      <div key={x.feature} className="rounded-2xl border border-line/80 p-4">
                        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-navy"><span className="grid size-8 place-items-center rounded-lg text-white" style={{ background: PALETTE[i + 3] }}>{x.feature === 'HOMEWORK' ? <Sparkles className="size-4" /> : <FileText className="size-4" />}</span>{x.feature === 'HOMEWORK' ? 'Homework helper' : 'Content generator'}</div>
                        <dl className="grid grid-cols-3 gap-2 text-center">
                          <div><dt className="text-[11px] text-muted">Requests</dt><dd className="font-bold text-navy">{x.requests}</dd></div>
                          <div><dt className="text-[11px] text-muted">Tokens</dt><dd className="font-bold text-navy">{x.tokens >= 1000 ? `${(x.tokens / 1000).toFixed(1)}k` : x.tokens}</dd></div>
                          <div><dt className="text-[11px] text-muted">Cost</dt><dd className="font-bold text-navy">${x.cost.toFixed(2)}</dd></div>
                        </dl>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </Grid>

            <Grid cols={2}>
              <Card title="Quick actions">
                <div className="grid gap-3 sm:grid-cols-2">
                  {([['/admin/users', 'Add users', 'Invite students, faculty, parents', UserPlus], ['/admin/academics', 'Set up semesters', 'Departments, programs, terms', Layers], ['/admin/courses', 'Create a course', 'Catalogue and credits', BookOpen], ['/admin/offerings', 'Create an offering', 'Assign faculty and enroll', ClipboardList], ['/announcements', 'Post announcement', 'Reach every student', Megaphone], ['/admin/reports', 'View reports', 'Completion by offering', FileText]] as const).map(([to, l, sub, Icon], i) => (
                    <Link key={to} to={to} className="group flex items-start gap-3 rounded-2xl border border-line/80 p-4 transition hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md">
                      <span className="grid size-10 shrink-0 place-items-center rounded-xl text-white" style={{ background: PALETTE[i % PALETTE.length] }} aria-hidden><Icon className="size-5" /></span>
                      <span><span className="block text-sm font-semibold text-navy group-hover:text-primary">{l}</span><span className="text-xs text-muted">{sub}</span></span>
                    </Link>
                  ))}
                </div>
              </Card>
              <Card title="Recent activity" action={<ViewAll to="/admin/audit">Audit log</ViewAll>}>
                <ol className="relative space-y-4 border-l border-line pl-5">
                  {d.recentAudit.map((a: any) => (
                    <li key={a.id} className="relative">
                      <span className={`absolute -left-[26px] top-1 size-3 rounded-full ring-4 ring-white ${a.action === 'LOGIN' ? 'bg-primary' : 'bg-accent'}`} aria-hidden />
                      <div className="flex justify-between gap-3 text-sm">
                        <span className="min-w-0 truncate"><span className="font-medium capitalize text-ink">{a.action.replace(/_/g, ' ').toLowerCase()}</span> <span className="text-muted">· {a.actor ? `${a.actor.firstName} ${a.actor.lastName}` : 'system'}</span></span>
                        <span className="shrink-0 text-xs text-muted">{fromNow(a.createdAt)}</span>
                      </div>
                    </li>
                  ))}
                </ol>
              </Card>
            </Grid>
          </>
        );
      }}
    </QueryView>
  );
}

// ── Super admin ──
function SuperAdminDashboard() {
  const q = useQuery({ queryKey: ['system', 'health'], queryFn: () => get('/system/health'), refetchInterval: 30_000 });
  return (
    <QueryView q={q}>
      {(h: any) => (
        <>
          <Hero eyebrow="System overview" title="Deployment health" subtitle="Health, configuration and AI consumption for this deployment. Refreshes every 30 seconds.">
            <HeroChip icon={<Server />}>API healthy</HeroChip>
            <HeroChip>Env: {h.env}</HeroChip>
            <HeroChip>Uptime {Math.round(h.uptimeSec / 60)} min</HeroChip>
          </Hero>
          <StatRow>
            <Stat label="API status" value={<span className="text-success">Healthy</span>} hint={`Uptime ${Math.round(h.uptimeSec / 60)} min · ${h.env}`} icon={<Server />} tone="accent" />
            <Stat label="Database latency" value={`${h.dbLatencyMs} ms`} hint={h.dbLatencyMs < 50 ? 'Fast' : h.dbLatencyMs < 200 ? 'OK' : 'Slow'} icon={<Database />} />
            <Stat label="Users / offerings" value={`${h.counts.users} / ${h.counts.offerings}`} icon={<Users />} tone="navy" />
            <Stat label="AI cost (30 days)" value={`$${Number(h.aiUsage30d.estimatedCostUsd ?? 0).toFixed(2)}`} hint={h.aiConfigured ? `Model ${h.aiModel}` : 'AI not configured'} icon={<Sparkles />} tone="gold" />
          </StatRow>
          <Grid>
            <Card title="Server resources" subtitle="Current process">
              <dl className="divide-y divide-line/70 text-sm">
                {[['Memory (RSS)', `${h.memoryMb} MB`], ['Load average', (h.loadAvg ?? 0).toFixed(2)], ['DB latency', `${h.dbLatencyMs} ms`], ['Migrations applied', h.migrations.length]].map(([k, v]) => (
                  <div key={k} className="flex justify-between py-2.5"><dt className="text-muted">{k}</dt><dd className="font-semibold tabular-nums text-navy">{v}</dd></div>
                ))}
              </dl>
            </Card>
            <Card title="Recent database migrations" className="lg:col-span-2">
              <Table head={['Migration', 'Applied']}>{h.migrations.map((m: any) => <tr key={m.migration_name}><Td className="font-mono text-xs">{m.migration_name}</Td><Td>{fmtDateTime(m.finished_at)}</Td></tr>)}</Table>
            </Card>
          </Grid>
        </>
      )}
    </QueryView>
  );
}
