import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ChevronLeft, EyeOff } from 'lucide-react';
import { send } from '../../lib/api';
import { useAct, useGet } from '../../lib/hooks';
import { fromNow } from '../../lib/format';
import { Badge, Button, Card, QueryView, Textarea, cx } from '../../components/ui';

export default function ThreadPage() {
  const { id } = useParams() as { id: string };
  const path = `/threads/${id}`;
  const q = useGet<any>(path);
  const [body, setBody] = useState('');
  const post = useAct(() => send('POST', `${path}/posts`, { body }), { success: 'Reply posted', invalidate: [path], onDone: () => setBody('') });
  const hideThread = useAct((hidden: boolean) => send('PATCH', `${path}/hide`, { hidden }), { success: 'Updated', invalidate: [path, '/offerings/'] });
  const hidePost = useAct(({ pid, hidden }: { pid: string; hidden: boolean }) => send('PATCH', `/posts/${pid}/hide`, { hidden }), { success: 'Updated', invalidate: [path] });
  return (
    <QueryView q={q} rows={4}>
      {(t) => (
        <div className="max-w-3xl">
          <Link to={`/offerings/${t.offeringId}?tab=discussions`} className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-ink"><ChevronLeft className="size-4" aria-hidden />Discussions</Link>
          <Card>
            <div className="flex items-start justify-between gap-3">
              <div><h1 className="text-xl font-bold text-navy">{t.title} {t.isHidden && <Badge tone="danger">Hidden</Badge>}</h1><p className="text-xs text-muted">{t.author.firstName} {t.author.lastName} · {fromNow(t.createdAt)}</p></div>
              {t.canModerate && <Button size="sm" variant="ghost" onClick={() => hideThread.mutate(!t.isHidden)}><EyeOff className="size-4" aria-hidden />{t.isHidden ? 'Unhide' : 'Hide'}</Button>}
            </div>
            <p className="mt-3 whitespace-pre-wrap text-sm">{t.body}</p>
          </Card>
          <ul className="mt-4 space-y-3">
            {t.posts.map((p: any) => (
              <li key={p.id} className={cx('rounded-xl border border-line bg-white p-4', p.isHidden && 'opacity-60')}>
                <div className="flex items-center justify-between text-xs text-muted"><span><span className="font-medium text-ink">{p.author.firstName} {p.author.lastName}</span> · {fromNow(p.createdAt)} {p.isHidden && '(hidden)'}</span>
                  {t.canModerate && <button onClick={() => hidePost.mutate({ pid: p.id, hidden: !p.isHidden })} className="text-primary">{p.isHidden ? 'Unhide' : 'Hide'}</button>}</div>
                <p className="mt-1 whitespace-pre-wrap text-sm">{p.body}</p>
              </li>
            ))}
          </ul>
          {!t.isHidden && (
            <Card className="mt-4">
              <form onSubmit={(e) => { e.preventDefault(); post.mutate(); }} className="space-y-3">
                <Textarea label="Reply" rows={3} required value={body} onChange={(e) => setBody(e.target.value)} />
                <Button type="submit" loading={post.isPending}>Post reply</Button>
              </form>
            </Card>
          )}
        </div>
      )}
    </QueryView>
  );
}
