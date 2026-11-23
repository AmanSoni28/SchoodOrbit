import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, ChevronLeft, PartyPopper, XCircle } from 'lucide-react';
import { send } from '../../lib/api';
import { useAct, useGet } from '../../lib/hooks';
import { Badge, Button, Card, EmptyState, QueryView } from '../../components/ui';
import { QuestionInput } from '../learning/AttemptPage';

export default function RevisionQuiz() {
  const { id } = useParams() as { id: string };
  const path = `/revision/quizzes/${id}`;
  const q = useGet<any>(path);
  const qc = useQueryClient();
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [local, setLocal] = useState<Record<string, any>>({});
  const [feedback, setFeedback] = useState<Record<string, any>>({});
  const start = useAct(() => send('POST', `/revision/quizzes/${id}/attempts`), { onDone: (a: any) => setAttemptId(a.id) });
  // Resume an existing attempt (answers persist across refresh).
  useEffect(() => { if (q.data?.attempt && !attemptId) setAttemptId(q.data.attempt.id); }, [q.data, attemptId]);
  const answer = useAct(({ qid, v }: { qid: string; v: any }) => send('PUT', `/revision/attempts/${attemptId}/answers/${qid}`, { answer: v }), {});
  const submit = useAct(() => send('POST', `/revision/attempts/${attemptId}/submit`), { success: 'Revision complete — streak updated', invalidate: [path, '/revision/'] });

  return (
    <QueryView q={q} rows={5}>
      {(z) => {
        const done = !!z.attempt?.submittedAt;
        const check = async (qq: any) => { const r = await answer.mutateAsync({ qid: qq.id, v: local[qq.id] }); setFeedback((f) => ({ ...f, [qq.id]: r })); qc.invalidateQueries({ queryKey: [path] }); };
        return (
          <div className="mx-auto max-w-2xl">
            <Link to="/revision" className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-ink"><ChevronLeft className="size-4" aria-hidden />Daily revision</Link>
            <h1 className="text-2xl font-bold text-navy">{z.course.code} · {z.date}</h1>
            <p className="mb-6 text-sm text-muted">Practice only. {z.showExplanations === 'AFTER_EACH' ? 'You see the answer after each question.' : 'Answers are shown when you submit.'}</p>
            {z.status === 'NO_CONTENT' ? <EmptyState title="No questions available today" body="There are no approved practice questions for the lessons you've completed yet." /> : (
              <>
                {done && <Card className="mb-4"><p className="flex items-center gap-2 text-lg font-semibold text-navy"><PartyPopper className="size-5 text-gold" aria-hidden />You scored {z.attempt.score}/{z.attempt.maxScore}</p></Card>}
                {!attemptId && !done ? <Card><Button className="w-full" loading={start.isPending} onClick={() => start.mutate()}>Start today's {z.questions.length} questions</Button></Card> : (
                  <ol className="space-y-4">
                    {z.questions.map((qq: any, i: number) => {
                      const fb = feedback[qq.id] ?? ('correct' in qq ? qq : null);
                      const answered = qq.myAnswer != null || feedback[qq.id];
                      return (
                        <li key={qq.id}><Card>
                          <h2 className="mb-3 font-medium"><span className="text-muted">{i + 1}.</span> {qq.prompt}</h2>
                          <QuestionInput q={qq} value={local[qq.id] ?? qq.myAnswer} disabled={done || !!fb?.correctAnswer} onChange={(v) => setLocal({ ...local, [qq.id]: v })} />
                          {!done && !fb?.correctAnswer && <Button size="sm" className="mt-3" variant={answered ? 'secondary' : 'primary'} disabled={local[qq.id] == null} loading={answer.isPending && answer.variables?.qid === qq.id} onClick={() => check(qq)}>{z.showExplanations === 'AFTER_EACH' ? 'Check answer' : answered ? 'Update answer' : 'Save answer'}</Button>}
                          {fb?.correctAnswer !== undefined && (
                            <div className={`mt-3 rounded-lg p-3 text-sm ${fb.correct ? 'bg-accent/10' : 'bg-danger/8'}`}>
                              <p className="flex items-center gap-1.5 font-semibold">{fb.correct ? <><CheckCircle2 className="size-4 text-accent" aria-hidden />Correct</> : <><XCircle className="size-4 text-danger" aria-hidden />Not quite</>}</p>
                              {!fb.correct && <p className="mt-1">Answer: {[fb.correctAnswer].flat().map((cid: string) => qq.options.find((o: any) => o.id === cid)?.text ?? cid).join(', ')}</p>}
                              {fb.explanation && <p className="mt-1 text-muted">{fb.explanation}</p>}
                            </div>
                          )}
                        </Card></li>
                      );
                    })}
                  </ol>
                )}
                {attemptId && !done && <div className="mt-6 flex justify-end"><Button loading={submit.isPending} onClick={() => submit.mutate()}>Finish revision</Button></div>}
                {done && <p className="mt-4 text-center text-sm text-muted"><Badge tone="success">Completed</Badge> Come back tomorrow for a new set.</p>}
              </>
            )}
          </div>
        );
      }}
    </QueryView>
  );
}
