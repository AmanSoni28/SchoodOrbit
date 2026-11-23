import { useState } from 'react';
import { Megaphone } from 'lucide-react';
import { send } from '../../../lib/api';
import { useAct, useGet } from '../../../lib/hooks';
import { fmtDateTime } from '../../../lib/format';
import { Button, Card, EmptyState, Input, QueryView, Textarea } from '../../../components/ui';
import type { TabProps } from '../OfferingPage';

export default function AnnouncementsTab({ offeringId, access }: TabProps) {
  const path = `/offerings/${offeringId}/announcements`;
  const q = useGet<any[]>(path);
  const [f, setF] = useState({ title: '', body: '' });
  const save = useAct(() => send('POST', path, f), { success: 'Announcement posted and students notified', invalidate: [path, '/announcements'], onDone: () => setF({ title: '', body: '' }) });
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="space-y-3 lg:col-span-2">
        <QueryView q={q} empty={<EmptyState icon={<Megaphone className="size-6" />} title="No announcements yet" />}>
          {(rows) => rows.map((a) => (
            <Card key={a.id}><div className="text-xs text-muted">{a.author.firstName} {a.author.lastName} · {fmtDateTime(a.createdAt)}</div><h3 className="mt-1 font-semibold text-navy">{a.title}</h3><p className="mt-2 whitespace-pre-wrap text-sm">{a.body}</p></Card>
          ))}
        </QueryView>
      </div>
      {access.isInstructor && (
        <Card title="Post an announcement">
          <form onSubmit={(e) => { e.preventDefault(); save.mutate(); }} className="space-y-3">
            <Input label="Title" required value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
            <Textarea label="Message" required rows={5} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} />
            <Button type="submit" loading={save.isPending} className="w-full">Post & notify students</Button>
          </form>
        </Card>
      )}
    </div>
  );
}
