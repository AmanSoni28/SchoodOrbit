// Timetable rules. Times are "HH:MM" strings, so plain string comparison orders them correctly.
export const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export type SlotLike = { id?: string; dayOfWeek: number; startTime: string; endTime: string };
export type Ctx = SlotLike & { sectionId: string | null; semesterId: string; facultyIds: string[]; room: string | null; label: string };

export const overlaps = (a: SlotLike, b: SlotLike) => a.dayOfWeek === b.dayOfWeek && a.startTime < b.endTime && b.startTime < a.endTime;

const norm = (room: string | null) => room?.trim().toLowerCase() || null;

/** First clash between a proposed slot and existing ones (same section+semester, a shared instructor, or the same room). */
export function findClash(slot: Ctx, existing: Ctx[]): string | null {
  for (const e of existing) {
    if (e.id && e.id === slot.id) continue;
    if (!overlaps(slot, e)) continue;
    const when = `${DAYS[e.dayOfWeek - 1]} ${e.startTime}–${e.endTime}`;
    if (slot.sectionId && e.sectionId === slot.sectionId && e.semesterId === slot.semesterId) return `This section already has ${e.label} on ${when}`;
    if (slot.facultyIds.some((f) => e.facultyIds.includes(f))) return `The instructor already teaches ${e.label} on ${when}`;
    if (norm(slot.room) && norm(slot.room) === norm(e.room)) return `Room ${e.room} is booked for ${e.label} on ${when}`;
  }
  return null;
}
