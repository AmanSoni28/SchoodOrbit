import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { authenticate, requireFeature, requireRole } from '../../middleware/auth';
import { conflict, notFound, unprocessable } from '../../lib/errors';
import { assertInstructor, assertStaff, assertStudent } from '../../lib/policies';
import { getSettings } from '../../lib/settings';
import { localDate } from '../../lib/time';
import { gradeAnswer, publicVersion } from '../quizzes/grading';
import { ensureRevisionQuiz, nextStreak } from './revision.service';

const r = Router();
r.use(['/revision', '/offerings/:id/revision-policy', '/offerings/:id/revision'], requireFeature('dailyRevision'));
const uuid = z.string().uuid();
const today = async () => localDate((await getSettings()).settings.timeZone);

r.get('/revision/today', requireRole('STUDENT'), async (req, res) => {
  const date = await today();
  const enr = await prisma.enrollment.findMany({
    where: { studentId: req.user!.id, status: 'ACTIVE', offering: { status: 'PUBLISHED', revisionPolicy: { enabled: true } } },
    include: { offering: { include: { course: { select: { code: true, title: true } } } } },
  });
  const items = [];
  for (const e of enr) {
    const quiz = await ensureRevisionQuiz(req.user!.id, e.offeringId, date);
    if (!quiz) continue;
    const count = await prisma.revisionQuizQuestion.count({ where: { revisionQuizId: quiz.id } });
    const attempt = await prisma.revisionAttempt.findFirst({ where: { revisionQuizId: quiz.id }, orderBy: { startedAt: 'desc' } });
    items.push({ quizId: quiz.id, offeringId: e.offeringId, course: e.offering.course, status: quiz.status, questionCount: count, score: attempt?.score ?? null, maxScore: attempt?.maxScore ?? null });
  }
  const streak = await prisma.revisionStreak.findUnique({ where: { studentId: req.user!.id } });
  res.json({ data: { date, items, streak: streak ?? { currentStreak: 0, longestStreak: 0, lastCompletedDate: null } } });
});

r.post('/revision/offerings/:id/generate', requireRole('STUDENT'), async (req, res) => {
  const offeringId = uuid.parse(req.params.id);
  await assertStudent(req.user!, offeringId);
  const quiz = await ensureRevisionQuiz(req.user!.id, offeringId, await today());
  if (!quiz) throw unprocessable('Daily revision is turned off for this course');
  res.json({ data: quiz });
});

async function ownQuiz(studentId: string, id: string) {
  const q = await prisma.revisionQuiz.findUnique({ where: { id }, include: { offering: { include: { revisionPolicy: true, course: { select: { code: true, title: true } } } } } });
  if (!q || q.studentId !== studentId) throw notFound('Revision quiz not found');
  return q;
}

r.get('/revision/quizzes/:id', requireRole('STUDENT'), async (req, res) => {
  const q = await ownQuiz(req.user!.id, uuid.parse(req.params.id));
  const items = await prisma.revisionQuizQuestion.findMany({ where: { revisionQuizId: q.id }, orderBy: { position: 'asc' }, include: { questionVersion: { include: { question: { select: { type: true } } } } } });
  const attempt = await prisma.revisionAttempt.findFirst({ where: { revisionQuizId: q.id }, orderBy: { startedAt: 'desc' }, include: { answers: true } });
  const after = q.offering.revisionPolicy?.showExplanations ?? 'AFTER_EACH';
  const submitted = !!attempt?.submittedAt;
  res.json({
    data: {
      id: q.id, status: q.status, date: q.scheduledLocalDate, course: q.offering.course, showExplanations: after,
      attempt: attempt ? { id: attempt.id, submittedAt: attempt.submittedAt, score: attempt.score, maxScore: attempt.maxScore } : null,
      questions: items.map((it) => {
        const v = it.questionVersion, ans = attempt?.answers.find((a) => a.questionVersionId === v.id);
        const reveal = submitted || (ans && after === 'AFTER_EACH');
        return { ...publicVersion(v, v.question.type), myAnswer: ans?.selectedAnswer ?? null, ...(reveal ? { correct: ans?.correct ?? false, correctAnswer: v.correctAnswer, explanation: v.explanation } : {}) };
      }),
    },
  });
});

