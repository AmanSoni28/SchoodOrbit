import { Download } from 'lucide-react';
import { downloadUrl } from '../../../lib/api';
import { useGet } from '../../../lib/hooks';
import { fmtDate, pct } from '../../../lib/format';
import { Card, EmptyState, QueryView, Stat, Table, Td } from '../../../components/ui';
import type { TabProps } from '../OfferingPage';

const cell = (c: any) => (c ? <span>{c.earned}/{c.max}{c.late && <span className="ml-1 text-xs text-[#7a5310]">(late)</span>}</span> : <span className="text-muted">—</span>);

export default function GradesTab(p: TabProps) {
  return p.access.isStudent && !p.access.isInstructor ? <MyGrades {...p} /> : <Gradebook {...p} />;
}

function MyGrades({ offeringId }: TabProps) {
  const q = useGet<any>(`/offerings/${offeringId}/grades/me`);
  return (
    <QueryView q={q}>
      {(g) => (
        <>
          <div className="mb-5 grid gap-4 sm:grid-cols-3">
            <Stat label="Course total" value={pct(g.totalPct)} hint={`Assignments ${g.weights.assignments}% · Quizzes ${g.weights.quizzes}%`} tone="navy" />
            <Stat label="Assignments" value={pct(g.assignmentsPct)} tone="primary" />
            <Stat label="Quizzes" value={pct(g.quizzesPct)} tone="accent" />
          </div>
          {g.columns.length === 0 ? <EmptyState title="No published grades yet" /> : (
            <Table head={['Item', 'Type', 'Due', 'Score']}>
              {g.columns.map((c: any) => <tr key={c.id}><Td className="font-medium">{c.title}</Td><Td>{c.kind === 'quiz' ? 'Quiz' : 'Assignment'}</Td><Td>{fmtDate(c.dueAt)}</Td><Td>{cell(g.cells[c.id])}</Td></tr>)}
            </Table>
          )}
          <p className="mt-3 text-xs text-muted">Only grades your instructor has published are shown. Ungraded items are excluded from totals.</p>
        </>
      )}
    </QueryView>
  );
}

function Gradebook({ offeringId }: TabProps) {
  const q = useGet<any>(`/offerings/${offeringId}/gradebook`);
  return (
    <QueryView q={q}>
      {(b) => (
        <Card title="Gradebook" action={<a href={downloadUrl(`/offerings/${offeringId}/gradebook.csv`)} className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-sm font-medium hover:bg-cloud"><Download className="size-4" aria-hidden />Export CSV</a>}>
          <p className="mb-3 text-xs text-muted">Weights: assignments {b.weights.assignments}%, quizzes {b.weights.quizzes}% (change in Settings). Includes unpublished marks; late penalties applied; best quiz attempt counts.</p>
          {b.rows.length === 0 ? <EmptyState title="No students enrolled" /> : (
            <div className="overflow-x-auto rounded-xl border border-line">
              <table className="w-full text-sm">
                <caption className="sr-only">Gradebook</caption>
                <thead className="bg-cloud text-xs text-muted">
                  <tr><th scope="col" className="sticky left-0 bg-cloud px-3 py-2 text-left">Student</th>{b.columns.map((c: any) => <th key={c.id} scope="col" className="min-w-28 px-3 py-2 text-left font-medium">{c.title}<div className="font-normal">{c.kind === 'quiz' ? 'Quiz' : `/${c.max}`}</div></th>)}<th scope="col" className="px-3 py-2 text-left">Total</th></tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {b.rows.map((r: any) => (
                    <tr key={r.studentId}>
                      <th scope="row" className="sticky left-0 bg-white px-3 py-2 text-left font-medium">{r.student.firstName} {r.student.lastName}</th>
                      {b.columns.map((c: any) => <td key={c.id} className="px-3 py-2">{cell(r.cells[c.id])}</td>)}
                      <td className="px-3 py-2 font-semibold">{pct(r.totalPct)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}
    </QueryView>
  );
}
