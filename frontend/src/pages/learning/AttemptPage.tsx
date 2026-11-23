import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, ChevronLeft, CloudOff, Loader2, Timer, XCircle } from 'lucide-react';
import { api, send } from '../../lib/api';
import { useAct, useGet } from '../../lib/hooks';
import { useAuth } from '../../lib/auth';
import { Badge, Button, Card, Input, QueryView, Textarea, cx, useConfirm, useToast } from '../../components/ui';

type Save = 'idle' | 'saving' | 'saved' | 'error';

export function QuestionInput({ q, value, onChange, disabled }: { q: any; value: any; onChange: (v: any) => void; disabled?: boolean }) {
  if (q.type === 'SHORT') return <Textarea label="Your answer" rows={4} value={value ?? ''} disabled={disabled} onChange={(e) => onChange(e.target.value)} />;
  const multi = q.type === 'MULTI';
  const opts = q.type === 'TRUE_FALSE' && !q.options?.length ? [{ id: 'true', text: 'True' }, { id: 'false', text: 'False' }] : q.options;
  return (
    <fieldset className="space-y-2">
      <legend className="sr-only">Options{multi ? ' (choose all that apply)' : ''}</legend>
      {multi && <p className="text-xs text-muted">Choose all that apply.</p>}
      {opts.map((o: any) => {
        const checked = multi ? (value ?? []).includes(o.id) : value === o.id;
        return (
          <label key={o.id} className={cx('flex cursor-pointer items-center gap-3 rounded-xl border p-3 text-sm transition', checked ? 'border-primary bg-primary/5' : 'border-line hover:bg-cloud', disabled && 'cursor-default')}>
            <input type={multi ? 'checkbox' : 'radio'} name={q.id} className="size-4" disabled={disabled} checked={checked}
              onChange={(e) => onChange(multi ? (e.target.checked ? [...(value ?? []), o.id] : (value ?? []).filter((x: string) => x !== o.id)) : o.id)} />
            {o.text}
          </label>
        );
      })}
    </fieldset>
  );
}

export default function AttemptPage() {
  const { id } = useParams() as { id: string };
  const q = useGet<any>(`/attempts/${id}`);
  return <QueryView q={q} rows={6}>{(a) => (a.status === 'IN_PROGRESS' && !a.questions.some((q: any) => 'correctAnswer' in q) ? <Runner a={a} /> : <Review a={a} />)}</QueryView>;
}

