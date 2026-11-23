import { Router } from 'express';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { authenticate, hasRole, requireRole } from '../../middleware/auth';
import { audit } from '../../lib/audit';
import { badRequest } from '../../lib/errors';
import { assertMember, assertStaff, offeringAccess } from '../../lib/policies';
import { notify } from '../../lib/notify';

const r = Router();
const admin = requireRole('COLLEGE_ADMIN');
const uuid = z.string().uuid();
const userBrief = { select: { id: true, firstName: true, lastName: true, email: true } };

// ── Course definitions ──
r.get('/courses', requireRole('COLLEGE_ADMIN', 'SUPER_ADMIN', 'FACULTY'), async (req, res) => {
  const q = z.object({ departmentId: uuid.optional(), search: z.string().max(100).optional() }).parse(req.query);
  res.json({
    data: await prisma.course.findMany({
      where: { departmentId: q.departmentId, OR: q.search ? [{ code: { contains: q.search, mode: 'insensitive' } }, { title: { contains: q.search, mode: 'insensitive' } }] : undefined },
      include: { department: { select: { code: true, name: true } }, _count: { select: { offerings: true } } },
      orderBy: { code: 'asc' },
    }),
  });
});
r.post('/courses', admin, async (req, res) => {
  const body = z.object({
    departmentId: uuid, code: z.string().min(2).max(20).transform((s) => s.trim().toUpperCase()), title: z.string().min(2).max(160),
    description: z.string().max(4000).optional(), credits: z.number().int().min(0).max(20).default(3),
  }).parse(req.body);
  const c = await prisma.course.create({ data: body });
  await audit(req, 'COURSE_CREATED', 'Course', c.id);
  res.status(201).json({ data: c });
});
r.patch('/courses/:id', admin, async (req, res) => {
  const body = z.object({ title: z.string().min(2).max(160), description: z.string().max(4000).nullable(), credits: z.number().int().min(0).max(20), status: z.enum(['ACTIVE', 'ARCHIVED']) }).partial().parse(req.body);
  res.json({ data: await prisma.course.update({ where: { id: uuid.parse(req.params.id) }, data: body }) });
});

// ── Offerings ──
const offeringInclude = {
  course: { select: { id: true, code: true, title: true, credits: true, description: true } },
  semester: { select: { id: true, name: true, startDate: true, endDate: true, academicYear: { select: { label: true } } } },
  section: { select: { id: true, name: true, batch: { select: { name: true, program: { select: { code: true } } } } } },
  instructors: { include: { faculty: userBrief } },
  _count: { select: { enrollments: { where: { status: 'ACTIVE' as const } } } },
};