// Starts or resumes today's attempt (one attempt per quiz).
r.post('/revision/quizzes/:id/attempts', requireRole('STUDENT'), async (req, res) => {
  const q = await ownQuiz(req.user!.id, uuid.parse(req.params.id));
  if (q.status === 'NO_CONTENT') throw unprocessable('No approved practice questions are available yet');
  const existing = await prisma.revisionAttempt.findFirst({ where: { revisionQuizId: q.id } });
  if (existing) return res.json({ data: existing });
  res.status(201).json({ data: await prisma.revisionAttempt.create({ data: { revisionQuizId: q.id } }) });
});

async function ownAttempt(studentId: string, id: string) {
  const a = await prisma.revisionAttempt.findUnique({ where: { id }, include: { revisionQuiz: { include: { offering: { include: { revisionPolicy: true } } } } } });
  if (!a || a.revisionQuiz.studentId !== studentId) throw notFound('Attempt not found');
  return a;
}

r.put('/revision/attempts/:id/answers/:questionVersionId', requireRole('STUDENT'), async (req, res) => {
  const a = await ownAttempt(req.user!.id, uuid.parse(req.params.id));
  if (a.submittedAt) throw conflict('This revision quiz is already submitted');
  const qvId = uuid.parse(req.params.questionVersionId);
  const link = await prisma.revisionQuizQuestion.findUnique({ where: { revisionQuizId_questionVersionId: { revisionQuizId: a.revisionQuizId, questionVersionId: qvId } }, include: { questionVersion: { include: { question: true } } } });
  if (!link) throw notFound('Question not in this quiz');
  const { answer } = z.object({ answer: z.union([z.string().max(50), z.array(z.string().max(50)).max(20)]) }).parse(req.body);
  const v = link.questionVersion;
  const g = gradeAnswer(v.question.type, v, answer)!;
  await prisma.revisionAnswer.upsert({
    where: { attemptId_questionVersionId: { attemptId: a.id, questionVersionId: qvId } },
    create: { attemptId: a.id, questionVersionId: qvId, selectedAnswer: answer, correct: g.isCorrect },
    update: { selectedAnswer: answer, correct: g.isCorrect },
  });
  const after = a.revisionQuiz.offering.revisionPolicy?.showExplanations ?? 'AFTER_EACH';
  res.json({ data: after === 'AFTER_EACH' ? { correct: g.isCorrect, correctAnswer: v.correctAnswer, explanation: v.explanation } : { saved: true } });
});

r.post('/revision/attempts/:id/submit', requireRole('STUDENT'), async (req, res) => {
  const a = await ownAttempt(req.user!.id, uuid.parse(req.params.id));
  if (a.submittedAt) return res.json({ data: a }); // idempotent
  const [answers, total] = await Promise.all([
    prisma.revisionAnswer.findMany({ where: { attemptId: a.id } }),
    prisma.revisionQuizQuestion.count({ where: { revisionQuizId: a.revisionQuizId } }),
  ]);
  const date = await today();
  const done = await prisma.$transaction(async (tx) => {
    const updated = await tx.revisionAttempt.update({ where: { id: a.id }, data: { submittedAt: new Date(), score: answers.filter((x) => x.correct).length, maxScore: total } });
    await tx.revisionQuiz.update({ where: { id: a.revisionQuizId }, data: { status: 'COMPLETED' } });
    // Streak counts only when today's quiz is completed today (local time).
    if (a.revisionQuiz.scheduledLocalDate === date) {
      const prev = await tx.revisionStreak.findUnique({ where: { studentId: req.user!.id } });
      const s = nextStreak(prev, date);
      await tx.revisionStreak.upsert({ where: { studentId: req.user!.id }, create: { studentId: req.user!.id, ...s }, update: s });
    }
    return updated;
  });
  await prisma.learningEvent.create({ data: { userId: req.user!.id, offeringId: a.revisionQuiz.offeringId, resourceType: 'REVISION', resourceId: a.revisionQuizId, type: 'COMPLETED' } });
  res.json({ data: done });
});

