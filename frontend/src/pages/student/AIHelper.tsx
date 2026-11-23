import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AlertTriangle, BookOpen, ImagePlus, Lightbulb, MessageSquarePlus, Send, Sparkles, ThumbsDown, ThumbsUp, Trash2, X } from 'lucide-react';
import { api, ApiError, fileUrl, send } from '../../lib/api';
import { useAct, useGet } from '../../lib/hooks';
import { fromNow } from '../../lib/format';
import { Markdown } from '../../components/Markdown';
import { Badge, Button, Card, EmptyState, LoadingBlock, PageHeader, QueryView, Select, cx, useConfirm } from '../../components/ui';

const MODES = [
  { id: 'HINT', label: 'Hint', desc: 'A nudge toward the next step' },
  { id: 'CONCEPT', label: 'Concept', desc: 'Explain the idea behind it' },
  { id: 'STEP_BY_STEP', label: 'Step-by-step', desc: 'Guide me through the method' },
  { id: 'PRACTICE', label: 'Similar practice', desc: 'Give me problems like this' },
];

export default function AIHelper() {
  const { id } = useParams();
  const status = useGet<any>('/ai/homework/status');
  const sessions = useGet<any[]>('/ai/homework/sessions');
  return (
    <>
      <PageHeader title="AI Homework Helper" subtitle="Guided help that teaches the method — it won't just hand you answers." />
      {status.data && !status.data.configured && (
        <div role="status" className="mb-4 flex gap-3 rounded-2xl border border-gold/50 bg-gold/10 p-4 text-sm"><AlertTriangle className="size-5 shrink-0 text-[#7a5310]" aria-hidden /><p><strong>The AI Helper isn't switched on yet.</strong> Your college's administrator needs to configure it. You can still browse past sessions.</p></div>
      )}
      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        <aside>
          <NewSession disabled={!status.data?.configured} />
          <h2 className="mb-2 mt-5 text-xs font-semibold uppercase tracking-wide text-muted">Your sessions (private)</h2>
          <QueryView q={sessions} empty={<p className="text-sm text-muted">No sessions yet.</p>}>
            {(rows) => (
              <ul className="space-y-1">{rows.map((s) => (
                <li key={s.id}><Link to={`/ai-helper/${s.id}`} className={cx('block rounded-lg px-3 py-2 text-sm', s.id === id ? 'bg-primary text-white' : 'hover:bg-white')}>
                  <span className="block truncate font-medium">{s.title}</span><span className={cx('text-xs', s.id === id ? 'text-white/70' : 'text-muted')}>{s.offering.course.code} · {fromNow(s.updatedAt)}</span>
                </Link></li>
              ))}</ul>
            )}
          </QueryView>
        </aside>
        <section>{id ? <Chat id={id} configured={!!status.data?.configured} /> : <EmptyState icon={<Sparkles className="size-6" />} title="Start a session" body="Choose a course, then type your question or attach a photo/PDF of the problem." />}</section>
      </div>
    </>
  );
}

function NewSession({ disabled }: { disabled: boolean }) {
  const nav = useNavigate();
  const courses = useGet<any[]>('/offerings');
  const [offeringId, setOfferingId] = useState('');
  const create = useAct(() => send('POST', '/ai/homework/sessions', { offeringId }), { invalidate: ['/ai/homework/sessions'], onDone: (s: any) => nav(`/ai-helper/${s.id}`) });
  return (
    <Card>
      <form onSubmit={(e) => { e.preventDefault(); create.mutate(); }} className="space-y-3">
        <Select label="Course" required value={offeringId} onChange={(e) => setOfferingId(e.target.value)}><option value="">Choose a course…</option>{courses.data?.map((o) => <option key={o.id} value={o.id}>{o.course.code} — {o.course.title}</option>)}</Select>
        <Button type="submit" className="w-full" disabled={!offeringId || disabled} loading={create.isPending}><MessageSquarePlus className="size-4" aria-hidden />New session</Button>
      </form>
    </Card>
  );
}

