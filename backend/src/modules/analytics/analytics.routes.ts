import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { authenticate, requireFeature, requireRole } from '../../middleware/auth';
import { audit } from '../../lib/audit';
import { notFound } from '../../lib/errors';
import { assertInstructor, assertStaff } from '../../lib/policies';
import { AT_RISK_RULES, doubtTrends, overview, parseRange, studentsTable, suggestions, topics, wrongAnswers } from './analytics.service';
import { lessonCompletion } from '../content/content.routes';

const r = Router();
r.use('/analytics', requireFeature('classInsights'));
const uuid = z.string().uuid();
const rangeQ = z.object({ from: z.string().date().optional(), to: z.string().date().optional() });

async function ctx(req: any) {
  const offeringId = uuid.parse(req.params.id);
  await assertStaff(req.user, offeringId);
  const q = rangeQ.parse(req.query);
  // `to` is inclusive of the whole day.
  return { offeringId, range: parseRange({ from: q.from, to: q.to ? `${q.to}T23:59:59.999Z` : undefined }) };
}

r.get('/analytics/offerings/:id/overview', async (req, res) => { const c = await ctx(req); res.json({ data: await overview(c.offeringId, c.range) }); });
r.get('/analytics/offerings/:id/topics', async (req, res) => { const c = await ctx(req); res.json({ data: await topics(c.offeringId, c.range) }); });
r.get('/analytics/offerings/:id/wrong-answers', async (req, res) => { const c = await ctx(req); res.json({ data: await wrongAnswers(c.offeringId, c.range) }); });
r.get('/analytics/offerings/:id/students', async (req, res) => { const c = await ctx(req); res.json({ data: await studentsTable(c.offeringId, c.range), rules: AT_RISK_RULES }); });
r.get('/analytics/offerings/:id/doubt-trends', async (req, res) => { const c = await ctx(req); res.json({ data: await doubtTrends(c.offeringId, c.range) }); });

r.get('/analytics/offerings/:id/recommendations', async (req, res) => {
  const c = await ctx(req);
  const [computed, saved] = await Promise.all([
    suggestions(c.offeringId, c.range),
    prisma.insightRecommendation.findMany({ where: { offeringId: c.offeringId }, orderBy: { createdAt: 'desc' }, include: { topic: { select: { name: true } } } }),
  ]);
  res.json({ data: { suggestions: computed, saved } });
});

r.post('/analytics/offerings/:id/recommendations', async (req, res) => {
  const offeringId = uuid.parse(req.params.id);
  await assertInstructor(req.user!, offeringId);
  const body = z.object({ topicId: uuid.nullable().optional(), title: z.string().min(3).max(300), evidence: z.record(z.string(), z.unknown()) }).parse(req.body);
  res.status(201).json({ data: await prisma.insightRecommendation.create({ data: { ...body, evidence: body.evidence as any, offeringId, createdById: req.user!.id } }) });
});

r.patch('/analytics/recommendations/:id', async (req, res) => {
  const rec = await prisma.insightRecommendation.findUnique({ where: { id: uuid.parse(req.params.id) } });
  if (!rec) throw notFound();
  await assertInstructor(req.user!, rec.offeringId);
  const { status } = z.object({ status: z.enum(['OPEN', 'DONE', 'DISMISSED']) }).parse(req.body);
  res.json({ data: await prisma.insightRecommendation.update({ where: { id: rec.id }, data: { status } }) });
});

r.get('/analytics/offerings/:id/export', async (req, res) => {
  const c = await ctx(req);
  const rows = await studentsTable(c.offeringId, c.range);
  const esc = (v: unknown) => { let s = v === null || v === undefined ? '' : String(v); if (/^[=+\-@]/.test(s)) s = `'${s}`; return `"${s.replace(/"/g, '""')}"`; };
  const lines = [['Student', 'Email', 'Lesson completion %', 'Quiz average %', 'Quizzes taken', 'Missing assignments', 'Last activity', 'Needs attention', 'Reasons']]
    .concat(rows.map((r) => [`${r.student.firstName} ${r.student.lastName}`, r.student.email, r.completionPct, r.quizAvg, r.quizzesTaken, r.missing, r.lastActivity?.toISOString() ?? '', r.needsAttention ? 'Yes' : 'No', r.reasons.join('; ')] as any));
  await audit(req, 'ANALYTICS_EXPORTED', 'CourseOffering', c.offeringId);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="class-insights-${c.offeringId}.csv"`);
  res.send(lines.map((l) => l.map(esc).join(',')).join('\r\n'));
});

// College-level overview for administrators (aggregates only).
r.get('/analytics/college/overview', requireRole('COLLEGE_ADMIN'), async (_req, res) => {
  const offerings = await prisma.courseOffering.findMany({
    where: { status: 'PUBLISHED' },
    include: { course: { select: { code: true, title: true, department: { select: { code: true } } } }, semester: { select: { name: true } }, _count: { select: { enrollments: { where: { status: 'ACTIVE' } } } } },
  });
  const rows = [];
  for (const o of offerings) {
    const ids = (await prisma.enrollment.findMany({ where: { offeringId: o.id, status: 'ACTIVE' }, select: { studentId: true } })).map((e) => e.studentId);
    const c = await lessonCompletion(o.id, ids);
    const done = Object.values(c.byStudent).reduce((s, n) => s + n, 0);
    rows.push({ offeringId: o.id, course: o.course, semester: o.semester.name, students: o._count.enrollments, completionPct: c.requiredCount && ids.length ? Math.round((done / (c.requiredCount * ids.length)) * 100) : null });
  }
  const [students, faculty, openDoubts] = await Promise.all([
    prisma.userRole.count({ where: { role: 'STUDENT', user: { status: 'ACTIVE' } } }),
    prisma.userRole.count({ where: { role: 'FACULTY', user: { status: 'ACTIVE' } } }),
    prisma.doubt.count({ where: { status: 'OPEN' } }),
  ]);
  res.json({ data: { totals: { students, faculty, publishedOfferings: offerings.length, openDoubts }, offerings: rows } });
});

export default r;