r.get('/revision/history', requireRole('STUDENT'), async (req, res) => {
  const quizzes = await prisma.revisionQuiz.findMany({
    where: { studentId: req.user!.id }, orderBy: { scheduledLocalDate: 'desc' }, take: 60,
    include: { offering: { include: { course: { select: { code: true, title: true } } } }, attempts: { select: { score: true, maxScore: true, submittedAt: true } } },
  });
  const streak = await prisma.revisionStreak.findUnique({ where: { studentId: req.user!.id } });
  res.json({ data: { quizzes, streak } });
});

// ── Faculty ──
r.get('/offerings/:id/revision-policy', async (req, res) => {
  const offeringId = uuid.parse(req.params.id);
  await assertStaff(req.user!, offeringId);
  res.json({ data: await prisma.revisionPolicy.upsert({ where: { offeringId }, create: { offeringId }, update: {} }) });
});

r.put('/offerings/:id/revision-policy', async (req, res) => {
  const offeringId = uuid.parse(req.params.id);
  await assertInstructor(req.user!, offeringId);
  const body = z.object({
    enabled: z.boolean(), questionsPerDay: z.number().int().min(1).max(20), topicWindowDays: z.number().int().min(1).max(365),
    showExplanations: z.enum(['AFTER_EACH', 'AFTER_SUBMIT']),
  }).partial().parse(req.body);
  res.json({ data: await prisma.revisionPolicy.upsert({ where: { offeringId }, create: { offeringId, ...body }, update: body }) });
});

// Participation and per-topic practice accuracy — kept separate from official grades.
r.get('/offerings/:id/revision/stats', async (req, res) => {
  const offeringId = uuid.parse(req.params.id);
  await assertStaff(req.user!, offeringId);
  const [quizzes, enrolled, answers] = await Promise.all([
    prisma.revisionQuiz.findMany({ where: { offeringId, scheduledLocalDate: { gte: localDate((await getSettings()).settings.timeZone, new Date(Date.now() - 14 * 86400000)) } }, select: { scheduledLocalDate: true, status: true } }),
    prisma.enrollment.count({ where: { offeringId, status: 'ACTIVE' } }),
    prisma.revisionAnswer.findMany({ where: { attempt: { revisionQuiz: { offeringId } } }, select: { correct: true, questionVersion: { select: { question: { select: { topic: { select: { id: true, name: true } } } } } } } }),
  ]);
  const byDay: Record<string, { generated: number; completed: number }> = {};
  for (const q of quizzes) {
    byDay[q.scheduledLocalDate] ??= { generated: 0, completed: 0 };
    if (q.status !== 'NO_CONTENT') byDay[q.scheduledLocalDate].generated++;
    if (q.status === 'COMPLETED') byDay[q.scheduledLocalDate].completed++;
  }
  const byTopic: Record<string, { topic: string; answered: number; correct: number }> = {};
  for (const a of answers) {
    const t = a.questionVersion.question.topic;
    if (!t) continue;
    byTopic[t.id] ??= { topic: t.name, answered: 0, correct: 0 };
    byTopic[t.id].answered++;
    if (a.correct) byTopic[t.id].correct++;
  }
  res.json({
    data: {
      enrolled,
      participation: Object.entries(byDay).sort().map(([date, v]) => ({ date, ...v })),
      topics: Object.values(byTopic).map((t) => ({ ...t, accuracy: t.answered ? Math.round((t.correct / t.answered) * 100) : null, lowData: t.answered < 5 })),
    },
  });
});

export default r;