function Chat({ id, configured }: { id: string; configured: boolean }) {
  const path = `/ai/homework/sessions/${id}`;
  const nav = useNavigate();
  const q = useGet<any>(path);
  const [mode, setMode] = useState('HINT');
  const [text, setText] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [err, setErr] = useState<ApiError | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const { confirm, dialog } = useConfirm();
  useEffect(() => { if (q.data) setMode(q.data.mode); }, [q.data?.id]); // eslint-disable-line
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [q.data?.messages.length]);

  const sendMsg = useAct(async () => {
    setErr(null);
    const form = new FormData();
    form.append('content', text);
    form.append('mode', mode);
    files.forEach((f) => form.append('files', f));
    return api(`${path}/messages`, { form });
  }, { invalidate: [path, '/ai/homework/sessions'], onDone: () => { setText(''); setFiles([]); } });
  useEffect(() => { if (sendMsg.error instanceof ApiError) setErr(sendMsg.error); }, [sendMsg.error]);
  const rate = useAct(({ mid, rating }: { mid: string; rating: string }) => send('POST', `/ai/homework/messages/${mid}/feedback`, { rating }), { success: 'Thanks — your feedback helps improve answers', invalidate: [path] });
  const del = useAct(() => send('DELETE', path), { success: 'Session deleted', invalidate: ['/ai/homework/sessions'], onDone: () => nav('/ai-helper') });

  if (q.isLoading) return <LoadingBlock rows={4} />;
  if (q.error) return <EmptyState title="Session not found" />;
  const s = q.data;
  return (
    <Card className="flex min-h-[70vh] flex-col p-0">
      <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3">
        <div className="min-w-0"><div className="truncate font-semibold text-navy">{s.title}</div><div className="text-xs text-muted">{s.offering.course.code} · visible only to you</div></div>
        <button onClick={async () => (await confirm({ title: 'Delete this session?', body: 'The conversation and its attachments are permanently deleted.', confirm: 'Delete', danger: true })) && del.mutate()} className="rounded-lg p-2 text-muted hover:bg-cloud" aria-label="Delete session"><Trash2 className="size-4" /></button>
      </div>
      <div className="flex-1 space-y-4 overflow-y-auto p-5" aria-live="polite">
        {s.messages.length === 0 && <p className="text-center text-sm text-muted">Type your question, or attach a clear photo or PDF of it. Pick how you'd like help below.</p>}
        {s.messages.map((m: any) => (
          <div key={m.id} className={cx('flex', m.role === 'USER' ? 'justify-end' : 'justify-start')}>
            <div className={cx('max-w-[85%] rounded-2xl px-4 py-3 text-sm', m.role === 'USER' ? 'bg-primary text-white' : 'border border-line bg-cloud')}>
              {m.role === 'USER' ? (
                <>
                  {m.mode && <div className="mb-1 text-xs text-white/70">{MODES.find((x) => x.id === m.mode)?.label}</div>}
                  {m.content && <p className="whitespace-pre-wrap">{m.content}</p>}
                  {m.attachments.map((a: any) => <a key={a.fileAsset.id} href={fileUrl(a.fileAsset.id)} target="_blank" rel="noreferrer" className="mt-1 block text-xs text-white underline">{a.fileAsset.originalName}</a>)}
                </>
              ) : (
                <>
                  <Markdown text={m.content} />
                  {m.modelMetadata?.linkedLessons?.length > 0 && (
                    <div className="mt-3 border-t border-line pt-2 text-xs"><span className="font-medium text-muted">Related lessons:</span> {m.modelMetadata.linkedLessons.map((l: any) => <Link key={l.id} to={`/lessons/${l.id}`} className="ml-2 inline-flex items-center gap-1 text-primary"><BookOpen className="size-3" aria-hidden />{l.title}</Link>)}</div>
                  )}
                  <div className="mt-2 flex items-center gap-2 text-xs text-muted">
                    {m.feedback ? <Badge tone={m.feedback.rating === 'HELPFUL' ? 'success' : 'warning'}>{m.feedback.rating === 'HELPFUL' ? 'Marked helpful' : 'Flagged as incorrect'}</Badge> : (<>
                      <button onClick={() => rate.mutate({ mid: m.id, rating: 'HELPFUL' })} className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-white"><ThumbsUp className="size-3.5" aria-hidden />Helpful</button>
                      <button onClick={() => rate.mutate({ mid: m.id, rating: 'INCORRECT' })} className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-white"><ThumbsDown className="size-3.5" aria-hidden />Incorrect</button>
                    </>)}
                  </div>
                </>
              )}
            </div>
          </div>
        ))}
        {sendMsg.isPending && <div className="flex items-center gap-2 text-sm text-muted"><Sparkles className="size-4 animate-pulse text-accent" aria-hidden />Thinking…</div>}
        <div ref={endRef} />
      </div>
      {err && <div role="alert" className="mx-5 mb-2 flex items-center justify-between gap-3 rounded-lg bg-danger/8 px-3 py-2 text-sm text-danger"><span>{err.message}</span>{err.details?.retryable && <Button size="sm" variant="secondary" onClick={() => sendMsg.mutate()}>Retry</Button>}</div>}
      <form onSubmit={(e) => { e.preventDefault(); sendMsg.mutate(); }} className="border-t border-line p-4">
        <div role="radiogroup" aria-label="Kind of help" className="mb-3 flex flex-wrap gap-2">
          {MODES.map((m) => (
            <button key={m.id} type="button" role="radio" aria-checked={mode === m.id} title={m.desc} onClick={() => setMode(m.id)}
              className={cx('rounded-full border px-3 py-1 text-xs font-medium', mode === m.id ? 'border-primary bg-primary text-white' : 'border-line hover:bg-cloud')}>
              {m.id === 'HINT' && <Lightbulb className="mr-1 inline size-3" aria-hidden />}{m.label}
            </button>
          ))}
        </div>
        {files.length > 0 && <div className="mb-2 flex flex-wrap gap-2">{files.map((f, i) => <span key={i} className="inline-flex items-center gap-1 rounded-full bg-cloud px-2 py-1 text-xs">{f.name}<button type="button" onClick={() => setFiles(files.filter((_, j) => j !== i))} aria-label={`Remove ${f.name}`}><X className="size-3" /></button></span>)}</div>}
        <div className="flex items-end gap-2">
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,application/pdf" multiple className="hidden" onChange={(e) => { setFiles([...files, ...Array.from(e.target.files ?? [])].slice(0, 3)); e.target.value = ''; }} />
          <button type="button" onClick={() => fileRef.current?.click()} className="rounded-lg border border-line p-2.5 hover:bg-cloud" aria-label="Attach photo or PDF"><ImagePlus className="size-5 text-muted" /></button>
          <label htmlFor="ai-input" className="sr-only">Your question</label>
          <textarea id="ai-input" rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder="Describe the problem or what you're stuck on…"
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (text.trim() || files.length) sendMsg.mutate(); } }}
            className="min-h-11 flex-1 resize-none rounded-lg border border-line px-3 py-2 text-sm focus:border-primary focus:outline-none" />
          <Button type="submit" loading={sendMsg.isPending} disabled={!configured || (!text.trim() && !files.length)} aria-label="Send"><Send className="size-4" aria-hidden /></Button>
        </div>
        <p className="mt-2 text-xs text-muted">AI answers can be wrong — check them against your course material. Unavailable during quizzes when your instructor requires it.</p>
      </form>
      {dialog}
    </Card>
  );
}
