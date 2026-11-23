// Stat strip for admin list pages. Shares the cached /dashboard/admin query, so it costs no extra request after the overview.
import { useQuery } from '@tanstack/react-query';
import { Archive, BookOpen, Building2, CalendarCheck, FileClock, FilePen, GraduationCap, HeartHandshake, Layers, LogIn, ShieldCheck, Users } from 'lucide-react';
import { get } from '../../lib/api';
import { Card, Stat } from '../../components/ui';
import { Columns, Sparkline } from '../../components/charts';

type Kind = 'users' | 'courses' | 'offerings' | 'audit';

export function AdminSummary({ kind }: { kind: Kind }) {
  const q = useQuery({ queryKey: ['dash', 'admin'], queryFn: () => get('/dashboard/admin') });
  const d: any = q.data;
  if (!d) return null; // the page itself shows loading/errors; the strip is optional context
  const grid = (children: React.ReactNode) => <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{children}</div>;
  if (kind === 'users') return grid(<>
    <Stat label="Students" value={d.roles.STUDENT ?? 0} icon={<GraduationCap />} hint={`${d.signups.reduce((a: number, x: any) => a + x.n, 0)} new in 30 days`} footer={<Sparkline values={d.signups.map((x: any) => x.n)} />} />
    <Stat label="Faculty" value={d.roles.FACULTY ?? 0} icon={<Users />} tone="accent" />
    <Stat label="Parents" value={d.roles.PARENT ?? 0} icon={<HeartHandshake />} tone="gold" />
    <Stat label="Administrators" value={(d.roles.COLLEGE_ADMIN ?? 0) + (d.roles.SUPER_ADMIN ?? 0)} hint={`${d.users} active accounts in total`} icon={<ShieldCheck />} tone="navy" />
  </>);
  if (kind === 'courses') return grid(<>
    <Stat label="Active courses" value={d.courses} icon={<BookOpen />} />
    <Stat label="Departments" value={d.departments} hint={`${d.programs} programs`} icon={<Building2 />} tone="accent" />
    <Stat label="Published lessons" value={d.content.lessons} hint={`${d.content.assignments} assignments · ${d.content.quizzes} quizzes`} icon={<Layers />} tone="gold" />
    <Stat label="Active enrollments" value={d.enrollments} icon={<CalendarCheck />} tone="navy" />
  </>);
  if (kind === 'offerings') return grid(<>
    <Stat label="Published" value={d.offerings.PUBLISHED ?? 0} icon={<BookOpen />} tone="accent" />
    <Stat label="In draft" value={d.offerings.DRAFT ?? 0} icon={<FilePen />} tone="gold" />
    <Stat label="Archived" value={(d.offerings.ARCHIVED ?? 0) + (d.offerings.CLOSED ?? 0)} icon={<Archive />} tone="navy" />
    <Stat label="Active enrollments" value={d.enrollments} hint={`${d.semesters} semesters configured`} icon={<CalendarCheck />} />
  </>);
  const logins = d.activity.reduce((a: number, x: any) => a + x.logins, 0), changes = d.activity.reduce((a: number, x: any) => a + x.changes, 0);
  return (
    <div className="mb-6 grid gap-6 lg:grid-cols-3">
      <div className="grid gap-4">
        <Stat label="Sign-ins (14 days)" value={logins} icon={<LogIn />} footer={<Sparkline values={d.activity.map((x: any) => x.logins)} />} />
        <Stat label="Changes recorded (14 days)" value={changes} icon={<FileClock />} tone="accent" footer={<Sparkline values={d.activity.map((x: any) => x.changes)} color="var(--color-accent)" />} />
      </div>
      <Card title="Events per day" subtitle="Last 14 days" className="lg:col-span-2">
        <Columns label="Audit events per day" height={150} series={[{ name: 'Sign-ins', color: 'var(--color-primary)' }, { name: 'Changes', color: 'var(--color-accent)' }]}
          data={d.activity.map((x: any) => ({ label: new Date(`${x.day}T12:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }), values: [x.logins, x.changes] }))} />
      </Card>
    </div>
  );
}
