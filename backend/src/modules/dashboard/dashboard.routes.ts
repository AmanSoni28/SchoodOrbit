import { Router } from 'express';
import { prisma } from '../../lib/prisma';
import { authenticate, requireRole } from '../../middleware/auth';
import { lessonCompletion } from '../content/content.routes';
import { attendanceSummary } from '../attendance/attendance.routes';
import { byKey, daysAgo, fillDays, learningHeat, offeringMetrics, scoreBuckets } from './metrics';

const r = Router();

r.get('/dashboard/student', requireRole('STUDENT'), async (req, res) => {
  const sid = req.user!.id;
  const enr = await prisma.enrollment.findMany({
    where: { studentId: sid, status: { not: 'DROPPED' }, offering: { status: 'PUBLISHED' } },
    include: { offering: { include: { course: { select: { code: true, title: true } }, instructors: { include: { faculty: { select: { firstName: true, lastName: true } } } } } } },
  });
  const ids = enr.map((e) => e.offeringId);
  const now = new Date(), until = new Date(Date.now() + 14 * 86400000);
  const courses = [];
  for (const e of enr) {
    const c = await lessonCompletion(e.offeringId, [sid]);
    courses.push({ offeringId: e.offeringId, course: e.offering.course, instructors: e.offering.instructors.map((i) => i.faculty), percent: c.requiredCount ? Math.round(((c.byStudent[sid] ?? 0) / c.requiredCount) * 100) : null });
  }
  const [assignments, quizzes, sessions, recentGrades] = await Promise.all([
    prisma.assignment.findMany({
      where: { offeringId: { in: ids }, status: 'PUBLISHED', dueAt: { gte: now, lte: until } }, orderBy: { dueAt: 'asc' }, take: 10,
      select: { id: true, title: true, dueAt: true, offering: { select: { course: { select: { code: true } } } }, submissions: { where: { studentId: sid }, select: { id: true }, take: 1 } },
    }),
    prisma.quiz.findMany({ where: { offeringId: { in: ids }, status: 'PUBLISHED', OR: [{ closesAt: null }, { closesAt: { gte: now } }] }, take: 10, select: { id: true, title: true, closesAt: true, offering: { select: { course: { select: { code: true } } } }, attempts: { where: { studentId: sid }, select: { id: true } } } }),
    prisma.classSession.findMany({ where: { offeringId: { in: ids }, startsAt: { gte: now, lte: until } }, orderBy: { startsAt: 'asc' }, take: 5, select: { id: true, title: true, startsAt: true, meetingUrl: true, offering: { select: { course: { select: { code: true } } } } } }),
    prisma.submission.findMany({ where: { studentId: sid, gradePublishedAt: { not: null } }, orderBy: { gradePublishedAt: 'desc' }, take: 5, select: { id: true, score: true, gradePublishedAt: true, assignment: { select: { id: true, title: true, maxPoints: true } } } }),
  ]);
  const [attendance, gradeTrend, heat, counts] = await Promise.all([
    Promise.all(enr.map(async (e) => ({ code: e.offering.course.code, ...(await attendanceSummary(e.offeringId, [sid]))[0] }))),
    prisma.submission.findMany({ where: { studentId: sid, gradePublishedAt: { not: null }, score: { not: null } }, orderBy: { gradePublishedAt: 'desc' }, take: 10, select: { score: true, gradePublishedAt: true, assignment: { select: { title: true, maxPoints: true, offering: { select: { course: { select: { code: true } } } } } } } }),
    learningHeat(84, { userId: sid }),
    Promise.all([
      prisma.submission.count({ where: { studentId: sid } }),
      prisma.quizAttempt.count({ where: { studentId: sid, status: { not: 'IN_PROGRESS' } } }),
      prisma.certificate.count({ where: { studentId: sid } }),
      prisma.lessonProgress.count({ where: { studentId: sid } }),
    ]),
  ]);
  res.json({
    data: {
      courses, attendance, heat,
      gradeTrend: gradeTrend.reverse().map((g) => ({ label: g.assignment.title, course: g.assignment.offering.course.code, at: g.gradePublishedAt, pct: Math.round((Number(g.score) / (g.assignment.maxPoints || 1)) * 100) })),
      counts: { submissions: counts[0], quizAttempts: counts[1], certificates: counts[2], lessonsDone: counts[3] },
      upcoming: [
        ...assignments.map((a) => ({ type: 'ASSIGNMENT', id: a.id, title: a.title, course: a.offering.course.code, at: a.dueAt, done: a.submissions.length > 0 })),
        ...quizzes.map((q) => ({ type: 'QUIZ', id: q.id, title: q.title, course: q.offering.course.code, at: q.closesAt, done: q.attempts.length > 0 })),
      ].sort((a, b) => (a.at ? +new Date(a.at) : Infinity) - (b.at ? +new Date(b.at) : Infinity)),
      sessions, recentGrades,
    },
  });
});

