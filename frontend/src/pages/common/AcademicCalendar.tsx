import { useMemo, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, Plus, Trash2 } from 'lucide-react';
import { send } from '../../lib/api';
import { useAct, useGet } from '../../lib/hooks';
import { useAuth } from '../../lib/auth';
import { fmtDate } from '../../lib/format';
import { Button, Card, EmptyState, Input, Modal, PageHeader, QueryView, Select, Textarea, cx, fieldErrors, useConfirm } from '../../components/ui';

type Type = 'HOLIDAY' | 'EXAM' | 'DEADLINE' | 'EVENT' | 'BREAK' | 'ACADEMIC';
type Ev = { id: string; title: string; description: string | null; type: Type; startDate: string; endDate: string; readOnly: boolean };
type Form = { id?: string; title: string; description: string; type: Type; startDate: string; endDate: string };

const TYPE: Record<Type, { label: string; chip: string; dot: string; cell?: string }> = {
  HOLIDAY: { label: 'Holiday', chip: 'bg-danger/10 text-danger', dot: 'bg-danger', cell: 'bg-danger/[.04]' },
  BREAK: { label: 'Break', chip: 'bg-[#8b5cf6]/10 text-[#6d3fd8]', dot: 'bg-[#8b5cf6]', cell: 'bg-[#8b5cf6]/[.04]' },
  EXAM: { label: 'Exam', chip: 'bg-primary/10 text-primary', dot: 'bg-primary' },
  DEADLINE: { label: 'Deadline', chip: 'bg-gold/25 text-[#7a5310]', dot: 'bg-gold' },
  EVENT: { label: 'Event', chip: 'bg-accent/15 text-success', dot: 'bg-accent' },
  ACADEMIC: { label: 'Academic', chip: 'bg-navy/10 text-navy', dot: 'bg-navy' },
};
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// Calendar dates are plain YYYY-MM-DD strings built from local date parts, so time zones never shift a day.
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const plusDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const range = (e: Ev) => (e.endDate === e.startDate ? fmtDate(e.startDate + 'T00:00') : `${fmtDate(e.startDate + 'T00:00')} – ${fmtDate(e.endDate + 'T00:00')}`);
const daysUntil = (ymd: string, today: string) => Math.round((Date.parse(ymd) - Date.parse(today)) / 86400000);

