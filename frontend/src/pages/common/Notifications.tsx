import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Bell } from 'lucide-react';
import { api, send } from '../../lib/api';
import { useAct } from '../../lib/hooks';
import { fromNow } from '../../lib/format';
import { Button, EmptyState, PageHeader, QueryView, cx } from '../../components/ui';

export default function Notifications() {
  const [page, setPage] = useState(1);
  const q = useQuery({ queryKey: ['/notifications', page], queryFn: () => api(`/notifications?page=${page}&pageSize=20`) });
  const inv = ['/notifications', ['notifications', 'unread']] as any;
  const readAll = useAct(() => send('POST', '/notifications/read-all'), { invalidate: inv });
  const read = useAct((id: string) => send('POST', `/notifications/${id}/read`), { invalidate: inv });
  return (
    <>
      <PageHeader title="Notifications" actions={<Button variant="secondary" size="sm" onClick={() => readAll.mutate()}>Mark all as read</Button>} />
      <QueryView q={q} empty={<EmptyState icon={<Bell className="size-6" />} title="You're all caught up" />} isEmpty={(d: any) => d.data.length === 0}>
        {(d: any) => (
          <>
            <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-white">
              {d.data.map((n: any) => (
                <li key={n.id} className={cx('flex items-start gap-3 p-4', !n.readAt && 'bg-primary/5')}>
                  <span className={cx('mt-1.5 size-2 shrink-0 rounded-full', n.readAt ? 'bg-transparent' : 'bg-primary')} aria-hidden />
                  <div className="min-w-0 flex-1">
                    {n.link ? <Link to={n.link} onClick={() => !n.readAt && read.mutate(n.id)} className="font-medium text-ink hover:text-primary">{n.title}</Link> : <span className="font-medium">{n.title}</span>}
                    {n.body && <p className="text-sm text-muted">{n.body}</p>}
                    <p className="text-xs text-muted">{fromNow(n.createdAt)}{!n.readAt && <span className="sr-only"> (unread)</span>}</p>
                  </div>
                  {!n.readAt && <button onClick={() => read.mutate(n.id)} className="text-xs font-medium text-primary">Mark read</button>}
                </li>
              ))}
            </ul>
            <div className="mt-4 flex items-center justify-between text-sm">
              <Button size="sm" variant="secondary" disabled={page === 1} onClick={() => setPage(page - 1)}>Previous</Button>
              <span className="text-muted">Page {page} of {Math.max(1, Math.ceil(d.meta.total / 20))}</span>
              <Button size="sm" variant="secondary" disabled={page * 20 >= d.meta.total} onClick={() => setPage(page + 1)}>Next</Button>
            </div>
          </>
        )}
      </QueryView>
    </>
  );
}