r.get('/dashboard/faculty', requireRole('FACULTY'), async (req, res) => {
  const fid = req.user!.id;
  const offerings = await prisma.courseOffering.findMany({
    where: { instructors: { some: { facultyId: fid } }, status: { not: 'ARCHIVED' } },
    include: { course: { select: { code: true, title: true } }, semester: { select: { name: true } }, _count: { select: { enrollments: { where: { status: 'ACTIVE' } } } } },
  });
  const ids = offerings.map((o) => o.id);
  const [toGrade, quizReview, openDoubts, sessions] = await Promise.all([
    prisma.submission.count({ where: { status: 'SUBMITTED', assignment: { offeringId: { in: ids } } } }),
    prisma.quizAttempt.count({ where: { status: 'SUBMITTED', quiz: { offeringId: { in: ids } } } }),
    prisma.doubt.count({ where: { status: 'OPEN', offeringId: { in: ids }, mergedIntoId: null } }),
    prisma.classSession.findMany({ where: { offeringId: { in: ids }, startsAt: { gte: new Date() } }, orderBy: { startsAt: 'asc' }, take: 5, include: { offering: { select: { course: { select: { code: true } } } } } }),
  ]);
  const [metrics, grades, heat, doubts, graded] = await Promise.all([
    offeringMetrics(ids), scoreBuckets(ids), learningHeat(84, { offeringIds: ids }),
    prisma.doubt.groupBy({ by: ['status'], where: { offeringId: { in: ids }, mergedIntoId: null }, _count: true }),
    prisma.submission.count({ where: { status: 'GRADED', gradedAt: { gte: daysAgo(30) }, assignment: { offeringId: { in: ids } } } }),
  ]);
  res.json({ data: { offerings: offerings.map((o) => ({ ...o, metrics: metrics[o.id] })), counts: { toGrade, quizReview, openDoubts, graded30d: graded }, sessions, grades, heat, doubts: byKey(doubts, 'status') } });
});

