import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Lock, MessageSquare, PenSquare, Search, Send } from 'lucide-react';
import { get, send } from '../../lib/api';
import { useAct, useGet } from '../../lib/hooks';
import { ROLE_LABEL, type Role } from '../../lib/auth';
import { fmtDate, fromNow } from '../../lib/format';
import { Button, EmptyState, LoadingBlock, Modal, QueryView, cx } from '../../components/ui';

type Person = { id: string; name: string; email: string; roles: Role[]; courses: string[]; children: string[] };
type ConvRow = { id: string; unread: number; lastMessageAt: string; with: Person; last: { body: string; mine: boolean; at: string } | null };
type Msg = { id: string; body: string; mine: boolean; createdAt: string };
type Thread = { id: string; with: Person; canReply: boolean; hasMore: boolean; otherReadAt: string | null; messages: Msg[] };

const initials = (n: string) => n.split(' ').map((x) => x[0]).slice(0, 2).join('').toUpperCase();
const ROLE_TINT: Partial<Record<Role, string>> = { COLLEGE_ADMIN: 'from-navy to-[#4a5f9e]', FACULTY: 'from-accent to-[#5fd6cb]', STUDENT: 'from-primary to-[#7a94ff]', PARENT: 'from-gold to-[#f7d08a]' };
/** "Faculty · CS301, CS303" / "Parent of Diya Patel" / "College Admin" */
const context = (p: Person) => {
  const r = p.roles.includes('COLLEGE_ADMIN') ? 'COLLEGE_ADMIN' : p.roles[0];
  if (p.roles.includes('PARENT') && p.children.length) return `Parent of ${p.children.join(', ')}`;
  return [r && ROLE_LABEL[r], p.roles.includes('FACULTY') && p.courses.length ? p.courses.join(', ') : ''].filter(Boolean).join(' · ');
};
const Avatar = ({ p, size = 'md' }: { p: Person; size?: 'md' | 'lg' }) => (
  <span className={cx('grid shrink-0 place-items-center rounded-full bg-gradient-to-br font-semibold text-white', ROLE_TINT[p.roles.includes('COLLEGE_ADMIN') ? 'COLLEGE_ADMIN' : p.roles[0]] ?? 'from-muted to-muted', size === 'lg' ? 'size-11 text-sm' : 'size-10 text-xs')} aria-hidden>{initials(p.name)}</span>
);
const time = (d: string) => new Date(d).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
const dayLabel = (d: string) => { const x = new Date(d).toDateString(), t = new Date(); return x === t.toDateString() ? 'Today' : x === new Date(t.getTime() - 86400000).toDateString() ? 'Yesterday' : fmtDate(d); };

