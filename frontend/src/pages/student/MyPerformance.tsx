import { useGet } from '../../lib/hooks';
import { PageHeader, QueryView } from '../../components/ui';
import { StudentReport, type Report } from '../../components/StudentReport';

export default function MyPerformance() {
  const q = useGet<Report>('/me/performance');
  return (
    <>
      <PageHeader eyebrow="Insights" title="My performance" subtitle="Your marks, attendance and progress in every course — and how you compare with your class." />
      <QueryView q={q} rows={6}>{(r) => <StudentReport r={r} viewer="student" />}</QueryView>
    </>
  );
}
