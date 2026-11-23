import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { requireRole } from '../../middleware/auth';
import { audit } from '../../lib/audit';
import { notFound } from '../../lib/errors';
import { assertParentScope } from '../../lib/policies';
import { GRADE_SCALE, PASS_PCT, semesterResults, studentTranscript } from './results.service';

const r = Router();
const uuid = z.string().uuid();
const admin = requireRole('COLLEGE_ADMIN');

r.get('/results/semesters', admin, async (_req, res) => {
  const sems = await prisma.semester.findMany({
    orderBy: { startDate: 'desc' },
    include: { academicYear: { select: { label: true } }, resultPublication: { include: { publishedBy: { select: { firstName: true, lastName: true } } } }, _count: { select: { offerings: true } } },
  });
  res.json({ data: sems.map((s) => ({ id: s.id, name: s.name, year: s.academicYear.label, startDate: s.startDate, endDate: s.endDate, offerings: s._count.offerings, publication: s.resultPublication })) });
});

r.get('/results/semesters/:id', admin, async (req, res) => {
  const id = uuid.parse(req.params.id);
  const sem = await prisma.semester.findUnique({ where: { id }, include: { academicYear: { select: { label: true } }, resultPublication: true } });
  if (!sem) throw notFound('Semester not found');
  const r0 = await semesterResults(id);
  const users = await prisma.user.findMany({ where: { id: { in: r0.students.map((s) => s.studentId) } }, select: { id: true, firstName: true, lastName: true, email: true } });
  const students = r0.students
    .map((s) => ({ ...s, student: users.find((u) => u.id === s.studentId)! }))
    .sort((a, b) => (b.sgpa ?? -1) - (a.sgpa ?? -1) || a.student.lastName.localeCompare(b.student.lastName));
  const graded = students.filter((s) => s.sgpa !== null);
  const gradeDist = GRADE_SCALE.map((g) => ({ grade: g.grade, n: students.reduce((a, s) => a + s.courses.filter((c) => c.grade === g.grade).length, 0) }));
  const courseStats = r0.courses.map((c) => {
    const pcts = students.flatMap((s) => s.courses.filter((x) => x.offeringId === c.offeringId && x.pct !== null).map((x) => x.pct!));
    return { ...c, avg: pcts.length ? Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length) : null, pass: pcts.filter((p) => p >= PASS_PCT).length, graded: pcts.length };
  });
  res.json({
    data: {
      semester: { id: sem.id, name: sem.name, year: sem.academicYear.label }, publication: sem.resultPublication, courses: r0.courses, students, gradeDist, courseStats,
      stats: {
        students: students.length,
        pass: students.filter((s) => s.status === 'PASS').length, fail: students.filter((s) => s.status === 'FAIL').length, incomplete: students.filter((s) => s.status === 'INCOMPLETE').length,
        avgSgpa: graded.length ? Math.round((graded.reduce((a, s) => a + s.sgpa!, 0) / graded.length) * 100) / 100 : null,
        topSgpa: graded[0]?.sgpa ?? null,
      },
    },
  });
});

r.post('/results/semesters/:id/publish', admin, async (req, res) => {
  const id = uuid.parse(req.params.id);
  if (!(await prisma.semester.findUnique({ where: { id } }))) throw notFound('Semester not found');
  const pub = await prisma.resultPublication.upsert({ where: { semesterId: id }, create: { semesterId: id, publishedById: req.user!.id }, update: {} });
  await audit(req, 'RESULTS_PUBLISHED', 'Semester', id);
  res.json({ data: pub });
});

r.delete('/results/semesters/:id/publish', admin, async (req, res) => {
  const id = uuid.parse(req.params.id);
  await prisma.resultPublication.deleteMany({ where: { semesterId: id } });
  await audit(req, 'RESULTS_UNPUBLISHED', 'Semester', id);
  res.status(204).end();
});

r.get('/results/me', requireRole('STUDENT'), async (req, res) => {
  res.json({ data: await studentTranscript(req.user!.id) });
});

// Parents see published results under the GRADES consent scope.
r.get('/parent/students/:sid/results', requireRole('PARENT'), async (req, res) => {
  const sid = uuid.parse(req.params.sid);
  await assertParentScope(req, sid, 'GRADES');
  res.json({ data: await studentTranscript(sid) });
});

export default r;
