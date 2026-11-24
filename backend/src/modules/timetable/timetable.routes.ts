import { Router } from 'express';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { hasRole, requireRole } from '../../middleware/auth';
import { audit } from '../../lib/audit';
import { badRequest, conflict, notFound } from '../../lib/errors';
import { findClash, type Ctx } from './timetable.service';

const r = Router();
const admin = requireRole('COLLEGE_ADMIN');
const uuid = z.string().uuid();
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM (24-hour)');
const slotBody = z.object({
  offeringId: uuid,
  dayOfWeek: z.coerce.number().int().min(1).max(7),
  startTime: time, endTime: time,
  room: z.string().trim().max(40).optional().transform((s) => s || null),
  kind: z.enum(['LECTURE', 'LAB', 'TUTORIAL']).default('LECTURE'),
}).refine((b) => b.startTime < b.endTime, { message: 'End time must be after start time', path: ['endTime'] });

// Archived offerings no longer meet, so they never appear in or clash with a timetable.
const live: Prisma.CourseOfferingWhereInput = { status: { not: 'ARCHIVED' } };
const slotInclude = {
  offering: {
    select: {
      id: true, status: true, sectionId: true, semesterId: true, meetingUrl: true,
      course: { select: { code: true, title: true } },
      section: { select: { name: true, batch: { select: { name: true, program: { select: { code: true } } } } } },
      instructors: { select: { faculty: { select: { id: true, firstName: true, lastName: true } } } },
    },
  },
} satisfies Prisma.TimetableSlotInclude;
const order: Prisma.TimetableSlotOrderByWithRelationInput[] = [{ dayOfWeek: 'asc' }, { startTime: 'asc' }];

type Row = Prisma.TimetableSlotGetPayload<{ include: typeof slotInclude }>;
const out = ({ offering: o, ...s }: Row) => ({
  ...s,
  offering: {
    id: o.id, status: o.status, meetingUrl: o.meetingUrl, course: o.course,
    section: o.section ? `${o.section.batch.program.code} ${o.section.batch.name} · ${o.section.name}` : null,
    instructors: o.instructors.map((i) => `${i.faculty.firstName} ${i.faculty.lastName}`),
  },
});
const ctx = (s: Row): Ctx => ({ ...s, sectionId: s.offering.sectionId, semesterId: s.offering.semesterId, facultyIds: s.offering.instructors.map((i) => i.faculty.id), label: s.offering.course.code });

// ── My week: students see enrolled published courses, faculty see what they teach ──
r.get('/timetable/me', requireRole('STUDENT', 'FACULTY'), async (req, res) => {
  const me = req.user!.id;
  const or: Prisma.CourseOfferingWhereInput[] = [];
  if (hasRole(req.user, 'STUDENT')) or.push({ status: 'PUBLISHED', enrollments: { some: { studentId: me, status: 'ACTIVE' } } });
  if (hasRole(req.user, 'FACULTY')) or.push({ ...live, instructors: { some: { facultyId: me } } });
  const rows = await prisma.timetableSlot.findMany({ where: { offering: { OR: or } }, include: slotInclude, orderBy: order });
  res.json({ data: rows.map(out) });
});

// ── Admin: one section's week, plus the offerings that can be scheduled into it ──
r.get('/timetable/sections/:id', admin, async (req, res) => {
  const sectionId = uuid.parse(req.params.id);
  const [offerings, rows] = await Promise.all([
    prisma.courseOffering.findMany({
      where: { sectionId, ...live }, orderBy: { course: { code: 'asc' } },
      select: { id: true, status: true, course: { select: { code: true, title: true } }, semester: { select: { name: true } }, instructors: { select: { faculty: { select: { firstName: true, lastName: true } } } } },
    }),
    prisma.timetableSlot.findMany({ where: { offering: { sectionId, ...live } }, include: slotInclude, orderBy: order }),
  ]);
  res.json({ data: { offerings, slots: rows.map(out) } });
});

async function checkedSlot(body: z.infer<typeof slotBody>, id?: string) {
  const o = await prisma.courseOffering.findUnique({ where: { id: body.offeringId }, select: { status: true, sectionId: true, semesterId: true, course: { select: { code: true } }, instructors: { select: { facultyId: true } } } });
  if (!o) throw notFound('Course offering not found');
  if (o.status === 'ARCHIVED') throw badRequest('Archived offerings cannot be scheduled');
  const facultyIds = o.instructors.map((i) => i.facultyId);
  // Only same-day slots that could conflict on section, instructor or room.
  const candidates = await prisma.timetableSlot.findMany({
    where: {
      dayOfWeek: body.dayOfWeek, startTime: { lt: body.endTime }, endTime: { gt: body.startTime }, offering: live,
      OR: [
        ...(o.sectionId ? [{ offering: { sectionId: o.sectionId, semesterId: o.semesterId } }] : []),
        ...(facultyIds.length ? [{ offering: { instructors: { some: { facultyId: { in: facultyIds } } } } }] : []),
        ...(body.room ? [{ room: { equals: body.room, mode: 'insensitive' as const } }] : []),
      ],
    },
    include: slotInclude,
  });
  if (!candidates.length) return;
  const clash = findClash({ ...body, id, sectionId: o.sectionId, semesterId: o.semesterId, facultyIds, label: o.course.code }, candidates.map(ctx));
  if (clash) throw conflict(clash);
}

r.post('/timetable/slots', admin, async (req, res) => {
  const body = slotBody.parse(req.body);
  await checkedSlot(body);
  const s = await prisma.timetableSlot.create({ data: body, include: slotInclude });
  await audit(req, 'TIMETABLE_SLOT_CREATED', 'TimetableSlot', s.id, body);
  res.status(201).json({ data: out(s) });
});

r.put('/timetable/slots/:id', admin, async (req, res) => {
  const id = uuid.parse(req.params.id);
  const body = slotBody.parse(req.body);
  if (!(await prisma.timetableSlot.count({ where: { id } }))) throw notFound('Slot not found');
  await checkedSlot(body, id);
  const s = await prisma.timetableSlot.update({ where: { id }, data: body, include: slotInclude });
  await audit(req, 'TIMETABLE_SLOT_UPDATED', 'TimetableSlot', id, body);
  res.json({ data: out(s) });
});

r.delete('/timetable/slots/:id', admin, async (req, res) => {
  const id = uuid.parse(req.params.id);
  const s = await prisma.timetableSlot.delete({ where: { id } });
  await audit(req, 'TIMETABLE_SLOT_DELETED', 'TimetableSlot', id, { offeringId: s.offeringId, dayOfWeek: s.dayOfWeek, startTime: s.startTime });
  res.json({ data: { id } });
});

export default r;
