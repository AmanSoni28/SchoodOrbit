import { Link } from 'react-router-dom';
import { CalendarCheck, Flame, Trophy } from 'lucide-react';
import { useGet } from '../../lib/hooks';
import { Badge, Card, EmptyState, PageHeader, QueryView, Stat, StatusBadge, Table, Td } from '../../components/ui';

export default function Revision() {
  const today = useGet<any>('/revision/today');
  const history = useGet<any>('/revision/history');
  return (
    <>
      <PageHeader title="Daily revision" subtitle="About five quick questions a day from lessons you've completed. Practice only — it never affects your grades." />
      <QueryView q={today}>
        {(t) => (
          <>
            <div className="mb-6 grid gap-4 sm:grid-cols-3">
              <Stat label="Current streak" value={`${t.streak.currentStreak} day${t.streak.currentStreak === 1 ? '' : 's'}`} icon={<Flame className="size-4" />} tone="gold" />
              <Stat label="Longest streak" value={`${t.streak.longestStreak} days`} icon={<Trophy className="size-4" />} tone="primary" />
              <Stat label="Today" value={t.date} hint="Resets at midnight college time" icon={<CalendarCheck className="size-4" />} tone="accent" />
            </div>
            {t.items.length === 0 ? <EmptyState title="Daily revision isn't enabled for your courses" /> : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {t.items.map((it: any) => (
                  <Card key={it.quizId}>
                    <div className="text-xs font-semibold text-primary">{it.course.code}</div>
                    <div className="font-semibold text-navy">{it.course.title}</div>
                    <div className="mt-4">
                      {it.status === 'NO_CONTENT' ? <p className="text-sm text-muted">No practice questions yet — complete lessons and your instructor's approved questions will appear here.</p>
                        : it.status === 'COMPLETED' ? <div className="flex items-center justify-between"><Badge tone="success">Done · {it.score}/{it.maxScore}</Badge><Link to={`/revision/${it.quizId}`} className="text-sm font-medium text-primary">Review</Link></div>
                        : <Link to={`/revision/${it.quizId}`} className="inline-flex w-full justify-center rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-white hover:brightness-110">Start · {it.questionCount} questions</Link>}
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </>
        )}
      </QueryView>
      <Card className="mt-6" title="History">
        <QueryView q={history} empty={<p className="text-sm text-muted">No history yet.</p>} isEmpty={(h) => h.quizzes.length === 0}>
          {(h) => (
            <Table head={['Date', 'Course', 'Status', 'Score']}>
              {h.quizzes.map((z: any) => <tr key={z.id}><Td>{z.scheduledLocalDate}</Td><Td>{z.offering.course.code}</Td><Td><StatusBadge status={z.status} /></Td><Td>{z.attempts[0]?.submittedAt ? `${z.attempts[0].score}/${z.attempts[0].maxScore}` : '—'}</Td></tr>)}
            </Table>
          )}
        </QueryView>
      </Card>
    </>
  );
}
