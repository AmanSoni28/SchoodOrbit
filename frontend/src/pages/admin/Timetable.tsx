import { useEffect, useState } from 'react';
import { CalendarClock, Plus, Trash2 } from 'lucide-react';
import { send } from '../../lib/api';
import { useAct, useGet } from '../../lib/hooks';
import { Button, EmptyState, Input, Modal, PageHeader, QueryView, Select, fieldErrors, useConfirm } from '../../components/ui';
import { DAYS, WeekTimetable, type Slot } from '../../components/WeekTimetable';

type Offering = { id: string; status: string; course: { code: string; title: string }; semester: { name: string }; instructors: { faculty: { firstName: string; lastName: string } }[] };
type Form = { id?: string; offeringId: string; dayOfWeek: string; startTime: string; endTime: string; room: string; kind: string };
const blank = (offeringId = ''): Form => ({ offeringId, dayOfWeek: '1', startTime: '09:00', endTime: '10:00', room: '', kind: 'LECTURE' });

export default function TimetableAdmin() {
  const sections = useGet<any[]>('/sections');
  const [sectionId, setSectionId] = useState('');
  useEffect(() => { if (!sectionId && sections.data?.length) setSectionId(sections.data[0].id); }, [sections.data, sectionId]);
  const q = useGet<{ offerings: Offering[]; slots: Slot[] }>(sectionId ? `/timetable/sections/${sectionId}` : null);
  const [f, setF] = useState<Form | null>(null);
  const { confirm, dialog } = useConfirm();

  const save = useAct(() => {
    const { id, ...body } = f!;
    return id ? send('PUT', `/timetable/slots/${id}`, body) : send('POST', '/timetable/slots', body);
  }, { success: f?.id ? 'Slot updated' : 'Slot added', invalidate: ['/timetable'], onDone: () => setF(null) });
  const del = useAct((id: string) => send('DELETE', `/timetable/slots/${id}`), { success: 'Slot removed', invalidate: ['/timetable'], onDone: () => setF(null) });
  const errs = fieldErrors(save.error);
  const openForm = (v: Form) => { save.reset(); setF(v); };
  const edit = (s: Slot) => openForm({ id: s.id, offeringId: s.offering.id, dayOfWeek: String(s.dayOfWeek), startTime: s.startTime, endTime: s.endTime, room: s.room ?? '', kind: s.kind });
  const offerings = q.data?.offerings ?? [];

  return (
    <>
      <PageHeader title="Timetable" subtitle="Set the weekly class schedule for each section. Clashes with the same section, instructor or room are blocked automatically."
        actions={<Button onClick={() => openForm(blank(offerings[0]?.id))} disabled={!offerings.length}><Plus className="size-4" aria-hidden />Add slot</Button>} />
      <div className="mb-5 max-w-sm">
        <Select label="Section" value={sectionId} onChange={(e) => setSectionId(e.target.value)}>
          {(sections.data ?? []).map((s) => <option key={s.id} value={s.id}>{s.batch.program.code} {s.batch.name} · Section {s.name}</option>)}
        </Select>
      </div>
      <QueryView q={q} isEmpty={(d) => !d.offerings.length} empty={<EmptyState icon={<CalendarClock className="size-6" />} title="No active course offerings in this section" body="Create an offering for this section first, then schedule its classes here." />}>
        {(d) => <WeekTimetable slots={d.slots} show="instructor" onEdit={edit} />}
      </QueryView>

      <Modal open={!!f} onClose={() => setF(null)} title={f?.id ? 'Edit class slot' : 'Add class slot'}>
        {f && (
          <form onSubmit={(e) => { e.preventDefault(); save.mutate(); }} className="space-y-4">
            <Select label="Course" required value={f.offeringId} onChange={(e) => setF({ ...f, offeringId: e.target.value })} error={errs.offeringId}>
              {offerings.map((o) => <option key={o.id} value={o.id}>{o.course.code} — {o.course.title}{o.instructors[0] ? ` (${o.instructors.map((i) => i.faculty.firstName + ' ' + i.faculty.lastName).join(', ')})` : ''}{o.status === 'DRAFT' ? ' · draft' : ''}</option>)}
            </Select>
            <div className="grid gap-3 sm:grid-cols-2">
              <Select label="Day" required value={f.dayOfWeek} onChange={(e) => setF({ ...f, dayOfWeek: e.target.value })} error={errs.dayOfWeek}>
                {DAYS.map((d, i) => <option key={d} value={i + 1}>{d}</option>)}
              </Select>
              <Select label="Type" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>
                <option value="LECTURE">Lecture</option><option value="LAB">Lab</option><option value="TUTORIAL">Tutorial</option>
              </Select>
              <Input label="Starts" type="time" required value={f.startTime} onChange={(e) => setF({ ...f, startTime: e.target.value })} error={errs.startTime} />
              <Input label="Ends" type="time" required value={f.endTime} onChange={(e) => setF({ ...f, endTime: e.target.value })} error={errs.endTime} />
            </div>
            <Input label="Room" placeholder="e.g. CR-201 or CS Lab 1" maxLength={40} value={f.room} onChange={(e) => setF({ ...f, room: e.target.value })} error={errs.room} />
            <div className="flex items-center justify-between gap-2 pt-1">
              {f.id
                ? <Button type="button" variant="ghost" className="text-danger" loading={del.isPending}
                    onClick={async () => { if (await confirm({ title: 'Remove this slot?', body: 'Students and faculty will no longer see it in their timetable.', confirm: 'Remove', danger: true })) del.mutate(f.id!); }}>
                    <Trash2 className="size-4" aria-hidden />Remove</Button>
                : <span />}
              <div className="flex gap-2">
                <Button type="button" variant="secondary" onClick={() => setF(null)}>Cancel</Button>
                <Button type="submit" loading={save.isPending}>{f.id ? 'Save changes' : 'Add slot'}</Button>
              </div>
            </div>
          </form>
        )}
      </Modal>
      {dialog}
    </>
  );
}
