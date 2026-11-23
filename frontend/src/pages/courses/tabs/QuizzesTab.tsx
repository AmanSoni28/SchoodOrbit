import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { send } from '../../../lib/api';
import { useAct, useGet } from '../../../lib/hooks';
import { fmtDateTime } from '../../../lib/format';
import { Badge, Button, EmptyState, Input, Modal, QueryView, StatusBadge, Table, Td, Textarea, fieldErrors } from '../../../components/ui';
import type { TabProps } from '../OfferingPage';

export default function QuizzesTab({ offeringId, access }: TabProps) {
  const path = `/offerings/${offeringId}/quizzes`;
  const q = useGet<any[]>(path);
  const [open, setOpen] = useState(false);
  const staff = access.isInstructor || access.isAdmin;
  return (
    <>
      {access.isInstructor && <div className="mb-4 flex justify-end"><Button onClick={() => setOpen(true)}><Plus className="size-4" aria-hidden />New quiz</Button></div>}
      <QueryView q={q} empty={<EmptyState title="No quizzes" body={access.isInstructor ? 'Build a quiz from approved question-bank items.' : 'No quizzes are open yet.'} />}>
        {(rows) => (
          <Table head={staff ? ['Quiz', 'Questions', 'Time limit', 'Closes', 'Status', 'Attempts'] : ['Quiz', 'Questions', 'Time limit', 'Closes', 'Your result']}>
            {rows.map((z) => {
              const best = z.attempts?.find((a: any) => a.status !== 'IN_PROGRESS');
              return (
                <tr key={z.id}>
                  <Td><Link to={`/quizzes/${z.id}`} className="font-medium text-primary hover:underline">{z.title}</Link></Td>
                  <Td>{z._count.questions}</Td>
                  <Td>{z.timeLimitMinutes ? `${z.timeLimitMinutes} min` : 'None'}</Td>
                  <Td>{fmtDateTime(z.closesAt)}</Td>
                  {staff ? (<><Td><StatusBadge status={z.status} />{z.resultsPublished && <span className="ml-1"><Badge tone="primary">Results out</Badge></span>}</Td><Td>{z._count.attempts}</Td></>) : (
                    <Td>{!z.attempts?.length ? <Badge tone="warning">Not attempted</Badge> : z.attempts[0].status === 'IN_PROGRESS' ? <Badge tone="warning">In progress</Badge> : best?.score !== null && best?.score !== undefined ? <Badge tone="success">{Number(best.score)}/{Number(best.maxScore)}</Badge> : <Badge tone="primary">Submitted</Badge>}</Td>
                  )}
                </tr>
              );
            })}
          </Table>
        )}
      </QueryView>
      {open && <QuizForm offeringId={offeringId} onClose={() => setOpen(false)} />}
    </>
  );
}

function QuizForm({ offeringId, onClose }: { offeringId: string; onClose: () => void }) {
  const nav = useNavigate();
  const qs = useGet<any[]>(`/offerings/${offeringId}/questions?status=APPROVED`);
  const [f, setF] = useState({ title: '', description: '', timeLimitMinutes: '', maxAttempts: 1, opensAt: '', closesAt: '' });
  const [picked, setPicked] = useState<string[]>([]);
  const set = (k: string, v: any) => setF((x) => ({ ...x, [k]: v }));
  const save = useAct(() => send('POST', `/offerings/${offeringId}/quizzes`, {
    title: f.title, description: f.description || null, timeLimitMinutes: f.timeLimitMinutes ? Number(f.timeLimitMinutes) : null, maxAttempts: Number(f.maxAttempts),
    opensAt: f.opensAt ? new Date(f.opensAt).toISOString() : null, closesAt: f.closesAt ? new Date(f.closesAt).toISOString() : null, questionIds: picked,
  }), { success: 'Quiz created as draft', invalidate: [`/offerings/${offeringId}/quizzes`], onDone: (z: any) => { onClose(); nav(`/quizzes/${z.id}`); } });
  const errs = fieldErrors(save.error);
  return (
    <Modal open onClose={onClose} title="New quiz" wide>
      <form onSubmit={(e) => { e.preventDefault(); save.mutate(); }} className="space-y-4">
        <Input label="Title" required value={f.title} onChange={(e) => set('title', e.target.value)} error={errs.title} />
        <Textarea label="Description" rows={2} value={f.description} onChange={(e) => set('description', e.target.value)} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Time limit (minutes)" type="number" min={1} value={f.timeLimitMinutes} onChange={(e) => set('timeLimitMinutes', e.target.value)} hint="Leave empty for no limit. Timed on the server." />
          <Input label="Attempts allowed" type="number" min={1} max={10} value={f.maxAttempts} onChange={(e) => set('maxAttempts', e.target.value)} />
          <Input label="Opens" type="datetime-local" value={f.opensAt} onChange={(e) => set('opensAt', e.target.value)} />
          <Input label="Closes" type="datetime-local" value={f.closesAt} onChange={(e) => set('closesAt', e.target.value)} />
        </div>
        <fieldset>
          <legend className="mb-2 text-sm font-medium">Questions ({picked.length} selected) — approved items only</legend>
          <QueryView q={qs} empty={<p className="text-sm text-muted">No approved questions. Add and approve questions in the Question bank tab first.</p>}>
            {(rows) => (
              <ul className="max-h-64 space-y-1 overflow-y-auto rounded-xl border border-line p-2">
                {rows.map((x) => (
                  <li key={x.id}>
                    <label className="flex cursor-pointer items-start gap-2 rounded-lg p-2 text-sm hover:bg-cloud">
                      <input type="checkbox" className="mt-0.5 size-4" checked={picked.includes(x.id)} onChange={(e) => setPicked((p) => (e.target.checked ? [...p, x.id] : p.filter((y) => y !== x.id)))} />
                      <span><span className="font-medium">{x.versions[0].prompt}</span><span className="block text-xs text-muted">{x.type} · {x.difficulty}{x.topic ? ` · ${x.topic.name}` : ''} · {x.versions[0].points} pt</span></span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </QueryView>
        </fieldset>
        <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" loading={save.isPending} disabled={!picked.length}>Create quiz</Button></div>
      </form>
    </Modal>
  );
}
