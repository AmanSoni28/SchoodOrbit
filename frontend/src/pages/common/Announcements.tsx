import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Megaphone } from 'lucide-react';
import { send } from '../../lib/api';
import { useAct, useGet } from '../../lib/hooks';
import { useAuth } from '../../lib/auth';
import { fmtDateTime } from '../../lib/format';
import { Badge, Button, Card, EmptyState, Input, PageHeader, QueryView, Textarea, useConfirm } from '../../components/ui';

export default function Announcements() {
  const { role } = useAuth();
  const q = useGet<any[]>('/announcements');
  const [f, setF] = useState({ title: '', body: '' });
  const { confirm, dialog } = useConfirm();
  const post = useAct(() => send('POST', '/announcements', f), { success: 'Announcement sent to everyone', invalidate: ['/announcements'], onDone: () => setF({ title: '', body: '' }) });
  return (
    <>
      <PageHeader title="Announcements" subtitle="College-wide and course announcements." />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-3 lg:col-span-2">
          <QueryView q={q} empty={<EmptyState icon={<Megaphone className="size-6" />} title="No announcements" />}>
            {(rows) => rows.map((a) => (
              <Card key={a.id}>
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted">{a.offering ? <Link to={`/offerings/${a.offering.id}`}><Badge tone="primary">{a.offering.course.code}</Badge></Link> : <Badge tone="navy">College</Badge>}{a.author.firstName} {a.author.lastName} · {fmtDateTime(a.createdAt)}</div>
                <h2 className="mt-2 font-semibold text-navy">{a.title}</h2>
                <p className="mt-1 whitespace-pre-wrap text-sm">{a.body}</p>
              </Card>
            ))}
          </QueryView>
        </div>
        {role === 'COLLEGE_ADMIN' && (
          <Card title="New college-wide announcement">
            <form onSubmit={async (e) => { e.preventDefault(); if (await confirm({ title: 'Send to everyone?', body: 'Every active user will receive a notification.', confirm: 'Send' })) post.mutate(); }} className="space-y-3">
              <Input label="Title" required value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
              <Textarea label="Message" required rows={6} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} />
              <Button type="submit" className="w-full" loading={post.isPending}>Send announcement</Button>
            </form>
          </Card>
        )}
      </div>
      {dialog}
    </>
  );
}
