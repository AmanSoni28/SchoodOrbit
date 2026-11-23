import { Link, useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft, Clock, ListChecks, Repeat } from 'lucide-react';
import { send } from '../../lib/api';
import { useAct, useGet } from '../../lib/hooks';
import { fmtDateTime } from '../../lib/format';
import { Badge, Button, Card, EmptyState, QueryView, Stat, StatusBadge, Table, Td, useConfirm } from '../../components/ui';

export default function QuizPage() {
  const { id } = useParams() as { id: string };
  const q = useGet<any>(`/quizzes/${id}`);
  return (
    <QueryView q={q} rows={5}>
      {(z) => (
        <>
          <Link to={`/offerings/${z.offeringId}?tab=quizzes`} className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-ink"><ChevronLeft className="size-4" aria-hidden />Quizzes</Link>
          <div className="mb-6 flex flex-wrap items-center gap-3"><h1 className="text-2xl font-bold text-navy">{z.title}</h1>{(z.access.isInstructor || z.access.isAdmin) && <StatusBadge status={z.status} />}</div>
          {z.description && <p className="mb-4 max-w-3xl text-sm text-muted">{z.description}</p>}
          <div className="mb-6 grid gap-4 sm:grid-cols-4">
            <Stat label="Questions" value={z.questionCount} icon={<ListChecks className="size-4" />} />
            <Stat label="Time limit" value={z.timeLimitMinutes ? `${z.timeLimitMinutes} min` : 'None'} icon={<Clock className="size-4" />} tone="gold" />
            <Stat label="Attempts allowed" value={z.maxAttempts} icon={<Repeat className="size-4" />} tone="accent" />
            <Stat label="Closes" value={<span className="text-base">{fmtDateTime(z.closesAt)}</span>} tone="navy" />
          </div>
          {z.access.isStudent ? <StudentView z={z} /> : <StaffView z={z} />}
        </>
      )}
    </QueryView>
  );
}

function StudentView({ z }: { z: any }) {
  const nav = useNavigate();
  const { confirm, dialog } = useConfirm();
  const inProgress = z.myAttempts.find((a: any) => a.status === 'IN_PROGRESS');
  const start = useAct(() => send('POST', `/quizzes/${z.id}/attempts`), { invalidate: [`/quizzes/${z.id}`], onDone: (a: any) => nav(`/attempts/${a.id}`) });
  const now = new Date();
  const open = z.status === 'PUBLISHED' && (!z.opensAt || new Date(z.opensAt) <= now) && (!z.closesAt || new Date(z.closesAt) >= now);
  const left = z.maxAttempts - z.myAttempts.length;
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        {inProgress ? <Button className="w-full" onClick={() => nav(`/attempts/${inProgress.id}`)}>Resume attempt</Button>
          : open && left > 0 ? (
            <Button className="w-full" loading={start.isPending} onClick={async () => (await confirm({ title: 'Start the quiz?', body: z.timeLimitMinutes ? `You will have ${z.timeLimitMinutes} minutes. The timer runs on the server and continues if you close the page.` : 'Your answers save automatically as you go.', confirm: 'Start' })) && start.mutate()}>
              Start attempt {z.myAttempts.length + 1} of {z.maxAttempts}
            </Button>
          ) : <p className="text-sm text-muted">{!open ? 'This quiz is not open right now.' : 'You have used all your attempts.'}</p>}
        <p className="mt-3 text-xs text-muted">Answers autosave. Submitting twice is safe — only one submission counts.</p>
      </Card>
      <Card title="Your attempts">
        {z.myAttempts.length === 0 ? <p className="text-sm text-muted">No attempts yet.</p> : (
          <ul className="divide-y divide-line">{z.myAttempts.map((a: any) => (
            <li key={a.id} className="flex items-center justify-between py-2 text-sm">
              <Link to={`/attempts/${a.id}`} className="font-medium text-primary">Attempt {a.attemptNo}</Link>
              {a.status === 'IN_PROGRESS' ? <Badge tone="warning">In progress</Badge> : a.score != null ? <Badge tone="success">{Number(a.score)}/{Number(a.maxScore)}</Badge> : <Badge tone="primary">{a.status === 'SUBMITTED' ? 'Awaiting review' : 'Results not published'}</Badge>}
            </li>
          ))}</ul>
        )}
      </Card>
      {dialog}
    </div>
  );
}

function StaffView({ z }: { z: any }) {
  const attempts = useGet<any[]>(`/quizzes/${z.id}/attempts`);
  const set = useAct((body: object) => send('PATCH', `/quizzes/${z.id}`, body), { success: 'Quiz updated', invalidate: [`/quizzes/${z.id}`, `/offerings/${z.offeringId}/quizzes`] });
  const { confirm, dialog } = useConfirm();
  return (
    <div className="space-y-6">
      {z.access.isInstructor && (
        <Card title="Controls">
          <div className="flex flex-wrap gap-2">
            {z.status === 'DRAFT' && <Button onClick={async () => (await confirm({ title: 'Publish quiz?', body: 'Students are notified and can start attempts. Questions can no longer be changed.', confirm: 'Publish' })) && set.mutate({ status: 'PUBLISHED' })}>Publish & notify</Button>}
            {z.status === 'PUBLISHED' && <Button variant="secondary" onClick={() => set.mutate({ status: 'CLOSED' })}>Close quiz</Button>}
            {z.status === 'CLOSED' && <Button variant="secondary" onClick={() => set.mutate({ status: 'PUBLISHED' })}>Reopen</Button>}
            <Button variant={z.resultsPublished ? 'secondary' : 'accent'} onClick={() => set.mutate({ resultsPublished: !z.resultsPublished })}>{z.resultsPublished ? 'Hide results' : 'Publish results to students'}</Button>
          </div>
        </Card>
      )}
      <Card title={`Questions (${z.questions.length})`}>
        <ol className="space-y-3">{z.questions.map((qq: any, i: number) => (
          <li key={qq.questionVersionId} className="text-sm"><span className="font-medium">{i + 1}. {qq.questionVersion.prompt}</span> <span className="text-xs text-muted">({qq.questionVersion.question.type}, {qq.questionVersion.points} pt, v{qq.questionVersion.version})</span></li>
        ))}</ol>
      </Card>
      <Card title="Attempts">
        <QueryView q={attempts} empty={<EmptyState title="No attempts yet" />}>
          {(rows) => (
            <Table head={['Student', 'Attempt', 'Submitted', 'Score', 'Status', '']}>
              {rows.map((a) => (
                <tr key={a.id}>
                  <Td>{a.student.firstName} {a.student.lastName}</Td><Td>{a.attemptNo}</Td><Td>{fmtDateTime(a.submittedAt)}</Td>
                  <Td>{a.score != null ? `${Number(a.score)}/${Number(a.maxScore)}` : '—'}</Td>
                  <Td>{a.status === 'SUBMITTED' ? <Badge tone="warning">Needs review</Badge> : <StatusBadge status={a.status} />}</Td>
                  <Td><Link to={`/attempts/${a.id}`} className="text-sm font-medium text-primary">{a.status === 'SUBMITTED' && z.access.isInstructor ? 'Review' : 'View'}</Link></Td>
                </tr>
              ))}
            </Table>
          )}
        </QueryView>
      </Card>
      {dialog}
    </div>
  );
}
