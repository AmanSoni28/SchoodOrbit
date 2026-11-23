import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { authenticate, requireRole } from '../../middleware/auth';
import { audit } from '../../lib/audit';
import { badRequest } from '../../lib/errors';

// Departments, programs, academic years, semesters, batches, sections.
// Reads: any signed-in staff. Writes: College Admin. Deletes are restricted by FK (onDelete: Restrict).
const r = Router();
const admin = requireRole('COLLEGE_ADMIN');
const staff = requireRole('COLLEGE_ADMIN', 'SUPER_ADMIN', 'FACULTY');
const uuid = z.string().uuid();
const code = z.string().min(1).max(20).transform((s) => s.trim().toUpperCase());
const name = z.string().min(1).max(120);

r.get('/departments', staff, async (_req, res) => {
  res.json({ data: await prisma.department.findMany({ orderBy: { code: 'asc' }, include: { _count: { select: { programs: true, courses: true } } } }) });
});
r.post('/departments', admin, async (req, res) => {
  const d = await prisma.department.create({ data: z.object({ code, name }).parse(req.body) });
  await audit(req, 'DEPARTMENT_CREATED', 'Department', d.id);
  res.status(201).json({ data: d });
});
r.patch('/departments/:id', admin, async (req, res) => {
  res.json({ data: await prisma.department.update({ where: { id: uuid.parse(req.params.id) }, data: z.object({ code, name }).partial().parse(req.body) }) });
});
r.delete('/departments/:id', admin, async (req, res) => {
  await prisma.department.delete({ where: { id: uuid.parse(req.params.id) } });
  await audit(req, 'DEPARTMENT_DELETED', 'Department', String(req.params.id));
  res.json({ data: { ok: true } });
});

r.get('/programs', staff, async (_req, res) => {
  res.json({ data: await prisma.program.findMany({ orderBy: { code: 'asc' }, include: { department: { select: { code: true, name: true } }, batches: { include: { sections: true } } } }) });
});
r.post('/programs', admin, async (req, res) => {
  const body = z.object({ departmentId: uuid, code, name, durationSemesters: z.number().int().min(1).max(16).default(8) }).parse(req.body);
  const p = await prisma.program.create({ data: body });
  await audit(req, 'PROGRAM_CREATED', 'Program', p.id);
  res.status(201).json({ data: p });
});

r.post('/batches', admin, async (req, res) => {
  const b = await prisma.batch.create({ data: z.object({ programId: uuid, name: z.string().min(1).max(40) }).parse(req.body) });
  res.status(201).json({ data: b });
});
r.post('/sections', admin, async (req, res) => {
  const s = await prisma.section.create({ data: z.object({ batchId: uuid, name: z.string().min(1).max(20) }).parse(req.body) });
  res.status(201).json({ data: s });
});
r.get('/sections', staff, async (_req, res) => {
  res.json({ data: await prisma.section.findMany({ include: { batch: { include: { program: { select: { code: true } } } } }, orderBy: { name: 'asc' } }) });
});

const dates = z.object({ startDate: z.coerce.date(), endDate: z.coerce.date() }).refine((d) => d.endDate > d.startDate, { message: 'End date must be after start date', path: ['endDate'] });

r.get('/academic-years', staff, async (_req, res) => {
  res.json({ data: await prisma.academicYear.findMany({ orderBy: { startDate: 'desc' }, include: { semesters: { orderBy: { startDate: 'asc' } } } }) });
});
r.post('/academic-years', admin, async (req, res) => {
  const body = z.object({ label: z.string().min(4).max(20) }).and(dates).parse(req.body);
  const y = await prisma.academicYear.create({ data: body });
  await audit(req, 'ACADEMIC_YEAR_CREATED', 'AcademicYear', y.id);
  res.status(201).json({ data: y });
});

r.get('/semesters', staff, async (_req, res) => {
  res.json({ data: await prisma.semester.findMany({ orderBy: { startDate: 'desc' }, include: { academicYear: { select: { label: true } } } }) });
});
r.post('/semesters', admin, async (req, res) => {
  const body = z.object({ academicYearId: uuid, name: z.string().min(1).max(40) }).and(dates).parse(req.body);
  const year = await prisma.academicYear.findUniqueOrThrow({ where: { id: body.academicYearId } });
  if (body.startDate < year.startDate || body.endDate > year.endDate) throw badRequest('Semester dates must fall within the academic year');
  const s = await prisma.semester.create({ data: body });
  await audit(req, 'SEMESTER_CREATED', 'Semester', s.id);
  res.status(201).json({ data: s });
});

export default r;
