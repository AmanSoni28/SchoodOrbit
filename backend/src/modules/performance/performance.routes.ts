import { Router } from 'express';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { hasRole, requireRole } from '../../middleware/auth';
import { assertStaff } from '../../lib/policies';
import { classStats, offeringReport, studentRows } from './performance.service';
import { ALL_SCOPES, studentReport } from './student.service';

// Faculty see the courses they teach; the College Admin sees every course with students.
const r = Router();
const staff = requireRole('FACULTY', 'COLLEGE_ADMIN');

r.get('/performance/offerings', staff, async (req, res) => {
  const where: Prisma.CourseOfferingWhereInput = hasRole(req.user, 'COLLEGE_ADMIN')
    ? { status: { not: 'DRAFT' }, enrollments: { some: { status: 'ACTIVE' } } }
    : { instructors: { some: { facultyId: req.user!.id } }, status: { not: 'DRAFT' } };
  const offerings = await prisma.courseOffering.findMany({
    where, orderBy: [{ status: 'asc' }, { semester: { startDate: 'desc' } }, { course: { code: 'asc' } }],
    select: { id: true, status: true, course: { select: { code: true, title: true } }, semester: { select: { name: true } } },
  });
  // Course comparison: one class summary per offering. shortcut: computed on request; cache if a user ever has dozens of courses.
  const summaries = await Promise.all(offerings.map(async (o) => ({ ...o, stats: classStats(await studentRows(o.id)) })));
  res.json({ data: summaries });
});

r.get('/performance/offerings/:id', staff, async (req, res) => {
  const id = z.string().uuid().parse(req.params.id);
  await assertStaff(req.user!, id);
  res.json({ data: await offeringReport(id) });
});

// A student's own performance across all their courses (published marks only).
r.get('/me/performance', requireRole('STUDENT'), async (req, res) => {
  res.json({ data: await studentReport(req.user!.id, ALL_SCOPES) });
});

export default r;
