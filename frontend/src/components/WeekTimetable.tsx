import { Link } from 'react-router-dom';
import { Clock, MapPin, Pencil, User, Video } from 'lucide-react';
import { cx } from './ui';

export type Slot = {
  id: string; dayOfWeek: number; startTime: string; endTime: string; room: string | null; kind: 'LECTURE' | 'LAB' | 'TUTORIAL';
  offering: { id: string; meetingUrl: string | null; course: { code: string; title: string }; section: string | null; instructors: string[] };
};

export const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const KIND: Record<Slot['kind'], { label: string; cls: string }> = {
  LECTURE: { label: 'Lecture', cls: 'border-l-primary bg-primary/[.06]' },
  LAB: { label: 'Lab', cls: 'border-l-accent bg-accent/[.08]' },
  TUTORIAL: { label: 'Tutorial', cls: 'border-l-gold bg-gold/[.12]' },
};

/** 1 = Monday … 7 = Sunday, and "HH:MM", in the viewer's local time. */
export const nowLocal = () => { const d = new Date(); return { day: d.getDay() || 7, time: d.toTimeString().slice(0, 5) }; };

export function SlotCard({ s, show, now, onEdit }: { s: Slot; show: 'instructor' | 'section'; now?: boolean; onEdit?: (s: Slot) => void }) {
  const k = KIND[s.kind];
  const who = show === 'instructor' ? s.offering.instructors.join(', ') : s.offering.section;
  return (
    <div className={cx('group relative rounded-xl border border-line/70 border-l-4 p-3 text-sm', k.cls, now && 'ring-2 ring-primary/40')}>
      <div className="flex items-center justify-between gap-2 text-xs text-muted">
        <span className="inline-flex items-center gap-1 font-medium text-ink"><Clock className="size-3.5" aria-hidden />{s.startTime}–{s.endTime}</span>
        {now ? <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">Now</span> : <span>{k.label}</span>}
      </div>
      <Link to={`/offerings/${s.offering.id}`} className="mt-1.5 block font-semibold text-navy hover:text-primary">{s.offering.course.code}</Link>
      <div className="line-clamp-2 text-xs text-muted">{s.offering.course.title}</div>
      <div className="mt-2 space-y-0.5 text-xs text-muted">
        {s.room && <div className="flex items-center gap-1"><MapPin className="size-3.5 shrink-0" aria-hidden />{s.room}</div>}
        {who && <div className="flex items-center gap-1"><User className="size-3.5 shrink-0" aria-hidden /><span className="truncate">{who}</span></div>}
        {s.offering.meetingUrl && !onEdit && <a href={s.offering.meetingUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1 font-medium text-primary hover:underline"><Video className="size-3.5" aria-hidden />Join online</a>}
      </div>
      {onEdit && (
        <button onClick={() => onEdit(s)} className="absolute right-2 bottom-2 rounded-lg p-1.5 text-muted hover:bg-white hover:text-primary" aria-label={`Edit ${s.offering.course.code} on ${DAYS[s.dayOfWeek - 1]} at ${s.startTime}`}>
          <Pencil className="size-3.5" aria-hidden />
        </button>
      )}
    </div>
  );
}

/** Monday–Saturday columns (Sunday only when used). Stacks into a day list on small screens. */
export function WeekTimetable({ slots, show, onEdit }: { slots: Slot[]; show: 'instructor' | 'section'; onEdit?: (s: Slot) => void }) {
  const { day, time } = nowLocal();
  const days = slots.some((s) => s.dayOfWeek === 7) ? [1, 2, 3, 4, 5, 6, 7] : [1, 2, 3, 4, 5, 6];
  return (
    <div className={cx('grid gap-3 md:grid-cols-3', days.length === 7 ? 'xl:grid-cols-7' : 'xl:grid-cols-6')}>
      {days.map((d) => {
        const list = slots.filter((s) => s.dayOfWeek === d);
        const today = d === day;
        return (
          <section key={d} aria-label={DAYS[d - 1]} className={cx('rounded-2xl border bg-white p-3', today ? 'border-primary/50 shadow-[0_8px_24px_-12px_rgba(60,90,255,0.35)]' : 'border-line/70')}>
            <h3 className={cx('mb-3 flex items-center justify-between px-1 text-sm font-semibold', today ? 'text-primary' : 'text-navy')}>
              {DAYS[d - 1]}{today && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px]">Today</span>}
            </h3>
            <div className="space-y-2">
              {list.length ? list.map((s) => <SlotCard key={s.id} s={s} show={show} onEdit={onEdit} now={today && s.startTime <= time && time < s.endTime} />)
                : <p className="rounded-xl border border-dashed border-line px-3 py-6 text-center text-xs text-muted">No classes</p>}
            </div>
          </section>
        );
      })}
    </div>
  );
}
