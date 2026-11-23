import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, ChevronLeft, FileText, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { send } from '../../lib/api';
import { useAct, useGet } from '../../lib/hooks';
import { fmtDateTime } from '../../lib/format';
import { Markdown } from '../../components/Markdown';
import { Badge, Button, Card, LoadingBlock, Modal, QueryView, Select, StatusBadge, Textarea, cx } from '../../components/ui';

const TITLES: Record<string, string> = { NOTES: 'Study notes', SUMMARY: 'Summary', FLASHCARDS: 'Flashcards', MCQ: 'Multiple-choice questions', DESCRIPTIVE: 'Descriptive questions' };
const area = 'w-full rounded-lg border border-line px-3 py-2 text-sm focus:border-primary focus:outline-none';

export default function AIJobPage() {
  const { id } = useParams() as { id: string };
  const path = `/ai/content/jobs/${id}`;
  const [poll, setPoll] = useState<number | false>(false);
  const q = useGet<any>(path, { refetchInterval: poll });
  useEffect(() => { setPoll(q.data && ['QUEUED', 'PROCESSING'].includes(q.data.status) ? 2500 : false); }, [q.data?.status]);
  const retry = useAct(() => send('POST', `${path}/retry`), { success: 'Retrying', invalidate: [path] });
  return (
    <QueryView q={q} rows={5}>
      {(j) => {
        const draft = j.drafts[0];
        return (
          <>
            <Link to={`/offerings/${j.offeringId}?tab=ai`} className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-ink"><ChevronLeft className="size-4" aria-hidden />AI generator</Link>
            <div className="mb-6 flex flex-wrap items-center gap-3"><h1 className="text-2xl font-bold text-navy">{TITLES[j.type]}</h1><StatusBadge status={j.status} />{draft && <StatusBadge status={draft.reviewStatus} />}</div>
            <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
              <div>
                {['QUEUED', 'PROCESSING'].includes(j.status) && <Card><LoadingBlock rows={3} /><p className="mt-3 text-sm text-muted">Generating from your sources… this can take a minute. You can leave this page.</p></Card>}
                {j.status === 'FAILED' && <Card><p className="flex items-center gap-2 font-medium text-danger"><AlertTriangle className="size-5" aria-hidden />{j.error}</p><Button className="mt-4" variant="secondary" loading={retry.isPending} onClick={() => retry.mutate()}><RotateCcw className="size-4" aria-hidden />Retry</Button></Card>}
                {draft && <DraftReview job={j} draftId={draft.id} />}
              </div>
              <aside className="space-y-4">
                <Card title="Sources">
                  <ul className="space-y-1 text-sm">
                    {j.sources.map((s: any) => s.fileAsset && <li key={s.id} className="flex items-center gap-1.5"><FileText className="size-4 text-muted" aria-hidden />{s.fileAsset.originalName}</li>)}
                    {j.settings.useLessonContent && j.lesson && <li className="flex items-center gap-1.5"><FileText className="size-4 text-muted" aria-hidden />Lesson: {j.lesson.title}</li>}
                  </ul>
                </Card>
                {j.drafts.length > 0 && (
                  <Card title="Version history">
                    <ul className="space-y-2 text-sm">{j.drafts.map((d: any) => (
                      <li key={d.id}><div className="flex items-center justify-between"><span>v{d.version}</span><StatusBadge status={d.reviewStatus} /></div><div className="text-xs text-muted">{fmtDateTime(d.createdAt)}{d.approvals[0] ? ` · ${d.approvals[0].decision.toLowerCase()}` : ''}</div></li>
                    ))}</ul>
                  </Card>
                )}
              </aside>
            </div>
          </>
        );
      }}
    </QueryView>
  );
}

