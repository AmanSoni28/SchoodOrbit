import { useState } from 'react';
import { Users } from 'lucide-react';
import { useGet } from '../../lib/hooks';
import { EmptyState, PageHeader, QueryView, cx } from '../../components/ui';
import { StudentReport, type Report } from '../../components/StudentReport';

type Child = { student: { id: string; firstName: string; lastName: string }; relationship: string; scope: string[] };

export default function ChildPerformance() {
  const kids = useGet<Child[]>('/parent/students');
  const [pick, setPick] = useState<string | null>(null);
  const shared = (kids.data ?? []).filter((k) => k.scope.length);
  const id = pick ?? shared[0]?.student.id ?? null;
  const q = useGet<Report>(id ? `/parent/students/${id}/performance` : null);
  const name = shared.find((k) => k.student.id === id)?.student.firstName;
  return (
    <>
      <PageHeader eyebrow="My child" title={name ? `${name}'s performance` : 'Child performance'} subtitle="Marks, attendance and progress your child has chosen to share with you."
        actions={shared.length > 1 && (
          <div className="flex gap-1.5" role="group" aria-label="Choose child">
            {shared.map((k) => (
              <button key={k.student.id} onClick={() => setPick(k.student.id)} aria-pressed={k.student.id === id}
                className={cx('rounded-full border px-3 py-1.5 text-sm font-medium', k.student.id === id ? 'border-primary bg-primary text-white' : 'border-line bg-white hover:bg-cloud')}>{k.student.firstName}</button>
            ))}
          </div>
        )} />
      <QueryView q={kids} isEmpty={() => !shared.length} empty={<EmptyState icon={<Users className="size-6" />} title="Nothing shared yet" body="Once your child is linked to your account and shares their progress, it will appear here." />}>
        {() => <QueryView q={q} rows={6}>{(r) => <StudentReport r={r} viewer="parent" />}</QueryView>}
      </QueryView>
    </>
  );
}