export default function Messages() {
  const { id } = useParams();
  const nav = useNavigate();
  const convs = useGet<ConvRow[]>('/conversations', { refetchInterval: 15_000 });
  const [draft, setDraft] = useState<Person | null>(null); // a new conversation before its first message
  const [picker, setPicker] = useState(false);
  const [filter, setFilter] = useState('');
  useEffect(() => { if (id) setDraft(null); }, [id]);

  const start = (p: Person) => {
    setPicker(false);
    const existing = convs.data?.find((c) => c.with.id === p.id);
    if (existing) nav(`/messages/${existing.id}`); else { setDraft(p); nav('/messages'); }
  };
  const showThread = !!id || !!draft;
  const rows = (convs.data ?? []).filter((c) => !filter || c.with.name.toLowerCase().includes(filter.toLowerCase()));

  return (
    // Fills the viewport under the 4rem top bar minus the page padding; each pane scrolls on its own.
    <div className="flex h-[calc(100dvh-7rem)] min-h-[28rem] lg:h-[calc(100dvh-8rem)] overflow-hidden rounded-2xl border border-line/80 bg-white shadow-[0_1px_3px_rgba(16,27,58,0.05)]">
      <aside className={cx('flex w-full flex-col border-r border-line/70 md:w-80 lg:w-96', showThread && 'hidden md:flex')} aria-label="Conversations">
        <div className="flex items-center justify-between gap-2 border-b border-line/70 p-4">
          <h1 className="text-lg font-bold text-navy">Messages</h1>
          <Button size="sm" onClick={() => setPicker(true)}><PenSquare className="size-4" aria-hidden />New</Button>
        </div>
        <div className="border-b border-line/70 p-3">
          <label className="relative block">
            <span className="sr-only">Search conversations</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
            <input type="search" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Search conversations"
              className="w-full rounded-lg border border-line bg-cloud/60 py-2 pl-9 pr-3 text-sm focus:border-primary focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary/20" />
          </label>
        </div>
        <div className="flex-1 overflow-y-auto">
          {convs.isLoading ? <div className="p-3"><LoadingBlock rows={5} /></div> : !rows.length ? (
            <div className="p-6 text-center text-sm text-muted">{filter ? 'No matches.' : <>No conversations yet.<br /><button className="mt-2 font-medium text-primary" onClick={() => setPicker(true)}>Start one</button></>}</div>
          ) : (
            <ul>
              {rows.map((c) => (
                <li key={c.id}>
                  <Link to={`/messages/${c.id}`} className={cx('flex gap-3 border-b border-line/50 px-4 py-3 transition hover:bg-cloud/70', c.id === id && 'bg-primary/[.06]')}>
                    <Avatar p={c.with} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-2">
                        <span className={cx('truncate text-sm', c.unread ? 'font-bold text-navy' : 'font-semibold text-ink')}>{c.with.name}</span>
                        <span className="shrink-0 text-[11px] text-muted">{c.last && fromNow(c.last.at)}</span>
                      </span>
                      <span className="block truncate text-[11px] text-muted">{context(c.with)}</span>
                      <span className="mt-0.5 flex items-center gap-2">
                        <span className={cx('min-w-0 flex-1 truncate text-xs', c.unread ? 'font-medium text-ink' : 'text-muted')}>{c.last ? `${c.last.mine ? 'You: ' : ''}${c.last.body}` : ''}</span>
                        {c.unread > 0 && <span className="grid min-w-5 place-items-center rounded-full bg-primary px-1.5 text-[10px] font-bold text-white" aria-label={`${c.unread} unread`}>{c.unread}</span>}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>

      <section className={cx('min-w-0 flex-1 flex-col', showThread ? 'flex' : 'hidden md:flex')}>
        {id ? <ThreadView key={id} id={id} />
          : draft ? <DraftView person={draft} onCancel={() => setDraft(null)} />
          : <div className="grid flex-1 place-items-center p-6"><EmptyState icon={<MessageSquare className="size-6" />} title="Select a conversation" body="Or start a new one with your instructors, students, parents or the college office." action={<Button onClick={() => setPicker(true)}>New message</Button>} /></div>}
      </section>

      <ContactPicker open={picker} onClose={() => setPicker(false)} onPick={start} />
    </div>
  );
}

function Header({ p, onBack }: { p: Person; onBack: () => void }) {
  return (
    <header className="flex items-center gap-3 border-b border-line/70 px-4 py-3">
      <button onClick={onBack} className="rounded-lg p-1.5 text-muted hover:bg-cloud md:hidden" aria-label="Back to conversations"><ArrowLeft className="size-5" /></button>
      <Avatar p={p} size="lg" />
      <div className="min-w-0">
        <h2 className="truncate font-semibold text-navy">{p.name}</h2>
        <p className="truncate text-xs text-muted">{context(p)}</p>
      </div>
    </header>
  );
}

function ThreadView({ id }: { id: string }) {
  const nav = useNavigate();
  const qc = useQueryClient();
  const q = useGet<Thread>(`/conversations/${id}`, { refetchInterval: 5_000 });
  const [older, setOlder] = useState<Msg[]>([]);
  const [moreLeft, setMoreLeft] = useState<boolean | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const t = q.data;
  const lastId = t?.messages.at(-1)?.id;

  // Opening the thread marks it read on the server; refresh the list and the sidebar badge.
  useEffect(() => { qc.invalidateQueries({ queryKey: ['/conversations'] }); qc.invalidateQueries({ queryKey: ['/messages/unread'] }); }, [lastId, qc]);
  // Keep the newest message in view when one arrives.
  useEffect(() => { const el = scroller.current; if (el) el.scrollTop = el.scrollHeight; }, [lastId]);

  const loadOlder = async () => {
    const first = (older[0] ?? t!.messages[0]);
    const el = scroller.current, prevHeight = el?.scrollHeight ?? 0;
    setLoadingOlder(true);
    try {
      const page = await get<Thread>(`/conversations/${id}?before=${encodeURIComponent(first.createdAt)}`);
      setOlder((o) => [...page.messages, ...o]);
      setMoreLeft(page.hasMore);
      requestAnimationFrame(() => { if (el) el.scrollTop = el.scrollHeight - prevHeight; }); // stay at the same message
    } finally { setLoadingOlder(false); }
  };

  return (
    <QueryView q={q} rows={6}>
      {(t) => {
        const all = [...older, ...t.messages];
        const lastMine = [...all].reverse().find((m) => m.mine);
        const seen = lastMine && t.otherReadAt && t.otherReadAt >= lastMine.createdAt;
        return (
          <>
            <Header p={t.with} onBack={() => nav('/messages')} />
            <div ref={scroller} className="flex-1 space-y-1 overflow-y-auto bg-cloud/40 px-4 py-4 sm:px-6" aria-live="polite">
              {(moreLeft ?? t.hasMore) && <div className="pb-2 text-center"><Button size="sm" variant="secondary" loading={loadingOlder} onClick={loadOlder}>Load earlier messages</Button></div>}
              {!all.length && <p className="py-10 text-center text-sm text-muted">No messages yet. Say hello 👋</p>}
              {all.map((m, i) => {
                const prev = all[i - 1];
                const newDay = !prev || new Date(prev.createdAt).toDateString() !== new Date(m.createdAt).toDateString();
                const grouped = prev && !newDay && prev.mine === m.mine && Date.parse(m.createdAt) - Date.parse(prev.createdAt) < 5 * 60_000;
                return (
                  <div key={m.id}>
                    {newDay && <div className="my-4 text-center"><span className="rounded-full bg-white px-3 py-1 text-[11px] font-medium text-muted shadow-sm">{dayLabel(m.createdAt)}</span></div>}
                    <div className={cx('flex', m.mine ? 'justify-end' : 'justify-start', !grouped && 'mt-2')}>
                      <div className={cx('max-w-[78%] rounded-2xl px-3.5 py-2 text-sm shadow-sm sm:max-w-[65%]', m.mine ? 'rounded-br-md bg-primary text-white' : 'rounded-bl-md bg-white text-ink')}>
                        <p className="whitespace-pre-wrap break-words">{m.body}</p>
                        <p className={cx('mt-0.5 text-right text-[10px]', m.mine ? 'text-white/70' : 'text-muted')}>{time(m.createdAt)}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
              {seen && <p className="pr-1 text-right text-[11px] text-muted">Seen</p>}
            </div>
            {t.canReply ? <Composer recipientId={t.with.id} />
              : <p className="flex items-center gap-2 border-t border-line/70 px-4 py-3 text-sm text-muted"><Lock className="size-4" aria-hidden />You can no longer message {t.with.name.split(' ')[0]}. The course or family link has ended.</p>}
          </>
        );
      }}
    </QueryView>
  );
}

function DraftView({ person, onCancel }: { person: Person; onCancel: () => void }) {
  const nav = useNavigate();
  return (
    <>
      <Header p={person} onBack={onCancel} />
      <div className="grid flex-1 place-items-center bg-cloud/40 p-6 text-center text-sm text-muted">Start your conversation with {person.name}.</div>
      <Composer recipientId={person.id} onSent={(cid) => nav(`/messages/${cid}`)} />
    </>
  );
}

function Composer({ recipientId, onSent }: { recipientId: string; onSent?: (conversationId: string) => void }) {
  const [body, setBody] = useState('');
  const box = useRef<HTMLTextAreaElement>(null);
  const post = useAct(() => send<{ conversationId: string }>('POST', '/messages', { recipientId, body }), {
    invalidate: ['/conversations', '/messages/unread'],
    onDone: (r) => { setBody(''); box.current?.focus(); onSent?.(r.conversationId); },
  });
  const submit = () => { if (body.trim() && !post.isPending) post.mutate(); };
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); submit(); } };
  return (
    <form onSubmit={(e) => { e.preventDefault(); submit(); }} className="flex items-end gap-2 border-t border-line/70 bg-white p-3">
      <label className="flex-1">
        <span className="sr-only">Message</span>
        <textarea ref={box} value={body} onChange={(e) => setBody(e.target.value)} onKeyDown={onKey} rows={1} maxLength={4000} autoFocus placeholder="Type a message…"
          className="field-sizing-content max-h-40 min-h-10 w-full resize-none rounded-xl border border-line bg-cloud/60 px-3.5 py-2.5 text-sm focus:border-primary focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary/20" />
      </label>
      <Button type="submit" loading={post.isPending} disabled={!body.trim()} aria-label="Send message" className="h-10 !px-3"><Send className="size-4" aria-hidden /></Button>
    </form>
  );
}

function ContactPicker({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (p: Person) => void }) {
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  useEffect(() => { const h = setTimeout(() => setDebounced(search.trim()), 250); return () => clearTimeout(h); }, [search]);
  const q = useGet<Person[]>(open ? `/messages/contacts${debounced ? `?search=${encodeURIComponent(debounced)}` : ''}` : null);
  return (
    <Modal open={open} onClose={onClose} title="New message">
      <label className="relative mb-3 block">
        <span className="sr-only">Search people</span>
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
        <input type="search" autoFocus value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name or email"
          className="w-full rounded-lg border border-line py-2 pl-9 pr-3 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20" />
      </label>
      <p className="mb-2 text-xs text-muted">You can message the college office and people connected to your courses or family.</p>
      <div className="max-h-80 overflow-y-auto">
        <QueryView q={q} rows={4} isEmpty={(d) => !d.length} empty={<p className="py-6 text-center text-sm text-muted">No one found.</p>}>
          {(people) => (
            <ul className="divide-y divide-line/60">
              {people.map((p) => (
                <li key={p.id}>
                  <button onClick={() => onPick(p)} className="flex w-full items-center gap-3 rounded-lg px-2 py-2.5 text-left hover:bg-cloud">
                    <Avatar p={p} />
                    <span className="min-w-0"><span className="block truncate text-sm font-medium text-navy">{p.name}</span><span className="block truncate text-xs text-muted">{context(p)}</span></span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </QueryView>
      </div>
    </Modal>
  );
}
