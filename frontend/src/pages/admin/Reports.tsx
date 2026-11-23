import { Link } from 'react-router-dom';
import { BookOpen, HelpCircle, Users } from 'lucide-react';
import { useGet } from '../../lib/hooks';
import { pct } from '../../lib/format';
import { Card, EmptyState, PageHeader, Progress, QueryView, Stat, Table, Td } from '../../components/ui';
import { BarList, Donut } from '../../components/charts';

export default function Reports() {
  const q = useGet<any>('/analytics/college/overview');
  return (
    <>
      <PageHeader title="Reports" subtitle="College-level learning overview from published offerings. Open an offering's Class insights for detail." />
      <QueryView q={q}>
        {(d) => (
          <>
            <div className="mb-6 grid gap-4 sm:grid-cols-4">
              <Stat label="Active students" value={d.totals.students} icon={<Users />} />
              <Stat label="Active faculty" value={d.totals.faculty} icon={<Users />} tone="accent" />
              <Stat label="Published offerings" value={d.totals.publishedOfferings} icon={<BookOpen />} tone="navy" />
              <Stat label="Open doubts" value={d.totals.openDoubts} icon={<HelpCircle />} tone="gold" />
            </div>
            {d.offerings.length === 0 ? <EmptyState title="No published offerings" /> : (<>
              <div className="mb-6 grid gap-6 lg:grid-cols-3">
                <Card title="Lesson completion by offering" subtitle="Share of required lessons completed by enrolled students" className="lg:col-span-2">
                  <BarList max={100} format={(v) => `${v}%`} items={[...d.offerings].sort((x: any, y: any) => (y.completionPct ?? -1) - (x.completionPct ?? -1)).map((o: any) => ({
                    label: `${o.course.code} · ${o.course.title}`, value: o.completionPct, href: `/offerings/${o.offeringId}?tab=insights`,
                    color: o.completionPct === null ? undefined : o.completionPct >= 70 ? 'var(--color-accent)' : o.completionPct >= 40 ? 'var(--color-gold)' : 'var(--color-danger)',
                  }))} />
                </Card>
                <Card title="Students by department" subtitle="Enrollments in published offerings">
                  <Donut sub="enrollments" segments={Object.entries(d.offerings.reduce((m: Record<string, number>, o: any) => ({ ...m, [o.course.department.code]: (m[o.course.department.code] ?? 0) + o.students }), {})).map(([label, value]) => ({ label, value: value as number }))} />
                </Card>
              </div>
              <Table head={['Offering', 'Department', 'Semester', 'Students', 'Lesson completion']}>
                {d.offerings.map((o: any) => (
                  <tr key={o.offeringId}>
                    <Td><Link to={`/offerings/${o.offeringId}?tab=insights`} className="font-medium text-primary hover:underline">{o.course.code} {o.course.title}</Link></Td>
                    <Td>{o.course.department.code}</Td><Td>{o.semester}</Td><Td>{o.students}</Td>
                    <Td><div className="flex items-center gap-2"><div className="w-28"><Progress value={o.completionPct} label={`${o.course.code} completion`} /></div><span className="text-xs">{pct(o.completionPct)}</span></div></Td>
                  </tr>
                ))}
              </Table>
            </>)}
          </>
        )}
      </QueryView>
    </>
  );
}
