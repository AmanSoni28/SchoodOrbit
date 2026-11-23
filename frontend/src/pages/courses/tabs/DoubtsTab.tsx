import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowBigUp, EyeOff, MessageSquare, Pin, Plus, ShieldQuestion } from 'lucide-react';
import { send } from '../../../lib/api';
import { useAct, useGet } from '../../../lib/hooks';
import { fromNow } from '../../../lib/format';
import { Badge, Button, EmptyState, Input, Modal, QueryView, Select, StatusBadge, Tabs, Textarea, cx, fieldErrors } from '../../../components/ui';
import type { TabProps } from '../OfferingPage';

type Sort = 'votes' | 'recent' | 'unanswered' | 'answered';

export default function DoubtsTab({ offeringId, access }: TabProps) {
  const [sort, setSort] = useState<Sort>('votes');
  const [search, setSearch] = useState('');
  const [asking, setAsking] = useState(false);
  const path = `/offerings/${offeringId}/doubts?sort=${sort}${search ? `&search=${encodeURIComponent(search)}` : ''}`;
  const q = useGet<any[]>(path);
  const vote = useAct((d: any) => (d.voted ? send('DELETE', `/doubts/${d.id}/votes`) : send('POST', `/doubts/${d.id}/votes`)), { invalidate: [`/offerings/${offeringId}/doubts`] });
  return (
    <>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-primary/20 bg-primary/5 p-4 text-sm">
        <div className="flex gap-3"><ShieldQuestion className="size-5 shrink-0 text-primary" aria-hidden /><p><strong>Ask without hesitation.</strong> Your name is never shown to classmates or faculty. Only a college administrator can identify an author, for a recorded moderation reason.</p></div>
        {access.isStudent && <Button onClick={() => setAsking(true)}><Plus className="size-4" aria-hidden />Ask a doubt</Button>}
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex-1"><Tabs tabs={[{ id: 'votes', label: 'Most supported' }, { id: 'recent', label: 'Recent' }, { id: 'unanswered', label: 'Unanswered' }, { id: 'answered', label: 'Answered' }]} value={sort} onChange={setSort} /></div>
        <div className="mb-5 w-full sm:w-64"><Input label="Search doubts" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
      </div>
      <QueryView q={q} empty={<EmptyState title="No doubts here" body={access.isStudent ? 'Be the first to ask — it stays anonymous.' : 'Students have not posted doubts in this view.'} />}>
        {(rows) => (
          <ul className="space-y-3">
            {rows.map((d) => (
              <li key={d.id} className={cx('flex gap-4 rounded-xl border bg-white p-4', d.isPinned ? 'border-gold' : 'border-line')}>
                <div className="flex flex-col items-center">
                  <button disabled={!access.isStudent || d.mine || vote.isPending} onClick={() => vote.mutate(d)} aria-pressed={d.voted}
                    aria-label={d.voted ? 'Remove upvote' : d.mine ? 'You cannot upvote your own doubt' : 'Upvote'}
                    className={cx('rounded-lg p-1.5 transition disabled:cursor-default', d.voted ? 'bg-primary text-white' : 'text-muted hover:bg-cloud')}>
                    <ArrowBigUp className="size-5" />
                  </button>
                  <span className="text-sm font-semibold">{d.voteCount}</span>
                </div>
                <Link to={`/doubts/${d.id}`} className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    {d.isPinned && <Badge tone="warning"><Pin className="size-3" aria-hidden />Pinned</Badge>}
                    <StatusBadge status={d.status} />
                    {d.mine && <Badge tone="primary">Your doubt</Badge>}
                    {d.topic && <Badge>{d.topic.name}</Badge>}
                    {d.status === 'HIDDEN' && <EyeOff className="size-4 text-danger" aria-label="Hidden" />}
                  </div>
                  <h3 className="mt-1.5 font-semibold text-navy hover:text-primary">{d.title}</h3>
                  <p className="mt-0.5 line-clamp-2 text-sm text-muted">{d.body}</p>
                  <div className="mt-2 flex gap-4 text-xs text-muted"><span>{d.authorLabel} · {fromNow(d.createdAt)}</span><span className="inline-flex items-center gap-1"><MessageSquare className="size-3.5" aria-hidden />{d._count.replies}</span>{d.lesson && <span>Lesson: {d.lesson.title}</span>}{d._count.reports > 0 && <span className="text-danger">{d._count.reports} report(s)</span>}</div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </QueryView>
      {asking && <AskDoubt offeringId={offeringId} onClose={() => setAsking(false)} />}
    </>
  );
}

function AskDoubt({ offeringId, onClose }: { offeringId: string; onClose: () => void }) {
  const lessons = useGet<any[]>(`/offerings/${offeringId}/modules`);
  const topics = useGet<any[]>(`/offerings/${offeringId}/topics`);
  const [f, setF] = useState({ title: '', body: '', lessonId: '', topicId: '' });
  const save = useAct(() => send('POST', `/offerings/${offeringId}/doubts`, { title: f.title, body: f.body, lessonId: f.lessonId || undefined, topicId: f.topicId || undefined }), { success: 'Posted anonymously', invalidate: [`/offerings/${offeringId}/doubts`], onDone: onClose });
  const errs = fieldErrors(save.error);
  return (
    <Modal open onClose={onClose} title="Ask a doubt (anonymous)" wide>
      <form onSubmit={(e) => { e.preventDefault(); save.mutate(); }} className="space-y-4">
        <Input label="Your question in one line" required minLength={5} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} error={errs.title} />
        <Textarea label="Details" required rows={5} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} error={errs.body} hint="Explain what you tried and where you got stuck." />
        <div className="grid gap-4 sm:grid-cols-2">
          <Select label="Related lesson" value={f.lessonId} onChange={(e) => setF({ ...f, lessonId: e.target.value })}><option value="">None</option>{lessons.data?.flatMap((m) => m.lessons).map((l: any) => <option key={l.id} value={l.id}>{l.title}</option>)}</Select>
          <Select label="Topic" value={f.topicId} onChange={(e) => setF({ ...f, topicId: e.target.value })}><option value="">None</option>{topics.data?.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select>
        </div>
        <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" loading={save.isPending}>Post anonymously</Button></div>
      </form>
    </Modal>
  );
}