// Role-aware listing: admins see all, faculty their assigned, students their published enrolled offerings.
r.get('/offerings', async (req, res) => {
  const q = z.object({ semesterId: uuid.optional(), status: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']).optional(), scope: z.enum(['mine', 'all']).default('mine') }).parse(req.query);
  const u = req.user!;
  let where: Prisma.CourseOfferingWhereInput = { semesterId: q.semesterId, status: q.status };
  if (q.scope === 'all' && hasRole(u, 'COLLEGE_ADMIN', 'SUPER_ADMIN')) {
    // all offerings
  } else if (hasRole(u, 'FACULTY') && !hasRole(u, 'STUDENT')) {
    where = { ...where, instructors: { some: { facultyId: u.id } } };
  } else if (hasRole(u, 'STUDENT')) {
    where = { ...where, status: 'PUBLISHED', enrollments: { some: { studentId: u.id, status: { not: 'DROPPED' } } } };
  } else if (!hasRole(u, 'COLLEGE_ADMIN', 'SUPER_ADMIN')) {
    return res.json({ data: [] });
  }
  const rows = await prisma.courseOffering.findMany({ where, include: offeringInclude, orderBy: [{ semester: { startDate: 'desc' } }, { course: { code: 'asc' } }] });
  res.json({ data: rows });
});

r.get('/offerings/:id', async (req, res) => {
  const id = uuid.parse(req.params.id);
  const access = await assertMember(req.user!, id);
  const o = await prisma.courseOffering.findUniqueOrThrow({ where: { id }, include: offeringInclude });
  res.json({ data: { ...o, access: { isInstructor: access.isInstructor, isStudent: access.isStudent, isAdmin: access.isAdmin } } });
});

r.post('/offerings', admin, async (req, res) => {
  const body = z.object({ courseId: uuid, semesterId: uuid, sectionId: uuid.optional(), meetingUrl: z.string().url().optional() }).parse(req.body);
  const course = await prisma.course.findUniqueOrThrow({ where: { id: body.courseId } });
  if (course.status === 'ARCHIVED') throw badRequest('Course is archived');
  const o = await prisma.courseOffering.create({ data: { ...body, aiPolicy: { create: {} }, revisionPolicy: { create: {} } } });
  await audit(req, 'OFFERING_CREATED', 'CourseOffering', o.id);
  res.status(201).json({ data: o });
});

r.patch('/offerings/:id', async (req, res) => {
  const id = uuid.parse(req.params.id);
  const a = await offeringAccess(req.user!, id);
  const body = z.object({
    status: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']), meetingUrl: z.string().url().nullable(),
    gradingWeights: z.object({ assignments: z.number().min(0).max(100), quizzes: z.number().min(0).max(100) }).refine((w) => w.assignments + w.quizzes === 100, 'Weights must total 100'),
  }).partial().parse(req.body);
  if (body.status && !a.isAdmin) throw badRequest('Only a College Admin can change offering status');
  if (!a.isAdmin && !a.isInstructor) throw badRequest('Not permitted');
  const o = await prisma.courseOffering.update({ where: { id }, data: body });
  await audit(req, 'OFFERING_UPDATED', 'CourseOffering', id, body);
  res.json({ data: o });
});

r.post('/offerings/:id/instructors', admin, async (req, res) => {
  const offeringId = uuid.parse(req.params.id);
  const { facultyId } = z.object({ facultyId: uuid }).parse(req.body);
  const isFaculty = await prisma.userRole.findUnique({ where: { userId_role: { userId: facultyId, role: 'FACULTY' } } });
  if (!isFaculty) throw badRequest('Selected user is not a faculty member');
  await prisma.instructorAssignment.upsert({ where: { facultyId_offeringId: { facultyId, offeringId } }, create: { facultyId, offeringId }, update: {} });
  await audit(req, 'INSTRUCTOR_ASSIGNED', 'CourseOffering', offeringId, { facultyId });
  await notify([facultyId], { type: 'ASSIGNED', title: 'You have been assigned a course', link: `/offerings/${offeringId}` });
  res.status(201).json({ data: { ok: true } });
});
r.delete('/offerings/:id/instructors/:facultyId', admin, async (req, res) => {
  const offeringId = uuid.parse(req.params.id), facultyId = uuid.parse(req.params.facultyId);
  await prisma.instructorAssignment.delete({ where: { facultyId_offeringId: { facultyId, offeringId } } });
  await audit(req, 'INSTRUCTOR_REMOVED', 'CourseOffering', offeringId, { facultyId });
  res.json({ data: { ok: true } });
});

// ── Enrollment ──
r.get('/offerings/:id/enrollments', async (req, res) => {
  const id = uuid.parse(req.params.id);
  await assertStaff(req.user!, id);
  res.json({ data: await prisma.enrollment.findMany({ where: { offeringId: id }, include: { student: userBrief }, orderBy: { student: { lastName: 'asc' } } }) });
});

// Idempotent: re-enrolling an existing student is a no-op (or re-activates a dropped one).
r.post('/offerings/:id/enrollments', admin, async (req, res) => {
  const offeringId = uuid.parse(req.params.id);
  const body = z.object({ studentIds: z.array(uuid).max(500).optional(), emails: z.array(z.string().email()).max(500).optional() }).parse(req.body);
  const students = await prisma.user.findMany({
    where: {
      roles: { some: { role: 'STUDENT' } },
      OR: [{ id: { in: body.studentIds ?? [] } }, { email: { in: (body.emails ?? []).map((e) => e.toLowerCase().trim()) } }],
    },
    select: { id: true, email: true },
  });
  const notFoundEmails = (body.emails ?? []).filter((e) => !students.some((s) => s.email === e.toLowerCase().trim()));
  await prisma.$transaction([
    prisma.enrollment.createMany({ data: students.map((s) => ({ offeringId, studentId: s.id })), skipDuplicates: true }),
    prisma.enrollment.updateMany({ where: { offeringId, studentId: { in: students.map((s) => s.id) }, status: 'DROPPED' }, data: { status: 'ACTIVE' } }),
  ]);
  await audit(req, 'STUDENTS_ENROLLED', 'CourseOffering', offeringId, { count: students.length });
  await notify(students.map((s) => s.id), { type: 'ENROLLED', title: 'You have been enrolled in a new course', link: `/offerings/${offeringId}` });
  res.status(201).json({ data: { enrolled: students.length, notFound: notFoundEmails } });
});

r.patch('/offerings/:id/enrollments/:studentId', admin, async (req, res) => {
  const offeringId = uuid.parse(req.params.id), studentId = uuid.parse(req.params.studentId);
  const { status } = z.object({ status: z.enum(['ACTIVE', 'DROPPED', 'COMPLETED']) }).parse(req.body);
  const e = await prisma.enrollment.update({ where: { studentId_offeringId: { studentId, offeringId } }, data: { status } });
  await audit(req, 'ENROLLMENT_STATUS', 'Enrollment', e.id, { status });
  res.json({ data: e });
});

export default r;