function DraftReview({ job, draftId }: { job: any; draftId: string }) {
  const path = `/ai/content/drafts/${draftId}`;
  const jobPath = `/ai/content/jobs/${job.id}`;
  const q = useGet<any>(path);
  const [editing, setEditing] = useState<any>(null);
  const [publishing, setPublishing] = useState(false);
  const inv = [jobPath, path, '/ai/content/jobs'];
  const saveEdit = useAct(() => send('PATCH', path, { structuredContent: editing }), { success: 'Saved as a new version', invalidate: inv, onDone: () => setEditing(null) });
  const decide = useAct((decision: string) => send('POST', `${path}/approve`, { decision }), { success: 'Review recorded', invalidate: inv });
  if (q.isLoading) return <LoadingBlock />;
  if (!q.data) return null;
  const d = q.data, c = editing ?? d.structuredContent;
  const isQ = job.type === 'MCQ' || job.type === 'DESCRIPTIVE';
  return (
    <Card title={`Draft v${d.version}`} action={
      <div className="flex flex-wrap gap-2">
        {d.reviewStatus !== 'PUBLISHED' && !editing && <Button size="sm" variant="secondary" onClick={() => setEditing(structuredClone(d.structuredContent))}>Edit</Button>}
        {editing && <><Button size="sm" variant="secondary" onClick={() => setEditing(null)}>Cancel</Button><Button size="sm" loading={saveEdit.isPending} onClick={() => saveEdit.mutate()}>Save version</Button></>}
      </div>}>
      <p className="mb-4 rounded-lg bg-gold/15 p-3 text-xs">AI-generated draft. Check every fact and answer against your sources before approving. Students see nothing until you publish.</p>
      {c.sourceGaps?.length > 0 && <div className="mb-4 rounded-lg border border-gold/50 p-3 text-sm"><p className="font-medium">Not supported by the sources:</p><ul className="list-disc pl-5 text-muted">{c.sourceGaps.map((g: string, i: number) => <li key={i}>{g}</li>)}</ul></div>}
      {editing ? <Editor type={job.type} value={editing} onChange={setEditing} /> : <Preview type={job.type} c={c} />}
      {!editing && (
        <div className="mt-6 flex flex-wrap gap-2 border-t border-line pt-4">
          {d.reviewStatus === 'PENDING' && <><Button variant="accent" loading={decide.isPending} onClick={() => decide.mutate('APPROVED')}><CheckCircle2 className="size-4" aria-hidden />Approve</Button><Button variant="secondary" onClick={() => decide.mutate('REJECTED')}>Reject</Button></>}
          {d.reviewStatus === 'REJECTED' && <Button variant="secondary" onClick={() => decide.mutate('APPROVED')}>Approve after all</Button>}
          {d.reviewStatus === 'APPROVED' && <Button onClick={() => setPublishing(true)}>{isQ ? 'Add to question bank' : 'Publish to a lesson'}</Button>}
          {d.reviewStatus === 'PUBLISHED' && <Badge tone="success">Published</Badge>}
        </div>
      )}
      {publishing && <Publish job={job} draftId={draftId} isQ={isQ} onClose={() => setPublishing(false)} inv={inv} />}
    </Card>
  );
}

