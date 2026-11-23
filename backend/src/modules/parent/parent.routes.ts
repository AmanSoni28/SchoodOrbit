import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { authenticate, requireFeature, requireRole } from '../../middleware/auth';
import { audit } from '../../lib/audit';
import { notFound } from '../../lib/errors';
import { assertParentScope } from '../../lib/policies';
import { lessonCompletion } from '../content/content.routes';
import { computeGradebook } from '../gradebook/gradebook.service';
import { attendanceSummary } from '../attendance/attendance.routes';

const r = Router();
const uuid = z.string().uuid();
const NOTIF_TYPES = ['GRADE', 'ASSIGNMENT', 'ATTENDANCE', 'ANNOUNCEMENT'] as const;

// ── Student side: see and revoke who has parent access ──
r.get('/me/parent-links', requireRole('STUDENT'), async (req, res) => {
  res.json({
    data: await prisma.parentStudentLink.findMany({
      where: { studentId: req.user!.id },
      include: { parent: { select: { firstName: true, lastName: true, email: true } }, consents: { where: { revokedAt: null } } },
    }),
  });
});
r.post('/me/parent-links/:id/revoke', requireRole('STUDENT'), async (req, res) => {
  const link = await prisma.parentStudentLink.findUnique({ where: { id: uuid.parse(req.params.id) } });
  if (!link || link.studentId !== req.user!.id) throw notFound();
  await prisma.parentAccessConsent.updateMany({ where: { linkId: link.id, revokedAt: null }, data: { revokedAt: new Date() } });
  await audit(req, 'PARENT_CONSENT_REVOKED_BY_STUDENT', 'ParentStudentLink', link.id);
  res.json({ data: { ok: true } });
});

// ── Parent portal ──
r.use('/parent', requireRole('PARENT'), requireFeature('parentPortal'));

const enrolledOfferings = (studentId: string) => prisma.enrollment.findMany({
  where: { studentId, status: { not: 'DROPPED' }, offering: { status: 'PUBLISHED' } },
  include: { offering: { include: { course: { select: { code: true, title: true } }, semester: { select: { name: true } } } } },
});

r.get('/parent/students', async (req, res) => {
  const links = await prisma.parentStudentLink.findMany({
    where: { parentId: req.user!.id, status: 'ACTIVE' },
    include: { student: { select: { id: true, firstName: true, lastName: true } }, consents: { where: { revokedAt: null } } },
  });
  const now = new Date();
  res.json({
    data: links.map((l) => ({
      student: l.student, relationship: l.relationship,
      scope: [...new Set(l.consents.filter((c) => !c.expiresAt || c.expiresAt > now).flatMap((c) => c.scope))],
    })),
  });
});

r.get('/parent/students/:id/progress', async (req, res) => {
  const studentId = uuid.parse(req.params.id);
  await assertParentScope(req, studentId, 'PROGRESS');
  const enr = await enrolledOfferings(studentId);
  const courses = [];
  for (const e of enr) {
    const c = await lessonCompletion(e.offeringId, [studentId]);
    const done = c.byStudent[studentId] ?? 0;
    courses.push({ offeringId: e.offeringId, course: e.offering.course, semester: e.offering.semester.name, requiredLessons: c.requiredCount, completed: done, percent: c.requiredCount ? Math.round((done / c.requiredCount) * 100) : null });
  }
  res.json({ data: courses });
});

r.get('/parent/students/:id/grades', async (req, res) => {
  const studentId = uuid.parse(req.params.id);
  await assertParentScope(req, studentId, 'GRADES');
  const enr = await enrolledOfferings(studentId);
  const out = [];
  for (const e of enr) {
    const b = await computeGradebook(e.offeringId, [studentId], true); // published only
    out.push({ offeringId: e.offeringId, course: e.offering.course, columns: b.columns, ...b.rows[0] });
  }
  res.json({ data: out });
});

r.get('/parent/students/:id/attendance', async (req, res) => {
  const studentId = uuid.parse(req.params.id);
  await assertParentScope(req, studentId, 'ATTENDANCE');
  const enr = await enrolledOfferings(studentId);
  const out = [];
  for (const e of enr) out.push({ course: e.offering.course, ...(await attendanceSummary(e.offeringId, [studentId]))[0] });
  res.json({ data: out });
});

r.get('/parent/students/:id/calendar', async (req, res) => {
  const studentId = uuid.parse(req.params.id);
  await assertParentScope(req, studentId, 'PROGRESS');
  const ids = (await enrolledOfferings(studentId)).map((e) => e.offeringId);
  const now = new Date(), until = new Date(Date.now() + 30 * 86400000);
  const [assignments, quizzes] = await Promise.all([
    prisma.assignment.findMany({
      where: { offeringId: { in: ids }, status: 'PUBLISHED', dueAt: { gte: now, lte: until } }, orderBy: { dueAt: 'asc' },
      select: { id: true, title: true, dueAt: true, offering: { select: { course: { select: { code: true } } } }, submissions: { where: { studentId }, select: { id: true }, take: 1 } },
    }),
    prisma.quiz.findMany({ where: { offeringId: { in: ids }, status: 'PUBLISHED', closesAt: { gte: now, lte: until } }, select: { id: true, title: true, closesAt: true, offering: { select: { course: { select: { code: true } } } } } }),
  ]);
  res.json({
    data: [
      ...assignments.map((a) => ({ type: 'ASSIGNMENT', title: a.title, course: a.offering.course.code, at: a.dueAt, submitted: a.submissions.length > 0 })),
      ...quizzes.map((q) => ({ type: 'QUIZ', title: q.title, course: q.offering.course.code, at: q.closesAt, submitted: null })),
    ].sort((a, b) => +new Date(a.at!) - +new Date(b.at!)),
  });
});

r.get('/parent/notification-preferences', async (req, res) => {
  const prefs = await prisma.parentNotificationPreference.findMany({ where: { parentId: req.user!.id } });
  res.json({ data: NOTIF_TYPES.map((type) => ({ type, enabled: prefs.find((p) => p.type === type)?.enabled ?? true })) });
});

r.patch('/parent/notification-preferences', async (req, res) => {
  const { preferences } = z.object({ preferences: z.array(z.object({ type: z.enum(NOTIF_TYPES), enabled: z.boolean() })) }).parse(req.body);
  await prisma.$transaction(preferences.map((p) => prisma.parentNotificationPreference.upsert({
    where: { parentId_type: { parentId: req.user!.id, type: p.type } }, create: { parentId: req.user!.id, ...p }, update: { enabled: p.enabled },
  })));
  res.json({ data: { ok: true } });
});

export default r;