function Runner({ a }: { a: any }) {
  const qc = useQueryClient();
  const toast = useToast();
  const { confirm, dialog } = useConfirm();
  const [answers, setAnswers] = useState<Record<string, any>>(() => Object.fromEntries(a.questions.map((q: any) => [q.id, q.myAnswer])));
  const [status, setStatus] = useState<Record<string, Save>>({});
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  // Server-authoritative countdown: offset local clock by the server's "now".
  const skew = useRef(new Date(a.serverNow).getTime() - Date.now());
  const [left, setLeft] = useState<number | null>(null);
  const submitting = useRef(false);

  const save = async (qid: string, v: any, attempt = 0): Promise<void> => {
    setStatus((s) => ({ ...s, [qid]: 'saving' }));
    try { await send('PUT', `/attempts/${a.id}/answers/${qid}`, { answer: v }); setStatus((s) => ({ ...s, [qid]: 'saved' })); }
    catch (e: any) {
      if (e.status === 409) { qc.invalidateQueries({ queryKey: [`/attempts/${a.id}`] }); return; }
      // Transient failure (network): retry with backoff, keep the local answer.
      if (attempt < 4) { setTimeout(() => save(qid, v, attempt + 1), 1000 * 2 ** attempt); setStatus((s) => ({ ...s, [qid]: 'error' })); }
      else { setStatus((s) => ({ ...s, [qid]: 'error' })); toast.error('Could not save an answer. Check your connection.'); }
    }
  };
  const change = (qid: string, v: any) => {
    setAnswers((x) => ({ ...x, [qid]: v }));
    clearTimeout(timers.current[qid]);
    timers.current[qid] = setTimeout(() => save(qid, v), 600);
  };
  const submit = useAct(async () => {
    submitting.current = true;
    await Promise.all(Object.entries(timers.current).map(async ([qid, t]) => { clearTimeout(t); if (status[qid] !== 'saved' && answers[qid] != null) await save(qid, answers[qid]).catch(() => {}); }));
    return api(`/attempts/${a.id}/submit`, { method: 'POST', body: {} });
  }, { success: 'Quiz submitted', invalidate: [`/attempts/${a.id}`, `/quizzes/${a.quiz.id}`] });

  useEffect(() => {
    if (!a.deadlineAt) return;
    const tick = () => {
      const ms = new Date(a.deadlineAt).getTime() - (Date.now() + skew.current);
      setLeft(Math.max(0, ms));
      if (ms <= 0 && !submitting.current) submit.mutate();
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [a.deadlineAt]); // eslint-disable-line

  const answered = a.questions.filter((q: any) => answers[q.id] != null && answers[q.id] !== '' && !(Array.isArray(answers[q.id]) && !answers[q.id].length)).length;
  const anyError = Object.values(status).includes('error');
  const mm = left !== null ? `${Math.floor(left / 60000)}:${String(Math.floor((left % 60000) / 1000)).padStart(2, '0')}` : null;

  return (
    <>
      <div className="sticky top-16 z-20 -mx-4 mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-line bg-cloud/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <div><h1 className="font-bold text-navy">{a.quiz.title}</h1><p className="text-xs text-muted">{answered}/{a.questions.length} answered · {anyError ? <span className="inline-flex items-center gap-1 text-danger"><CloudOff className="size-3" aria-hidden />saving retrying…</span> : 'answers autosave'}</p></div>
        <div className="flex items-center gap-3">
          {mm && <span role="timer" aria-live={left! < 60000 ? 'assertive' : 'off'} className={cx('inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-mono text-sm font-semibold', left! < 60000 ? 'bg-danger text-white' : 'bg-white text-navy')}><Timer className="size-4" aria-hidden />{mm}</span>}
          <Button loading={submit.isPending} onClick={async () => (await confirm({ title: 'Submit your answers?', body: answered < a.questions.length ? `You have ${a.questions.length - answered} unanswered question(s).` : 'You cannot change answers after submitting.', confirm: 'Submit' })) && submit.mutate()}>Submit</Button>
        </div>
      </div>
      <ol className="space-y-4">
        {a.questions.map((q: any, i: number) => (
          <li key={q.id}>
            <Card>
              <div className="mb-3 flex items-start justify-between gap-3">
                <h2 className="font-medium text-ink"><span className="text-muted">{i + 1}.</span> {q.prompt}</h2>
                <span className="shrink-0 text-xs text-muted">{q.points} pt {status[q.id] === 'saving' ? <Loader2 className="inline size-3 animate-spin" aria-label="Saving" /> : status[q.id] === 'saved' ? <CheckCircle2 className="inline size-3 text-accent" aria-label="Saved" /> : null}</span>
              </div>
              <QuestionInput q={q} value={answers[q.id]} onChange={(v) => change(q.id, v)} />
            </Card>
          </li>
        ))}
      </ol>
      {dialog}
    </>
  );
}

function Review({ a }: { a: any }) {
  const reveal = a.questions.some((q: any) => 'correctAnswer' in q);
  return (
    <>
      <Link to={`/quizzes/${a.quiz.id}`} className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-ink"><ChevronLeft className="size-4" aria-hidden />{a.quiz.title}</Link>
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold text-navy">Attempt review</h1>
        {a.score != null ? <Badge tone="success">Score {Number(a.score)}/{Number(a.maxScore)}</Badge> : <Badge tone="primary">{a.status === 'SUBMITTED' ? 'Awaiting faculty review' : 'Submitted — results not yet published'}</Badge>}
      </div>
      {!reveal && <Card><p className="text-sm text-muted">Your attempt was submitted. Correct answers and explanations appear here when your instructor publishes results.</p></Card>}
      <ol className="space-y-4">
        {a.questions.map((q: any, i: number) => (
          <li key={q.id}>
            <Card>
              <div className="mb-3 flex items-start justify-between gap-3">
                <h2 className="font-medium"><span className="text-muted">{i + 1}.</span> {q.prompt}</h2>
                {reveal && (q.isCorrect === true ? <Badge tone="success"><CheckCircle2 className="size-3" aria-hidden />Correct</Badge> : q.isCorrect === false ? <Badge tone="danger"><XCircle className="size-3" aria-hidden />Incorrect</Badge> : <Badge tone="warning">Needs review</Badge>)}
              </div>
              <QuestionInput q={q} value={q.myAnswer} onChange={() => {}} disabled />
              {reveal && q.type !== 'SHORT' && <p className="mt-3 text-sm"><span className="font-medium text-success">Correct answer:</span> {[q.correctAnswer].flat().map((id: string) => q.options.find((o: any) => o.id === id)?.text ?? id).join(', ')}</p>}
              {reveal && q.explanation && <p className="mt-2 rounded-lg bg-cloud p-3 text-sm">{q.explanation}</p>}
              {reveal && q.feedback && <p className="mt-2 text-sm"><span className="font-medium">Feedback:</span> {q.feedback}</p>}
              {reveal && q.type === 'SHORT' && <ManualGrade attemptId={a.id} q={q} />}
            </Card>
          </li>
        ))}
      </ol>
    </>
  );
}

// Faculty grading of descriptive answers (server rejects anyone but the assigned instructor).
function ManualGrade({ attemptId, q }: { attemptId: string; q: any }) {
  const [pts, setPts] = useState(q.pointsAwarded != null ? String(Number(q.pointsAwarded)) : '');
  const [fb, setFb] = useState(q.feedback ?? '');
  const save = useAct(() => send('PATCH', `/attempts/${attemptId}/answers/${q.id}/grade`, { pointsAwarded: Number(pts), feedback: fb || undefined }), { success: 'Answer graded', invalidate: [`/attempts/${attemptId}`, '/quizzes/'] });
  if (useAuth().role !== 'FACULTY') return null;
  return (
    <form onSubmit={(e) => { e.preventDefault(); save.mutate(); }} className="mt-4 grid gap-3 rounded-xl border border-line p-3 sm:grid-cols-[120px_1fr_auto] sm:items-end">
      <Input label={`Points (max ${q.points})`} type="number" step="0.5" min={0} max={q.points} required value={pts} onChange={(e) => setPts(e.target.value)} />
      <Input label="Feedback" value={fb} onChange={(e) => setFb(e.target.value)} />
      <Button type="submit" size="sm" loading={save.isPending}>Save</Button>
    </form>
  );
}