function Publish({ job, draftId, isQ, onClose, inv }: { job: any; draftId: string; isQ: boolean; onClose: () => void; inv: string[] }) {
  const modules = useGet<any[]>(`/offerings/${job.offeringId}/modules`);
  const topics = useGet<any[]>(`/offerings/${job.offeringId}/topics`);
  const [target, setTarget] = useState(job.lessonId ?? '');
  const go = useAct(() => (isQ ? send('POST', `/ai/content/drafts/${draftId}/add-to-question-bank`, { topicId: target || null }) : send('POST', `/ai/content/drafts/${draftId}/publish`, { lessonId: target })), {
    success: isQ ? 'Questions added to the bank as approved' : 'Appended to the lesson', invalidate: [...inv, `/offerings/${job.offeringId}`], onDone: onClose,
  });
  return (
    <Modal open onClose={onClose} title={isQ ? 'Add to question bank' : 'Publish to lesson'}>
      <form onSubmit={(e) => { e.preventDefault(); go.mutate(); }} className="space-y-4">
        {isQ ? (
          <Select label="Topic for these questions" value={target} onChange={(e) => setTarget(e.target.value)} hint="Topics drive insights and daily revision."><option value="">No topic</option>{topics.data?.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select>
        ) : (
          <Select label="Lesson" required value={target} onChange={(e) => setTarget(e.target.value)} hint="Content is appended to the lesson. The lesson's own publish status is unchanged."><option value="">Choose…</option>{modules.data?.flatMap((m) => m.lessons).map((l: any) => <option key={l.id} value={l.id}>{l.title}</option>)}</Select>
        )}
        <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" loading={go.isPending} disabled={!isQ && !target}>Confirm</Button></div>
      </form>
    </Modal>
  );
}

function Preview({ type, c }: { type: string; c: any }) {
  if (type === 'NOTES' || type === 'SUMMARY') return <Markdown text={[`## ${c.title}`, ...c.sections.map((s: any) => `### ${s.heading}\n${s.body}`), c.keyPoints.length ? `### Key points\n${c.keyPoints.map((k: string) => `- ${k}`).join('\n')}` : ''].join('\n\n')} />;
  if (type === 'FLASHCARDS') return <ul className="grid gap-3 sm:grid-cols-2">{c.cards.map((x: any, i: number) => <li key={i} className="rounded-xl border border-line p-3 text-sm"><div className="font-semibold">{x.front}</div><div className="mt-1 text-muted">{x.back}</div></li>)}</ul>;
  if (type === 'MCQ') return (
    <ol className="space-y-4">{c.questions.map((x: any, i: number) => (
      <li key={i} className="text-sm"><p className="font-medium">{i + 1}. {x.prompt} <Badge>{x.difficulty}</Badge></p>
        <ul className="mt-1 space-y-0.5">{x.options.map((o: string, k: number) => <li key={k} className={cx(k === x.correctIndex ? 'font-medium text-success' : 'text-muted')}>{k === x.correctIndex ? '✓' : '○'} {o}</li>)}</ul>
        <p className="mt-1 text-xs text-muted">{x.explanation}</p></li>
    ))}</ol>
  );
  return <ol className="space-y-4">{c.questions.map((x: any, i: number) => <li key={i} className="text-sm"><p className="font-medium">{i + 1}. {x.prompt} <Badge>{x.difficulty}</Badge></p><p className="mt-1"><span className="text-muted">Model answer:</span> {x.modelAnswer}</p><ul className="mt-1 list-disc pl-5 text-xs text-muted">{x.rubricPoints.map((r: string, k: number) => <li key={k}>{r}</li>)}</ul></li>)}</ol>;
}

// Structured editor per draft type — validated again on the server.
function Editor({ type, value, onChange }: { type: string; value: any; onChange: (v: any) => void }) {
  const upd = (fn: (v: any) => void) => { const v = structuredClone(value); fn(v); onChange(v); };
  const Rm = ({ onClick, label }: { onClick: () => void; label: string }) => <button type="button" onClick={onClick} aria-label={label} className="rounded p-1 text-muted hover:bg-cloud"><Trash2 className="size-4" /></button>;
  if (type === 'NOTES' || type === 'SUMMARY') return (
    <div className="space-y-4">
      <input aria-label="Title" className={cx(area, 'font-semibold')} value={value.title} onChange={(e) => upd((v) => (v.title = e.target.value))} />
      {value.sections.map((s: any, i: number) => (
        <div key={i} className="space-y-1 rounded-xl border border-line p-3">
          <div className="flex gap-2"><input aria-label={`Section ${i + 1} heading`} className={area} value={s.heading} onChange={(e) => upd((v) => (v.sections[i].heading = e.target.value))} /><Rm label="Remove section" onClick={() => upd((v) => v.sections.splice(i, 1))} /></div>
          <textarea aria-label={`Section ${i + 1} body`} rows={5} className={area} value={s.body} onChange={(e) => upd((v) => (v.sections[i].body = e.target.value))} />
        </div>
      ))}
      <Button size="sm" variant="ghost" onClick={() => upd((v) => v.sections.push({ heading: 'New section', body: '' }))}><Plus className="size-4" aria-hidden />Section</Button>
      <Textarea label="Key points (one per line)" rows={4} value={value.keyPoints.join('\n')} onChange={(e) => upd((v) => (v.keyPoints = e.target.value.split('\n').filter(Boolean)))} />
    </div>
  );
  if (type === 'FLASHCARDS') return (
    <div className="space-y-2">{value.cards.map((c: any, i: number) => (
      <div key={i} className="flex gap-2"><input aria-label={`Card ${i + 1} front`} className={area} value={c.front} onChange={(e) => upd((v) => (v.cards[i].front = e.target.value))} /><input aria-label={`Card ${i + 1} back`} className={area} value={c.back} onChange={(e) => upd((v) => (v.cards[i].back = e.target.value))} /><Rm label="Remove card" onClick={() => upd((v) => v.cards.splice(i, 1))} /></div>
    ))}<Button size="sm" variant="ghost" onClick={() => upd((v) => v.cards.push({ front: '', back: '' }))}><Plus className="size-4" aria-hidden />Card</Button></div>
  );
  if (type === 'MCQ') return (
    <div className="space-y-4">{value.questions.map((x: any, i: number) => (
      <div key={i} className="space-y-2 rounded-xl border border-line p-3">
        <div className="flex gap-2"><textarea aria-label={`Question ${i + 1}`} rows={2} className={area} value={x.prompt} onChange={(e) => upd((v) => (v.questions[i].prompt = e.target.value))} /><Rm label="Remove question" onClick={() => upd((v) => v.questions.splice(i, 1))} /></div>
        {x.options.map((o: string, k: number) => (
          <label key={k} className="flex items-center gap-2"><input type="radio" name={`c${i}`} checked={x.correctIndex === k} onChange={() => upd((v) => (v.questions[i].correctIndex = k))} aria-label={`Option ${k + 1} correct`} /><input aria-label={`Option ${k + 1}`} className={area} value={o} onChange={(e) => upd((v) => (v.questions[i].options[k] = e.target.value))} /></label>
        ))}
        <textarea aria-label="Explanation" rows={2} className={area} value={x.explanation} onChange={(e) => upd((v) => (v.questions[i].explanation = e.target.value))} />
      </div>
    ))}</div>
  );
  return (
    <div className="space-y-4">{value.questions.map((x: any, i: number) => (
      <div key={i} className="space-y-2 rounded-xl border border-line p-3">
        <div className="flex gap-2"><textarea aria-label={`Question ${i + 1}`} rows={2} className={area} value={x.prompt} onChange={(e) => upd((v) => (v.questions[i].prompt = e.target.value))} /><Rm label="Remove question" onClick={() => upd((v) => v.questions.splice(i, 1))} /></div>
        <textarea aria-label="Model answer" rows={3} className={area} value={x.modelAnswer} onChange={(e) => upd((v) => (v.questions[i].modelAnswer = e.target.value))} />
        <textarea aria-label="Rubric points, one per line" rows={3} className={area} value={x.rubricPoints.join('\n')} onChange={(e) => upd((v) => (v.questions[i].rubricPoints = e.target.value.split('\n').filter(Boolean)))} />
      </div>
    ))}</div>
  );
}