export default function AcademicCalendar() {
  const { role } = useAuth();
  const canEdit = role === 'COLLEGE_ADMIN';
  const now = new Date(), today = iso(now);
  const [month, setMonth] = useState(new Date(now.getFullYear(), now.getMonth(), 1));
  const [hidden, setHidden] = useState<Set<Type>>(new Set());
  const [open, setOpen] = useState<Ev | null>(null);
  const [f, setF] = useState<Form | null>(null);
  const { confirm, dialog } = useConfirm();

  // Monday-first grid covering the whole month.
  const days = useMemo(() => {
    const first = plusDays(month, -((month.getDay() + 6) % 7));
    const last = new Date(month.getFullYear(), month.getMonth() + 1, 0);
    const n = Math.ceil((Math.round((last.getTime() - first.getTime()) / 86400000) + 1) / 7) * 7;
    return Array.from({ length: n }, (_, i) => plusDays(first, i));
  }, [month]);
  const q = useGet<Ev[]>(`/calendar?from=${iso(days[0])}&to=${iso(days[days.length - 1])}`);
  const upcoming = useGet<Ev[]>(`/calendar?from=${today}&to=${iso(plusDays(now, 120))}`);

  const save = useAct(() => {
    const { id, ...b } = f!;
    return id ? send('PUT', `/calendar/events/${id}`, b) : send('POST', '/calendar/events', b);
  }, { success: f?.id ? 'Event updated' : 'Event added', invalidate: ['/calendar'], onDone: () => setF(null) });
  const del = useAct((id: string) => send('DELETE', `/calendar/events/${id}`), { success: 'Event removed', invalidate: ['/calendar'], onDone: () => setF(null) });
  const errs = fieldErrors(save.error);
  const startForm = (v: Form) => { save.reset(); setOpen(null); setF(v); };
  const show = (e: Ev) => (canEdit && !e.readOnly ? startForm({ id: e.id, title: e.title, description: e.description ?? '', type: e.type, startDate: e.startDate, endDate: e.endDate }) : setOpen(e));
  const visible = (e: Ev) => !hidden.has(e.type);
  const toggle = (t: Type) => setHidden((h) => { const n = new Set(h); n.has(t) ? n.delete(t) : n.add(t); return n; });

  return (
    <>
      <PageHeader title="Academic calendar" subtitle="Semester dates, holidays, examinations, deadlines and campus events."
        actions={canEdit && <Button onClick={() => startForm({ title: '', description: '', type: 'EVENT', startDate: today, endDate: today })}><Plus className="size-4" aria-hidden />Add event</Button>} />

      <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
        <Card>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="sm" aria-label="Previous month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}><ChevronLeft className="size-4" /></Button>
              <h2 className="min-w-40 text-center text-lg font-semibold text-navy" aria-live="polite">{month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</h2>
              <Button variant="ghost" size="sm" aria-label="Next month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}><ChevronRight className="size-4" /></Button>
              <Button variant="secondary" size="sm" className="ml-2" onClick={() => setMonth(new Date(now.getFullYear(), now.getMonth(), 1))}>Today</Button>
            </div>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Show event types">
              {(Object.keys(TYPE) as Type[]).map((t) => (
                <button key={t} onClick={() => toggle(t)} aria-pressed={!hidden.has(t)}
                  className={cx('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition', hidden.has(t) ? 'border-line text-muted/60 line-through' : 'border-line bg-white text-ink hover:bg-cloud')}>
                  <span className={cx('size-2 rounded-full', TYPE[t].dot, hidden.has(t) && 'opacity-30')} />{TYPE[t].label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-7 border-b border-line pb-2 text-center text-[11px] font-semibold uppercase tracking-wider text-muted">
            {WEEKDAYS.map((d) => <div key={d}>{d}</div>)}
          </div>
          <QueryView q={q} rows={5}>
            {(events) => (
              <div className="grid grid-cols-7">
                {days.map((d) => {
                  const ymd = iso(d);
                  const list = events.filter((e) => visible(e) && e.startDate <= ymd && ymd <= e.endDate);
                  const off = list.find((e) => TYPE[e.type].cell);
                  const inMonth = d.getMonth() === month.getMonth();
                  const weekend = d.getDay() === 0 || d.getDay() === 6;
                  return (
                    <div key={ymd} className={cx('min-h-16 border-b border-r border-line/60 p-1 sm:min-h-28 sm:p-1.5 [&:nth-child(7n+1)]:border-l', off ? TYPE[off.type].cell : weekend && 'bg-cloud/50', !inMonth && 'opacity-45')}>
                      <div className={cx('mb-1 grid size-6 place-items-center rounded-full text-xs', ymd === today ? 'bg-primary font-bold text-white' : 'text-ink')}>{d.getDate()}</div>
                      {/* Small screens: dots. Larger: labelled chips. */}
                      <div className="flex flex-wrap gap-0.5 sm:hidden">{list.map((e) => <button key={e.id} onClick={() => show(e)} className={cx('size-2 rounded-full', TYPE[e.type].dot)} aria-label={`${e.title}, ${range(e)}`} />)}</div>
                      <div className="hidden space-y-0.5 sm:block">
                        {list.slice(0, 3).map((e) => (
                          <button key={e.id} onClick={() => show(e)} title={`${e.title} · ${range(e)}`}
                            className={cx('block w-full truncate rounded px-1.5 py-0.5 text-left text-[11px] font-medium hover:brightness-95', TYPE[e.type].chip)}>{e.title}</button>
                        ))}
                        {list.length > 3 && <button onClick={() => show(list[3])} className="px-1.5 text-[11px] text-muted hover:text-primary">+{list.length - 3} more</button>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </QueryView>
        </Card>

        <Card title="Coming up" subtitle="Next 4 months" className="xl:self-start">
          <QueryView q={upcoming} isEmpty={(d) => !d.filter(visible).length} empty={<EmptyState icon={<CalendarDays className="size-6" />} title="Nothing scheduled" />}>
            {(events) => (
              <ol className="space-y-3">
                {events.filter(visible).slice(0, 12).map((e) => {
                  const n = daysUntil(e.startDate, today);
                  return (
                    <li key={e.id}>
                      <button onClick={() => show(e)} className="flex w-full items-start gap-3 rounded-xl p-2 text-left hover:bg-cloud">
                        <span className={cx('mt-1.5 size-2.5 shrink-0 rounded-full', TYPE[e.type].dot)} />
                        <span className="min-w-0 flex-1">
                          <span className="block font-medium text-navy">{e.title}</span>
                          <span className="block text-xs text-muted">{range(e)} · {TYPE[e.type].label}</span>
                        </span>
                        <span className={cx('shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold', n <= 0 ? 'bg-primary text-white' : n <= 7 ? 'bg-gold/25 text-[#7a5310]' : 'bg-cloud text-muted')}>
                          {n < 0 ? 'Ongoing' : n === 0 ? 'Today' : n === 1 ? 'Tomorrow' : `${n} days`}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ol>
            )}
          </QueryView>
        </Card>
      </div>

      <Modal open={!!open} onClose={() => setOpen(null)} title={open?.title ?? ''}>
        {open && (
          <div className="space-y-3 text-sm">
            <div className="flex flex-wrap items-center gap-2"><span className={cx('rounded-full px-2.5 py-0.5 text-xs font-medium', TYPE[open.type].chip)}>{TYPE[open.type].label}</span><span className="text-muted">{range(open)}</span></div>
            {open.description && <p className="whitespace-pre-wrap">{open.description}</p>}
            {canEdit && open.readOnly && <p className="text-xs text-muted">Semester dates are managed under Academic structure.</p>}
          </div>
        )}
      </Modal>

      <Modal open={!!f} onClose={() => setF(null)} title={f?.id ? 'Edit event' : 'Add event'}>
        {f && (
          <form onSubmit={(e) => { e.preventDefault(); save.mutate(); }} className="space-y-4">
            <Input label="Title" required minLength={3} maxLength={120} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} error={errs.title} />
            <Select label="Type" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value as Type })}>
              {(Object.keys(TYPE) as Type[]).map((t) => <option key={t} value={t}>{TYPE[t].label}</option>)}
            </Select>
            <div className="grid gap-3 sm:grid-cols-2">
              <Input label="Starts" type="date" required value={f.startDate} onChange={(e) => setF({ ...f, startDate: e.target.value, endDate: f.endDate < e.target.value ? e.target.value : f.endDate })} error={errs.startDate} />
              <Input label="Ends" type="date" required min={f.startDate} value={f.endDate} onChange={(e) => setF({ ...f, endDate: e.target.value })} error={errs.endDate} hint="Same as start for a one-day event" />
            </div>
            <Textarea label="Details" rows={3} maxLength={1000} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} error={errs.description} />
            <div className="flex items-center justify-between gap-2 pt-1">
              {f.id
                ? <Button type="button" variant="ghost" className="text-danger" loading={del.isPending}
                    onClick={async () => { if (await confirm({ title: 'Remove this event?', body: 'It will disappear from everyone\'s calendar.', confirm: 'Remove', danger: true })) del.mutate(f.id!); }}>
                    <Trash2 className="size-4" aria-hidden />Remove</Button>
                : <span />}
              <div className="flex gap-2">
                <Button type="button" variant="secondary" onClick={() => setF(null)}>Cancel</Button>
                <Button type="submit" loading={save.isPending}>{f.id ? 'Save changes' : 'Add event'}</Button>
              </div>
            </div>
          </form>
        )}
      </Modal>
      {dialog}
    </>
  );
}
