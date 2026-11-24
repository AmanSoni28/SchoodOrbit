import { useState } from 'react';
import { Users } from 'lucide-react';
import { useGet } from '../../lib/hooks';
import { EmptyState, QueryView, cx } from '../../components/ui';
import StudentFees from '../student/Fees';

type Child = { student: { id: string; firstName: string; lastName: string } };

/** Fees are visible for every actively linked child (no consent scope needed — it's the family's billing). */
export default function ChildFees() {
  const kids = useGet<Child[]>('/parent/students');
  const [pick, setPick] = useState<string | null>(null);
  return (
    <QueryView q={kids} isEmpty={(d) => !d.length} empty={<EmptyState icon={<Users className="size-6" />} title="No linked child" body="Ask the college office to link your child to your account." />}>
      {(list) => {
        const child = list.find((k) => k.student.id === pick) ?? list[0];
        return (
          <>
            {list.length > 1 && (
              <div className="mb-4 flex flex-wrap gap-1.5" role="group" aria-label="Choose child">
                {list.map((k) => (
                  <button key={k.student.id} onClick={() => setPick(k.student.id)} aria-pressed={k === child}
                    className={cx('rounded-full border px-3 py-1.5 text-sm font-medium', k === child ? 'border-primary bg-primary text-white' : 'border-line bg-white hover:bg-cloud')}>{k.student.firstName} {k.student.lastName}</button>
                ))}
              </div>
            )}
            <StudentFees key={child.student.id} path={`/parent/students/${child.student.id}/fees`} name={child.student.firstName} />
          </>
        );
      }}
    </QueryView>
  );
}
