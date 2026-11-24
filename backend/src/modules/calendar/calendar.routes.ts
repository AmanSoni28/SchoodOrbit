import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { requireRole } from '../../middleware/auth';
import { audit } from '../../lib/audit';
import { badRequest, notFound } from '../../lib/errors';
import { addDays, toDay, ymd } from '../../lib/time';

// Academic calendar: everyone signed in can read it; the College Admin maintains it.
const r = Router();
const admin = requireRole('COLLEGE_ADMIN');
const uuid = z.string().uuid();
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD').refine((s) => !isNaN(Date.parse(s)), 'Invalid date');
const TYPES = ['HOLIDAY', 'EXAM', 'DEADLINE', 'EVENT', 'BREAK', 'ACADEMIC'] as const;
const eventBody = z.object({
  title: z.string().trim().min(3).max(120),
  description: z.string().trim().max(1000).optional().transform((s) => s || null),
  type: z.enum(TYPES),
  startDate: day,
  endDate: day.optional(),
}).transform((b) => ({ ...b, endDate: b.endDate ?? b.startDate }))
  .refine((b) => b.endDate >= b.startDate, { message: 'End date cannot be before the start date', path: ['endDate'] });

r.get('/calendar', async (req, res) => {
  const q = z.object({ from: day, to: day }).parse(req.query);
  if (q.to < q.from || q.to > addDays(q.from, 400)) throw badRequest('Choose a range of at most 400 days');
  const from = toDay(q.from), to = toDay(q.to);
  const [events, semesters] = await Promise.all([
    prisma.academicEvent.findMany({ where: { startDate: { lte: to }, endDate: { gte: from } }, orderBy: [{ startDate: 'asc' }, { endDate: 'desc' }] }),
    prisma.semester.findMany({ where: { OR: [{ startDate: { gte: from, lte: to } }, { endDate: { gte: from, lte: to } }] }, include: { academicYear: { select: { label: true } } } }),
  ]);
  // Semester boundaries are derived, so they can't drift from the academic structure. They are read-only here.
  const derived = semesters.flatMap((s) => [
    { id: `sem-start-${s.id}`, title: `${s.name} begins`, description: `Academic year ${s.academicYear.label}`, type: 'ACADEMIC', startDate: ymd(s.startDate), endDate: ymd(s.startDate), readOnly: true },
    { id: `sem-end-${s.id}`, title: `${s.name} ends`, description: `Academic year ${s.academicYear.label}`, type: 'ACADEMIC', startDate: ymd(s.endDate), endDate: ymd(s.endDate), readOnly: true },
  ]).filter((e) => e.startDate >= q.from && e.startDate <= q.to);
  const data = [...events.map((e) => ({ ...e, startDate: ymd(e.startDate), endDate: ymd(e.endDate), readOnly: false })), ...derived]
    .sort((a, b) => a.startDate.localeCompare(b.startDate) || b.endDate.localeCompare(a.endDate));
  res.json({ data });
});

r.post('/calendar/events', admin, async (req, res) => {
  const b = eventBody.parse(req.body);
  const e = await prisma.academicEvent.create({ data: { ...b, startDate: toDay(b.startDate), endDate: toDay(b.endDate), createdById: req.user!.id } });
  await audit(req, 'CALENDAR_EVENT_CREATED', 'AcademicEvent', e.id, b);
  res.status(201).json({ data: { id: e.id } });
});

r.put('/calendar/events/:id', admin, async (req, res) => {
  const id = uuid.parse(req.params.id);
  const b = eventBody.parse(req.body);
  if (!(await prisma.academicEvent.count({ where: { id } }))) throw notFound('Event not found');
  await prisma.academicEvent.update({ where: { id }, data: { ...b, startDate: toDay(b.startDate), endDate: toDay(b.endDate) } });
  await audit(req, 'CALENDAR_EVENT_UPDATED', 'AcademicEvent', id, b);
  res.json({ data: { id } });
});

r.delete('/calendar/events/:id', admin, async (req, res) => {
  const id = uuid.parse(req.params.id);
  const e = await prisma.academicEvent.delete({ where: { id } });
  await audit(req, 'CALENDAR_EVENT_DELETED', 'AcademicEvent', id, { title: e.title, startDate: ymd(e.startDate) });
  res.json({ data: { id } });
});

export default r;