r.get('/dashboard/admin', requireRole('COLLEGE_ADMIN', 'SUPER_ADMIN'), async (_req, res) => {
  const since = new Date(Date.now() - 13 * 86400000); since.setUTCHours(0, 0, 0, 0);
  const [users, roles, departments, courses, offerings, enrollments, recentAudit, activityRows, deptRows] = await Promise.all([
    prisma.user.count({ where: { status: 'ACTIVE' } }),
    prisma.userRole.groupBy({ by: ['role'], _count: true, where: { user: { status: 'ACTIVE' } } }),
    prisma.department.count(), prisma.course.count({ where: { status: 'ACTIVE' } }),
    prisma.courseOffering.groupBy({ by: ['status'], _count: true }),
    prisma.enrollment.count({ where: { status: 'ACTIVE' } }),
    prisma.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: 8, include: { actor: { select: { firstName: true, lastName: true } } } }),
    // shortcut: days are UTC buckets, fine for a 14-day trend; bucket in the college timezone if exact local days matter.
    prisma.$queryRaw<{ day: Date; logins: number; changes: number }[]>`
      SELECT date_trunc('day', "createdAt") AS day,
             COUNT(*) FILTER (WHERE action = 'LOGIN')::int AS logins,
             COUNT(*) FILTER (WHERE action <> 'LOGIN')::int AS changes
      FROM "AuditLog" WHERE "createdAt" >= ${since} GROUP BY 1`,
    prisma.$queryRaw<{ code: string; name: string; n: number }[]>`
      SELECT d.code, d.name, COUNT(e.id)::int AS n
      FROM "Department" d
      LEFT JOIN "Course" c ON c."departmentId" = d.id
      LEFT JOIN "CourseOffering" o ON o."courseId" = c.id
      LEFT JOIN "Enrollment" e ON e."offeringId" = o.id AND e.status = 'ACTIVE'
      GROUP BY d.code, d.name ORDER BY n DESC`,
  ]);
  const since30 = daysAgo(29);
  const [lessons, assignments, quizzes, subStatus, lateSubs, attempts, attendance, doubtStatus, announcements, certificates, ai, topOfferings, signups, grades, heat, programs, semesters] = await Promise.all([
    prisma.lesson.count({ where: { status: 'PUBLISHED' } }),
    prisma.assignment.count({ where: { status: 'PUBLISHED' } }),
    prisma.quiz.count({ where: { status: 'PUBLISHED' } }),
    prisma.submission.groupBy({ by: ['status'], _count: true }),
    prisma.submission.count({ where: { isLate: true } }),
    prisma.quizAttempt.count({ where: { status: { not: 'IN_PROGRESS' } } }),
    prisma.attendanceRecord.groupBy({ by: ['status'], _count: true }),
    prisma.doubt.groupBy({ by: ['status'], where: { mergedIntoId: null }, _count: true }),
    prisma.announcement.count(), prisma.certificate.count(),
    prisma.aIUsageRecord.groupBy({ by: ['feature'], where: { createdAt: { gte: since30 } }, _count: true, _sum: { inputTokens: true, outputTokens: true, estimatedCostUsd: true } }),
    prisma.courseOffering.findMany({ where: { status: 'PUBLISHED' }, orderBy: { enrollments: { _count: 'desc' } }, take: 6, select: { id: true, course: { select: { code: true, title: true } }, _count: { select: { enrollments: { where: { status: 'ACTIVE' } } } } } }),
    prisma.$queryRaw<{ day: Date; n: number }[]>`SELECT date_trunc('day', "createdAt") AS day, COUNT(*)::int AS n FROM "User" WHERE "createdAt" >= ${since30} GROUP BY 1`,
    scoreBuckets(), learningHeat(84),
    prisma.program.count(), prisma.semester.count(),
  ]);
  const byDay = new Map(activityRows.map((r) => [r.day.toISOString().slice(0, 10), r]));
  const activity = Array.from({ length: 14 }, (_, i) => {
    const day = new Date(since.getTime() + i * 86400000).toISOString().slice(0, 10);
    return { day, logins: byDay.get(day)?.logins ?? 0, changes: byDay.get(day)?.changes ?? 0 };
  });
  res.json({
    data: {
      users, departments, courses, enrollments, activity, enrollmentsByDept: deptRows, programs, semesters,
      content: { lessons, assignments, quizzes, attempts, announcements, certificates, lateSubs },
      submissions: byKey(subStatus, 'status'), attendance: byKey(attendance, 'status'), doubts: byKey(doubtStatus, 'status'),
      ai: ai.map((x) => ({ feature: x.feature, requests: x._count, tokens: (x._sum.inputTokens ?? 0) + (x._sum.outputTokens ?? 0), cost: Number(x._sum.estimatedCostUsd ?? 0) })),
      topOfferings: topOfferings.map((o) => ({ id: o.id, course: o.course, students: o._count.enrollments })),
      signups: fillDays(signups, 30), grades, heat,
      roles: Object.fromEntries(roles.map((r) => [r.role, r._count])),
      offerings: Object.fromEntries(offerings.map((o) => [o.status, o._count])),
      recentAudit,
    },
  });
});

export default r;
