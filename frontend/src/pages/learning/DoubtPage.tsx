import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowBigUp, ChevronLeft, Flag, GraduationCap, ShieldAlert, ThumbsUp } from 'lucide-react';
import { send } from '../../lib/api';
import { useAct, useGet } from '../../lib/hooks';
import { fmtDateTime, fromNow } from '../../lib/format';
import { Badge, Button, Card, Input, Modal, QueryView, StatusBadge, Textarea, cx, useToast } from '../../components/ui';

export default function DoubtPage() {
  const { id } = useParams() as { id: string };
  const path = `/doubts/${id}`;
  const q = useGet<any>(path);
  const [reply, setReply] = useState('');
  const [reporting, setReporting] = useState(false);
  const [revealing, setRevealing] = useState(false);
  const inv = [path, '/offerings/'];
  const post = useAct(() => send('POST', `${path}/replies`, { body: reply }), { success: 'Reply posted', invalidate: inv, onDone: () => setReply('') });
  const status = useAct((body: object) => send('PATCH', `${path}/status`, body), { success: 'Updated', invalidate: inv });
  const useful = useAct(({ rid, v }: { rid: string; v: boolean }) => send('POST', `/doubt-replies/${rid}/useful`, { useful: v }), { invalidate: inv });
  const vote = useAct((voted: boolean) => (voted ? send('DELETE', `${path}/votes`) : send('POST', `${path}/votes`)), { invalidate: inv });

  return (
    <QueryView q={q} rows={4}>
      {(d) => (
        <>
          <Link to={`/offerings/${d.offeringId}?tab=doubts`} className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-ink"><ChevronLeft className="size-4" aria-hidden />Doubt board</Link>
          <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
            <div className="space-y-4">
              <Card>
                <div className="flex gap-4">
                  <div className="flex flex-col items-center">
                    <button disabled={d.mine || d.canModerate} onClick={() => vote.mutate(d.voted)} aria-pressed={d.voted} aria-label={d.voted ? 'Remove upvote' : 'Upvote'} className={cx('rounded-lg p-1.5', d.voted ? 'bg-primary text-white' : 'text-muted hover:bg-cloud')}><ArrowBigUp className="size-6" /></button>
                    <span className="font-semibold">{d.voteCount}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap gap-2"><StatusBadge status={d.status} />{d.mine && <Badge tone="primary">Your doubt</Badge>}{d.topic && <Badge>{d.topic.name}</Badge>}{d.lesson && <Link to={`/lessons/${d.lesson.id}`}><Badge>{d.lesson.title}</Badge></Link>}</div>
                    <h1 className="mt-2 text-xl font-bold text-navy">{d.title}</h1>
                    <p className="mt-2 whitespace-pre-wrap text-sm">{d.body}</p>
                    <p className="mt-3 text-xs text-muted">{d.authorLabel} · {fmtDateTime(d.createdAt)}</p>
                  </div>
                </div>
              </Card>
              <h2 className="text-sm font-semibold text-navy">{d.replies.length} {d.replies.length === 1 ? 'reply' : 'replies'}</h2>
              {d.replies.map((r: any) => (
                <div key={r.id} className={cx('rounded-xl border bg-white p-4', r.isFaculty ? 'border-accent/40' : 'border-line')}>
                  <div className="mb-1 flex items-center gap-2 text-xs">
                    {r.isFaculty ? <span className="inline-flex items-center gap-1 font-semibold text-success"><GraduationCap className="size-4" aria-hidden />{r.authorLabel}</span> : <span className="text-muted">{r.mine ? 'You (shown anonymously)' : r.authorLabel}</span>}
                    <span className="text-muted">· {fromNow(r.createdAt)}</span>
                    {r.isUseful && <Badge tone="success"><ThumbsUp className="size-3" aria-hidden />Marked useful</Badge>}
                  </div>
                  <p className="whitespace-pre-wrap text-sm">{r.body}</p>
                  {d.mine && <button onClick={() => useful.mutate({ rid: r.id, v: !r.isUseful })} className="mt-2 text-xs font-medium text-primary">{r.isUseful ? 'Unmark useful' : 'Mark as useful'}</button>}
                </div>
              ))}
              {d.status !== 'HIDDEN' && (
                <Card>
                  <form onSubmit={(e) => { e.preventDefault(); post.mutate(); }} className="space-y-3">
                    <Textarea label={d.canModerate ? 'Answer as faculty' : 'Add a reply (anonymous)'} rows={4} required value={reply} onChange={(e) => setReply(e.target.value)} />
                    <Button type="submit" loading={post.isPending}>Post reply</Button>
                  </form>
                </Card>
              )}
            </div>
            <aside className="space-y-4">
              {d.mine && d.status !== 'RESOLVED' && <Card><Button className="w-full" variant="accent" onClick={() => status.mutate({ status: 'RESOLVED' })}>Mark my doubt resolved</Button></Card>}
              {d.canModerate && (
                <Card title="Moderation">
                  <div className="flex flex-col gap-2">
                    <Button size="sm" variant="secondary" onClick={() => status.mutate({ isPinned: !d.isPinned })}>{d.isPinned ? 'Unpin' : 'Pin to top'}</Button>
                    {d.status !== 'RESOLVED' && <Button size="sm" variant="secondary" onClick={() => status.mutate({ status: 'RESOLVED' })}>Mark resolved</Button>}
                    {d.status !== 'HIDDEN' ? <Button size="sm" variant="danger" onClick={() => status.mutate({ status: 'HIDDEN' })}>Hide from students</Button> : <Button size="sm" variant="secondary" onClick={() => status.mutate({ status: 'OPEN' })}>Restore</Button>}
                    {d.canRevealIdentity && <Button size="sm" variant="ghost" onClick={() => setRevealing(true)}><ShieldAlert className="size-4" aria-hidden />Identify author…</Button>}
                  </div>
                  {d.reports?.length > 0 && <div className="mt-4"><h3 className="mb-1 text-xs font-semibold uppercase text-muted">Reports</h3><ul className="space-y-1 text-xs">{d.reports.map((r: any) => <li key={r.id}><StatusBadge status={r.status} /> {r.reason}</li>)}</ul></div>}
                  {d.moderation?.length > 0 && <div className="mt-4"><h3 className="mb-1 text-xs font-semibold uppercase text-muted">Moderation log</h3><ul className="space-y-1 text-xs text-muted">{d.moderation.map((m: any) => <li key={m.id}>{m.action.replace(/_/g, ' ').toLowerCase()} · {m.moderator.firstName} · {fromNow(m.createdAt)}</li>)}</ul></div>}
                </Card>
              )}
              {!d.mine && <button onClick={() => setReporting(true)} className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-danger"><Flag className="size-4" aria-hidden />Report this doubt</button>}
            </aside>
          </div>
          {reporting && <ReportModal id={id} onClose={() => setReporting(false)} />}
          {revealing && <RevealModal id={id} onClose={() => setRevealing(false)} />}
        </>
      )}
    </QueryView>
  );
}

function ReportModal({ id, onClose }: { id: string; onClose: () => void }) {
  const [reason, setReason] = useState('');
  const save = useAct(() => send('POST', `/doubts/${id}/reports`, { reason }), { success: 'Reported to moderators', onDone: onClose });
  return (
    <Modal open onClose={onClose} title="Report doubt">
      <form onSubmit={(e) => { e.preventDefault(); save.mutate(); }} className="space-y-4">
        <Input label="Reason" required minLength={3} value={reason} onChange={(e) => setReason(e.target.value)} />
        <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" variant="danger" loading={save.isPending}>Report</Button></div>
      </form>
    </Modal>
  );
}

function RevealModal({ id, onClose }: { id: string; onClose: () => void }) {
  const [reason, setReason] = useState('');
  const [author, setAuthor] = useState<any>(null);
  const toast = useToast();
  const save = useAct(() => send('POST', `/doubts/${id}/reveal-identity`, { reason }), { onDone: (a) => { setAuthor(a); toast.success('Identity revealed — this action was logged'); } });
  return (
    <Modal open onClose={onClose} title="Identify the author">
      {author ? <p className="text-sm"><strong>{author.firstName} {author.lastName}</strong> ({author.email})</p> : (
        <form onSubmit={(e) => { e.preventDefault(); save.mutate(); }} className="space-y-4">
          <p className="rounded-lg bg-gold/15 p-3 text-sm">Anonymity is a promise to students. Only reveal an author for a genuine conduct or safety concern. Your name and reason are permanently recorded in the moderation and audit logs.</p>
          <Textarea label="Reason (required)" required minLength={10} rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
          <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" variant="danger" loading={save.isPending}>Reveal identity</Button></div>
        </form>
      )}
    </Modal>
  );
}
