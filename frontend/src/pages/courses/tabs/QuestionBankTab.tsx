import { useState } from 'react';
import { History, Plus, Trash2 } from 'lucide-react';
import { send } from '../../../lib/api';
import { useAct, useGet } from '../../../lib/hooks';
import { fmtDateTime } from '../../../lib/format';
import { Badge, Button, EmptyState, Input, Modal, QueryView, Select, StatusBadge, Textarea, fieldErrors } from '../../../components/ui';
import type { TabProps } from '../OfferingPage';

const TYPES = { MCQ: 'Multiple choice (one answer)', MULTI: 'Multiple select', TRUE_FALSE: 'True / false', SHORT: 'Short / descriptive answer' } as const;

export default function QuestionBankTab({ offeringId, access }: TabProps) {
  const [filter, setFilter] = useState({ status: '', topicId: '', type: '' });
  const qsPath = `/offerings/${offeringId}/questions?${new URLSearchParams(Object.entries(filter).filter(([, v]) => v))}`;
  const q = useGet<any[]>(qsPath);
  const topics = useGet<any[]>(`/offerings/${offeringId}/topics`);
  const [edit, setEdit] = useState<any | 'new' | null>(null);
  const [history, setHistory] = useState<string | null>(null);
  return (
    <>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="w-40"><Select label="Status" value={filter.status} onChange={(e) => setFilter({ ...filter, status: e.target.value })}><option value="">All</option><option>DRAFT</option><option>APPROVED</option><option>ARCHIVED</option></Select></div>
        <div className="w-48"><Select label="Topic" value={filter.topicId} onChange={(e) => setFilter({ ...filter, topicId: e.target.value })}><option value="">All topics</option>{topics.data?.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select></div>
        <div className="w-56"><Select label="Type" value={filter.type} onChange={(e) => setFilter({ ...filter, type: e.target.value })}><option value="">All types</option>{Object.entries(TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></div>
        <div className="flex-1" />
        {access.isInstructor && <Button onClick={() => setEdit('new')}><Plus className="size-4" aria-hidden />New question</Button>}
      </div>
      <QueryView q={q} empty={<EmptyState title="No questions match" body="Questions are versioned: editing one keeps the old version for past attempts." />}>
        {(rows) => (
          <ul className="space-y-3">
            {rows.map((x) => {
              const v = x.versions[0];
              return (
                <li key={x.id} className="rounded-xl border border-line bg-white p-4">
                  <div className="flex flex-wrap items-center gap-2 text-xs"><StatusBadge status={x.status} /><Badge>{x.type}</Badge><Badge>{x.difficulty}</Badge>{x.topic && <Badge tone="primary">{x.topic.name}</Badge>}{x.source === 'AI' && <Badge tone="warning">AI-assisted</Badge>}<span className="text-muted">v{v.version} · {v.points} pt</span></div>
                  <p className="mt-2 font-medium">{v.prompt}</p>
                  {Array.isArray(v.options) && v.options.length > 0 && (
                    <ul className="mt-2 grid gap-1 text-sm sm:grid-cols-2">{v.options.map((o: any) => {
                      const correct = Array.isArray(v.correctAnswer) ? v.correctAnswer.includes(o.id) : v.correctAnswer === o.id;
                      return <li key={o.id} className={correct ? 'font-medium text-success' : 'text-muted'}>{correct ? '✓ ' : '○ '}{o.text}</li>;
                    })}</ul>
                  )}
                  {x.type === 'SHORT' && <p className="mt-1 text-xs text-muted">{v.correctAnswer?.length ? `Accepted: ${v.correctAnswer.join(', ')}` : 'Graded manually by faculty'}</p>}
                  <div className="mt-3 flex gap-2">
                    {access.isInstructor && <Button size="sm" variant="secondary" onClick={() => setEdit(x)}>Edit</Button>}
                    <Button size="sm" variant="ghost" onClick={() => setHistory(x.id)}><History className="size-4" aria-hidden />Versions</Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </QueryView>
      {edit && <QuestionForm offeringId={offeringId} topics={topics.data ?? []} question={edit === 'new' ? null : edit} onClose={() => setEdit(null)} />}
      {history && <VersionHistory id={history} onClose={() => setHistory(null)} />}
    </>
  );
}

function QuestionForm({ offeringId, topics, question, onClose }: { offeringId: string; topics: any[]; question: any | null; onClose: () => void }) {
  const v = question?.versions[0];
  const [type, setType] = useState<keyof typeof TYPES>(question?.type ?? 'MCQ');
  const [f, setF] = useState({ prompt: v?.prompt ?? '', explanation: v?.explanation ?? '', points: v?.points ?? 1, difficulty: question?.difficulty ?? 'MEDIUM', topicId: question?.topicId ?? '', status: question?.status ?? 'DRAFT' });
  const [options, setOptions] = useState<{ id: string; text: string }[]>(Array.isArray(v?.options) && v.options.length ? v.options : [{ id: 'a', text: '' }, { id: 'b', text: '' }, { id: 'c', text: '' }, { id: 'd', text: '' }]);
  const [answer, setAnswer] = useState<any>(v?.correctAnswer ?? (type === 'MULTI' ? [] : type === 'SHORT' ? [] : 'a'));
  const [accepted, setAccepted] = useState<string>(type === 'SHORT' && Array.isArray(v?.correctAnswer) ? v.correctAnswer.join('\n') : '');
  const [topicName, setTopicName] = useState('');
  const set = (k: string, val: any) => setF((x) => ({ ...x, [k]: val }));

  const save = useAct(async () => {
    let topicId = f.topicId || null;
    if (topicName.trim()) topicId = (await send('POST', `/offerings/${offeringId}/topics`, { name: topicName.trim() })).id;
    const correctAnswer = type === 'SHORT' ? accepted.split('\n').map((s) => s.trim()).filter(Boolean) : answer;
    const body = { prompt: f.prompt, explanation: f.explanation || null, points: Number(f.points), difficulty: f.difficulty, topicId, status: f.status, options: type === 'MCQ' || type === 'MULTI' ? options.filter((o) => o.text.trim()) : undefined, correctAnswer };
    return question ? send('PATCH', `/questions/${question.id}`, body) : send('POST', `/offerings/${offeringId}/questions`, { ...body, type });
  }, { success: question ? 'Saved (new version created if content changed)' : 'Question added', invalidate: [`/offerings/${offeringId}/questions`, `/offerings/${offeringId}/topics`], onDone: onClose });
  const errs = fieldErrors(save.error);

  return (
    <Modal open onClose={onClose} title={question ? 'Edit question' : 'New question'} wide>
      <form onSubmit={(e) => { e.preventDefault(); save.mutate(); }} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-3">
          <Select label="Type" value={type} disabled={!!question} onChange={(e) => { const t = e.target.value as keyof typeof TYPES; setType(t); setAnswer(t === 'MULTI' ? [] : t === 'TRUE_FALSE' ? 'true' : t === 'SHORT' ? [] : 'a'); }}>
            {Object.entries(TYPES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </Select>
          <Select label="Difficulty" value={f.difficulty} onChange={(e) => set('difficulty', e.target.value)}><option>EASY</option><option>MEDIUM</option><option>HARD</option></Select>
          <Input label="Points" type="number" min={1} max={100} value={f.points} onChange={(e) => set('points', e.target.value)} />
        </div>
        <Textarea label="Question" required rows={3} value={f.prompt} onChange={(e) => set('prompt', e.target.value)} error={errs.prompt} />
        {(type === 'MCQ' || type === 'MULTI') && (
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Options — mark the correct {type === 'MULTI' ? 'answers' : 'answer'}</legend>
            {options.map((o, i) => (
              <div key={o.id} className="flex items-center gap-2">
                <input type={type === 'MCQ' ? 'radio' : 'checkbox'} name="correct" aria-label={`Option ${i + 1} is correct`} className="size-4"
                  checked={type === 'MCQ' ? answer === o.id : (answer as string[]).includes(o.id)}
                  onChange={(e) => setAnswer(type === 'MCQ' ? o.id : e.target.checked ? [...answer, o.id] : answer.filter((a: string) => a !== o.id))} />
                <input aria-label={`Option ${i + 1}`} className="flex-1 rounded-lg border border-line px-3 py-2 text-sm" value={o.text} onChange={(e) => setOptions(options.map((x) => (x.id === o.id ? { ...x, text: e.target.value } : x)))} />
                {options.length > 2 && <button type="button" onClick={() => setOptions(options.filter((x) => x.id !== o.id))} className="rounded p-1.5 text-muted hover:bg-cloud" aria-label={`Remove option ${i + 1}`}><Trash2 className="size-4" /></button>}
              </div>
            ))}
            {options.length < 8 && <Button type="button" size="sm" variant="ghost" onClick={() => setOptions([...options, { id: 'abcdefgh'.split('').find((c) => !options.some((o) => o.id === c))!, text: '' }])}><Plus className="size-4" aria-hidden />Option</Button>}
            {errs.options && <p className="text-xs text-danger">{errs.options}</p>}
          </fieldset>
        )}
        {type === 'TRUE_FALSE' && <Select label="Correct answer" value={answer} onChange={(e) => setAnswer(e.target.value)}><option value="true">True</option><option value="false">False</option></Select>}
        {type === 'SHORT' && <Textarea label="Accepted answers (one per line)" rows={3} value={accepted} onChange={(e) => setAccepted(e.target.value)} hint="Leave empty for a descriptive answer that you grade manually." />}
        <Textarea label="Explanation (shown after answering)" rows={2} value={f.explanation} onChange={(e) => set('explanation', e.target.value)} />
        <div className="grid gap-4 sm:grid-cols-3">
          <Select label="Topic" value={f.topicId} onChange={(e) => set('topicId', e.target.value)}><option value="">No topic</option>{topics.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select>
          <Input label="…or new topic" value={topicName} onChange={(e) => setTopicName(e.target.value)} />
          <Select label="Status" value={f.status} onChange={(e) => set('status', e.target.value)} hint="Only approved questions can be used in quizzes and daily revision."><option>DRAFT</option><option>APPROVED</option><option>ARCHIVED</option></Select>
        </div>
        {save.error && !Object.keys(errs).length && <p role="alert" className="text-sm text-danger">{(save.error as Error).message}</p>}
        <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" loading={save.isPending}>Save</Button></div>
      </form>
    </Modal>
  );
}

function VersionHistory({ id, onClose }: { id: string; onClose: () => void }) {
  const q = useGet<any[]>(`/questions/${id}/versions`);
  return (
    <Modal open onClose={onClose} title="Version history" wide>
      <QueryView q={q}>{(rows) => (
        <ol className="space-y-3">{rows.map((v) => (
          <li key={v.id} className="rounded-lg border border-line p-3 text-sm"><div className="text-xs text-muted">Version {v.version} · {fmtDateTime(v.createdAt)} · {v.points} pt</div><p className="mt-1">{v.prompt}</p></li>
        ))}</ol>
      )}</QueryView>
    </Modal>
  );
}
