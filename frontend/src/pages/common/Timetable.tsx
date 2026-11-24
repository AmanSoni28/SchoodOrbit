import { CalendarClock } from 'lucide-react';
import { useGet } from '../../lib/hooks';
import { useAuth } from '../../lib/auth';
import { Card, EmptyState, PageHeader, QueryView } from '../../components/ui';
import { DAYS, SlotCard, WeekTimetable, nowLocal, type Slot } from '../../components/WeekTimetable';

export default function Timetable() {
  const { role } = useAuth();
  const q = useGet<Slot[]>('/timetable/me', { refetchInterval: 5 * 60_000 });
  const teaching = role === 'FACULTY';
  return (
    <>
      <PageHeader title="Timetable" subtitle={teaching ? 'Your weekly teaching schedule across all sections.' : 'Your weekly class schedule for this semester.'} />
      <QueryView q={q} isEmpty={(d) => !d.length} empty={<EmptyState icon={<CalendarClock className="size-6" />} title="No timetable yet" body="The college office hasn't published a timetable for your courses yet." />}>
        {(slots) => {
          const { day, time } = nowLocal();
          const today = slots.filter((s) => s.dayOfWeek === day);
          const left = today.filter((s) => s.endTime > time);
          const hours = slots.reduce((h, s) => h + (Date.parse(`1970-01-01T${s.endTime}`) - Date.parse(`1970-01-01T${s.startTime}`)) / 3600000, 0);
          return (
            <div className="space-y-6">
              <Card title={`Today · ${DAYS[day - 1]}`} subtitle={today.length ? `${left.length} of ${today.length} class${today.length > 1 ? 'es' : ''} still to go` : undefined}
                action={<span className="text-xs text-muted">{slots.length} classes · {+hours.toFixed(1)} h per week</span>}>
                {left.length
                  ? <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{left.map((s) => <SlotCard key={s.id} s={s} show={teaching ? 'section' : 'instructor'} now={s.startTime <= time} />)}</div>
                  : <p className="text-sm text-muted">{today.length ? "You're done for today." : 'No classes today.'}</p>}
              </Card>
              <WeekTimetable slots={slots} show={teaching ? 'section' : 'instructor'} />
            </div>
          );
        }}
      </QueryView>
    </>
  );
}
