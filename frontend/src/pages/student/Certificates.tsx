import { Award, Copy } from 'lucide-react';
import { useGet } from '../../lib/hooks';
import { fmtDate } from '../../lib/format';
import { useBranding } from '../../lib/branding';
import { EmptyState, PageHeader, QueryView, useToast } from '../../components/ui';

export default function Certificates() {
  const q = useGet<any[]>('/certificates/me');
  const b = useBranding();
  const toast = useToast();
  return (
    <>
      <PageHeader title="Certificates" subtitle="Course completion certificates. Anyone can verify them with the link." />
      <QueryView q={q} empty={<EmptyState icon={<Award className="size-6" />} title="No certificates yet" body="Complete all required lessons in a course and your instructor can issue one." />}>
        {(rows) => (
          <ul className="grid gap-4 md:grid-cols-2">
            {rows.map((c) => {
              const link = `${location.origin}/verify/${c.verificationCode}`;
              return (
                <li key={c.id} className="relative overflow-hidden rounded-2xl border-2 border-navy/10 bg-white p-6">
                  <div className="absolute -right-10 -top-10 size-32 rounded-full bg-accent/10" aria-hidden />
                  <Award className="size-8 text-gold" aria-hidden />
                  <p className="mt-3 text-xs uppercase tracking-wide text-muted">{b.name} · Certificate of completion</p>
                  <h2 className="mt-1 text-lg font-bold text-navy">{c.offering.course.code} {c.offering.course.title}</h2>
                  <p className="text-sm text-muted">{c.offering.semester.name} · issued {fmtDate(c.issuedAt)}</p>
                  <button onClick={() => { navigator.clipboard?.writeText(link); toast.success('Verification link copied'); }} className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-primary"><Copy className="size-4" aria-hidden />Copy verification link</button>
                </li>
              );
            })}
          </ul>
        )}
      </QueryView>
    </>
  );
}
