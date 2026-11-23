import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { BadgeCheck } from 'lucide-react';
import { get } from '../../lib/api';
import { fmtDate } from '../../lib/format';
import { ErrorState, LoadingBlock } from '../../components/ui';
import { AuthLayout } from './AuthLayout';

export default function VerifyCertificate() {
  const { code } = useParams();
  const q = useQuery({ queryKey: ['verify', code], queryFn: () => get(`/certificates/verify/${code}`) });
  return (
    <AuthLayout title="Certificate verification">
      {q.isLoading ? <LoadingBlock rows={2} /> : q.error ? <ErrorState error={q.error} /> : (
        <div className="rounded-2xl border border-accent/30 bg-accent/5 p-5">
          <div className="mb-3 flex items-center gap-2 font-semibold text-success"><BadgeCheck className="size-5" aria-hidden />Valid certificate</div>
          <dl className="space-y-2 text-sm">
            <div><dt className="text-muted">Awarded to</dt><dd className="font-semibold text-navy">{q.data.student}</dd></div>
            <div><dt className="text-muted">Course</dt><dd>{q.data.course}</dd></div>
            <div><dt className="text-muted">Semester</dt><dd>{q.data.semester}</dd></div>
            <div><dt className="text-muted">Issued</dt><dd>{fmtDate(q.data.issuedAt)}</dd></div>
          </dl>
        </div>
      )}
    </AuthLayout>
  );
}
