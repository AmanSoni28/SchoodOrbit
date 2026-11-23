import { useState } from 'react';
import { Link } from 'react-router-dom';
import { MessageSquare, Plus } from 'lucide-react';
import { send } from '../../../lib/api';
import { useAct, useGet } from '../../../lib/hooks';
import { fromNow } from '../../../lib/format';
import { Badge, Button, EmptyState, Input, Modal, QueryView, Textarea } from '../../../components/ui';
import type { TabProps } from '../OfferingPage';

export default function DiscussionsTab({ offeringId }: TabProps) {
  const path = `/offerings/${offeringId}/threads`;
  const q = useGet<any[]>(path);
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ title: '', body: '' });
  const save = useAct(() => send('POST', path, f), { success: 'Discussion started', invalidate: [path], onDone: () => { setOpen(false); setF({ title: '', body: '' }); } });
  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-3"><p className="text-sm text-muted">Named course discussions. For anonymous questions use the Doubt board.</p><Button onClick={() => setOpen(true)}><Plus className="size-4" aria-hidden />New discussion</Button></div>
      <QueryView q={q} empty={<EmptyState title="No discussions yet" />}>
        {(rows) => (
          <ul className="divide-y divide-line rounded-xl border border-line bg-white">
            {rows.map((t) => (
              <li key={t.id}><Link to={`/threads/${t.id}`} className="flex items-center justify-between gap-3 p-4 hover:bg-cloud">
                <div><div className="font-medium text-navy">{t.title} {t.isHidden && <Badge tone="danger">Hidden</Badge>}</div><div className="text-xs text-muted">{t.author.firstName} {t.author.lastName} · {fromNow(t.createdAt)}</div></div>
                <span className="inline-flex items-center gap-1 text-sm text-muted"><MessageSquare className="size-4" aria-hidden />{t._count.posts}</span>
              </Link></li>
            ))}
          </ul>
        )}
      </QueryView>
      <Modal open={open} onClose={() => setOpen(false)} title="New discussion">
        <form onSubmit={(e) => { e.preventDefault(); save.mutate(); }} className="space-y-4">
          <Input label="Title" required minLength={3} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
          <Textarea label="Message" required rows={5} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} />
          <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" loading={save.isPending}>Post</Button></div>
        </form>
      </Modal>
    </>
  );
}
