import { Router } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { authenticate, requireRole } from '../../middleware/auth';
import { audit } from '../../lib/audit';
import { notify } from '../../lib/notify';
import { badRequest, conflict, forbidden, notFound, unprocessable } from '../../lib/errors';
import { assertInstructor, assertMember, assertStaff, assertStudent, offeringAccess } from '../../lib/policies';
import { gradeAnswer, publicVersion, validateQuestion } from './grading';

const r = Router();
const uuid = z.string().uuid();
const GRACE_MS = 30_000; // network grace after the server deadline

// ── Question bank ──
const questionInput = z.object({
  type: z.enum(['MCQ', 'MULTI', 'TRUE_FALSE', 'SHORT']),
  difficulty: z.enum(['EASY', 'MEDIUM', 'HARD']).default('MEDIUM'),
  topicId: uuid.nullable().optional(),
  status: z.enum(['DRAFT', 'APPROVED', 'ARCHIVED']).default('DRAFT'),
  prompt: z.string().min(1).max(5000),
  options: z.array(z.object({ id: z.string(), text: z.string() })).optional(),
  correctAnswer: z.unknown(),
  explanation: z.string().max(5000).nullable().optional(),
  points: z.number().int().min(1).max(100).default(1),
});

const withLatest = { versions: { orderBy: { version: 'desc' as const }, take: 1 }, topic: true };

r.get('/offerings/:id/questions', async (req, res) => {
  const offeringId = uuid.parse(req.params.id);
  await assertStaff(req.user!, offeringId);
  const q = z.object({ status: z.enum(['DRAFT', 'APPROVED', 'ARCHIVED']).optional(), topicId: uuid.optional(), type: z.enum(['MCQ', 'MULTI', 'TRUE_FALSE', 'SHORT']).optional() }).parse(req.query);
  res.json({ data: await prisma.question.findMany({ where: { offeringId, ...q }, include: withLatest, orderBy: { createdAt: 'desc' } }) });
});

export async function createQuestion(offeringId: string, userId: string, input: z.infer<typeof questionInput>, source: 'MANUAL' | 'AI' = 'MANUAL') {
  const v = validateQuestion(input.type, { options: input.options, correctAnswer: input.correctAnswer });
  if (input.topicId && !(await prisma.topic.count({ where: { id: input.topicId, offeringId } }))) throw badRequest('Topic belongs to another course');
  return prisma.question.create({
    data: {
      offeringId, createdById: userId, type: input.type, difficulty: input.difficulty, topicId: input.topicId ?? null, status: input.status, source,
      versions: { create: { version: 1, prompt: input.prompt, options: v.options, correctAnswer: v.correctAnswer as Prisma.InputJsonValue, explanation: input.explanation ?? null, points: input.points } },
    },
    include: withLatest,
  });
}

r.post('/offerings/:id/questions', async (req, res) => {
  const offeringId = uuid.parse(req.params.id);
  await assertInstructor(req.user!, offeringId);
  res.status(201).json({ data: await createQuestion(offeringId, req.user!.id, questionInput.parse(req.body)) });
});

// Content edits append a new immutable version; metadata edits update in place.
r.patch('/questions/:id', async (req, res) => {
  const q = await prisma.question.findUnique({ where: { id: uuid.parse(req.params.id) }, include: { versions: { orderBy: { version: 'desc' }, take: 1 } } });
  if (!q) throw notFound('Question not found');
  await assertInstructor(req.user!, q.offeringId);
  const input = questionInput.omit({ type: true }).partial().parse(req.body);
  const cur = q.versions[0];
  const contentChanged = ['prompt', 'options', 'correctAnswer', 'explanation', 'points'].some((k) => k in input);
  await prisma.$transaction(async (tx) => {
    if (contentChanged) {
      const v = validateQuestion(q.type, { options: input.options ?? (cur.options as any), correctAnswer: 'correctAnswer' in input ? input.correctAnswer : cur.correctAnswer });
      await tx.questionVersion.create({
        data: { questionId: q.id, version: cur.version + 1, prompt: input.prompt ?? cur.prompt, options: v.options, correctAnswer: v.correctAnswer as Prisma.InputJsonValue,
          explanation: input.explanation !== undefined ? input.explanation : cur.explanation, points: input.points ?? cur.points },
      });
    }
    await tx.question.update({ where: { id: q.id }, data: { difficulty: input.difficulty, topicId: input.topicId, status: input.status } });
  });
  res.json({ data: await prisma.question.findUnique({ where: { id: q.id }, include: withLatest }) });
});

r.get('/questions/:id/versions', async (req, res) => {
  const q = await prisma.question.findUnique({ where: { id: uuid.parse(req.params.id) }, include: { versions: { orderBy: { version: 'desc' } } } });
  if (!q) throw notFound();
  await assertStaff(req.user!, q.offeringId);
  res.json({ data: q.versions });
});

// ── Quizzes ──
async function quizOf(id: string) {
  const q = await prisma.quiz.findUnique({ where: { id } });
  if (!q) throw notFound('Quiz not found');
  return q;
}

const quizInput = z.object({
  title: z.string().min(1).max(200), description: z.string().max(5000).nullable(), timeLimitMinutes: z.number().int().min(1).max(600).nullable(),
  maxAttempts: z.number().int().min(1).max(10), opensAt: z.coerce.date().nullable(), closesAt: z.coerce.date().nullable(),
  questionIds: z.array(uuid).min(1).max(200), status: z.enum(['DRAFT', 'PUBLISHED', 'CLOSED']), resultsPublished: z.boolean(),
});

// Snapshots the latest version of each APPROVED question into the quiz.
async function snapshotQuestions(offeringId: string, questionIds: string[]) {
  const qs = await prisma.question.findMany({ where: { id: { in: questionIds }, offeringId, status: 'APPROVED' }, include: { versions: { orderBy: { version: 'desc' }, take: 1 } } });
  if (qs.length !== new Set(questionIds).size) throw badRequest('Only approved questions from this course can be added');
  const byId = new Map(qs.map((q) => [q.id, q.versions[0].id]));
  return [...new Set(questionIds)].map((id, position) => ({ questionVersionId: byId.get(id)!, position }));
}

r.get('/offerings/:id/quizzes', async (req, res) => {
  const offeringId = uuid.parse(req.params.id);
  const a = await assertMember(req.user!, offeringId);
  const staff = a.isInstructor || a.isAdmin;
  const rows = await prisma.quiz.findMany({
    where: { offeringId, status: staff ? undefined : { in: ['PUBLISHED', 'CLOSED'] } },
    orderBy: { createdAt: 'desc' },
    include: {
      _count: { select: { questions: true, attempts: true } },
      attempts: a.isStudent ? { where: { studentId: req.user!.id }, orderBy: { attemptNo: 'desc' }, select: { id: true, status: true, score: true, maxScore: true, attemptNo: true } } : false,
    },
  });
  res.json({ data: rows.map((q: any) => (staff || q.resultsPublished ? q : { ...q, attempts: q.attempts?.map((x: any) => ({ ...x, score: null })) })) });
});

r.post('/offerings/:id/quizzes', async (req, res) => {
  const offeringId = uuid.parse(req.params.id);
  await assertInstructor(req.user!, offeringId);
  const { questionIds, ...data } = quizInput.partial({ description: true, timeLimitMinutes: true, maxAttempts: true, opensAt: true, closesAt: true, status: true, resultsPublished: true }).parse(req.body);
  if (data.opensAt && data.closesAt && data.closesAt <= data.opensAt) throw badRequest('Close time must be after open time');
  const quiz = await prisma.quiz.create({ data: { ...data, offeringId, questions: { create: await snapshotQuestions(offeringId, questionIds) } } });
  res.status(201).json({ data: quiz });
});

r.get('/quizzes/:id', async (req, res) => {
  const quiz = await quizOf(uuid.parse(req.params.id));
  const a = await assertMember(req.user!, quiz.offeringId);
  const staff = a.isInstructor || a.isAdmin;
  if (!staff && quiz.status === 'DRAFT') throw notFound('Quiz not found');
  const questions = staff
    ? await prisma.quizQuestion.findMany({ where: { quizId: quiz.id }, orderBy: { position: 'asc' }, include: { questionVersion: { include: { question: { select: { id: true, type: true, topicId: true } } } } } })
    : [];
  const myAttempts = a.isStudent ? await prisma.quizAttempt.findMany({ where: { quizId: quiz.id, studentId: req.user!.id }, orderBy: { attemptNo: 'desc' } }) : [];
  const count = await prisma.quizQuestion.count({ where: { quizId: quiz.id } });
  res.json({
    data: {
      ...quiz, questionCount: count, questions,
      myAttempts: myAttempts.map((x) => (quiz.resultsPublished ? x : { ...x, score: null })),
      access: { isInstructor: a.isInstructor, isStudent: a.isStudent, isAdmin: a.isAdmin },
    },
  });
});

r.patch('/quizzes/:id', async (req, res) => {
  const quiz = await quizOf(uuid.parse(req.params.id));
  await assertInstructor(req.user!, quiz.offeringId);
  const { questionIds, ...data } = quizInput.partial().parse(req.body);
  if (questionIds && (quiz.status !== 'DRAFT' || (await prisma.quizAttempt.count({ where: { quizId: quiz.id } })))) {
    throw conflict('Questions can only change while the quiz is a draft with no attempts');
  }
  const updated = await prisma.$transaction(async (tx) => {
    if (questionIds) {
      const rows = await snapshotQuestions(quiz.offeringId, questionIds);
      await tx.quizQuestion.deleteMany({ where: { quizId: quiz.id } });
      await tx.quizQuestion.createMany({ data: rows.map((x) => ({ ...x, quizId: quiz.id })) });
    }
    return tx.quiz.update({ where: { id: quiz.id }, data });
  });
  if (!quiz.resultsPublished && updated.resultsPublished) {
    const ids = await prisma.quizAttempt.findMany({ where: { quizId: quiz.id }, distinct: ['studentId'], select: { studentId: true } });
    await notify(ids.map((x) => x.studentId), { type: 'GRADE', title: `Quiz results published: ${quiz.title}`, link: `/quizzes/${quiz.id}` });
    await audit(req, 'QUIZ_RESULTS_PUBLISHED', 'Quiz', quiz.id);
  }
  if (quiz.status === 'DRAFT' && updated.status === 'PUBLISHED') {
    const enr = await prisma.enrollment.findMany({ where: { offeringId: quiz.offeringId, status: 'ACTIVE' }, select: { studentId: true } });
    await notify(enr.map((e) => e.studentId), { type: 'QUIZ', title: `New quiz: ${quiz.title}`, link: `/quizzes/${quiz.id}` });
  }
  res.json({ data: updated });
});

// ── Attempts ──
async function finalize(attemptId: string) {
  return prisma.$transaction(async (tx) => {
    // Row lock so concurrent submits grade exactly once.
    await tx.$queryRaw`SELECT id FROM "QuizAttempt" WHERE id = ${attemptId}::uuid FOR UPDATE`;
    const att = await tx.quizAttempt.findUniqueOrThrow({ where: { id: attemptId }, include: { answers: true, quiz: { include: { questions: { include: { questionVersion: { include: { question: true } } } } } } } });
    if (att.status !== 'IN_PROGRESS') return att;
    let score = 0, max = 0, needsReview = false;
    for (const qq of att.quiz.questions) {
      const v = qq.questionVersion;
      max += v.points;
      const ans = att.answers.find((x) => x.questionVersionId === v.id);
      const g = gradeAnswer(v.question.type, v, ans?.answer ?? null);
      if (!g) { needsReview = needsReview || !!ans; if (!ans) await tx.attemptAnswer.create({ data: { attemptId, questionVersionId: v.id, answer: Prisma.JsonNull as any, isCorrect: false, pointsAwarded: 0 } }); continue; }
      score += g.points;
      await tx.attemptAnswer.upsert({
        where: { attemptId_questionVersionId: { attemptId, questionVersionId: v.id } },
        create: { attemptId, questionVersionId: v.id, answer: (ans?.answer ?? Prisma.JsonNull) as any, isCorrect: g.isCorrect, pointsAwarded: g.points },
        update: { isCorrect: g.isCorrect, pointsAwarded: g.points },
      });
    }
    return tx.quizAttempt.update({ where: { id: attemptId }, data: { status: needsReview ? 'SUBMITTED' : 'GRADED', submittedAt: new Date(), score, maxScore: max } });
  });
}

const expired = (att: { deadlineAt: Date | null }) => !!att.deadlineAt && Date.now() > att.deadlineAt.getTime() + GRACE_MS;

r.post('/quizzes/:id/attempts', requireRole('STUDENT'), async (req, res) => {
  const quiz = await quizOf(uuid.parse(req.params.id));
  await assertStudent(req.user!, quiz.offeringId);
  const now = new Date();
  if (quiz.status !== 'PUBLISHED') throw unprocessable('This quiz is not open');
  if ((quiz.opensAt && now < quiz.opensAt) || (quiz.closesAt && now > quiz.closesAt)) throw unprocessable('This quiz is not open right now');
  const existing = await prisma.quizAttempt.findMany({ where: { quizId: quiz.id, studentId: req.user!.id }, orderBy: { attemptNo: 'desc' } });
  const open = existing.find((x) => x.status === 'IN_PROGRESS');
  if (open) {
    if (!expired(open)) return res.json({ data: open }); // resume
    await finalize(open.id);
  }
  if (existing.length >= quiz.maxAttempts) throw conflict('You have used all attempts for this quiz');
  const limit = quiz.timeLimitMinutes ? new Date(now.getTime() + quiz.timeLimitMinutes * 60000) : null;
  const deadlineAt = [limit, quiz.closesAt].filter(Boolean).sort((a, b) => a!.getTime() - b!.getTime())[0] ?? null;
  const att = await prisma.quizAttempt.create({ data: { quizId: quiz.id, studentId: req.user!.id, attemptNo: existing.length + 1, deadlineAt } });
  await prisma.learningEvent.create({ data: { userId: req.user!.id, offeringId: quiz.offeringId, resourceType: 'QUIZ', resourceId: quiz.id, type: 'STARTED' } });
  res.status(201).json({ data: att });
});

async function attemptFor(req: any, id: string) {
  const att = await prisma.quizAttempt.findUnique({ where: { id }, include: { quiz: true } });
  if (!att) throw notFound('Attempt not found');
  const a = await offeringAccess(req.user, att.quiz.offeringId);
  const own = att.studentId === req.user.id;
  if (!own && !a.isInstructor && !a.isAdmin) throw notFound('Attempt not found');
  return { att, own, staff: a.isInstructor || a.isAdmin, isInstructor: a.isInstructor };
}

r.get('/attempts/:id', async (req, res) => {
  let { att, own, staff } = await attemptFor(req, uuid.parse(req.params.id));
  if (att.status === 'IN_PROGRESS' && expired(att)) att = { ...(await finalize(att.id)), quiz: att.quiz };
  const items = await prisma.quizQuestion.findMany({ where: { quizId: att.quizId }, orderBy: { position: 'asc' }, include: { questionVersion: { include: { question: { select: { type: true } } } } } });
  const answers = await prisma.attemptAnswer.findMany({ where: { attemptId: att.id } });
  const reveal = staff || (att.status !== 'IN_PROGRESS' && att.quiz.resultsPublished);
  res.json({
    data: {
      id: att.id, status: att.status, startedAt: att.startedAt, deadlineAt: att.deadlineAt, submittedAt: att.submittedAt, serverNow: new Date(),
      score: reveal ? att.score : null, maxScore: att.maxScore, quiz: { id: att.quiz.id, title: att.quiz.title, resultsPublished: att.quiz.resultsPublished },
      questions: items.map((it) => {
        const v = it.questionVersion, ans = answers.find((x) => x.questionVersionId === v.id);
        return {
          ...publicVersion(v, v.question.type),
          myAnswer: own || staff ? ans?.answer ?? null : null,
          ...(reveal ? { correctAnswer: v.correctAnswer, explanation: v.explanation, isCorrect: ans?.isCorrect ?? null, pointsAwarded: ans?.pointsAwarded ?? null, feedback: ans?.feedback ?? null } : {}),
        };
      }),
    },
  });
});

// Autosave a single answer.
r.put('/attempts/:id/answers/:questionVersionId', async (req, res) => {
  const { att, own } = await attemptFor(req, uuid.parse(req.params.id));
  if (!own) throw forbidden();
  if (att.status !== 'IN_PROGRESS') throw conflict('This attempt has been submitted');
  if (expired(att)) { await finalize(att.id); throw conflict('Time is up — your attempt was submitted'); }
  const qvId = uuid.parse(req.params.questionVersionId);
  if (!(await prisma.quizQuestion.count({ where: { quizId: att.quizId, questionVersionId: qvId } }))) throw notFound('Question not in this quiz');
  const { answer } = z.object({ answer: z.union([z.string().max(10_000), z.array(z.string().max(50)).max(20)]) }).parse(req.body);
  await prisma.attemptAnswer.upsert({
    where: { attemptId_questionVersionId: { attemptId: att.id, questionVersionId: qvId } },
    create: { attemptId: att.id, questionVersionId: qvId, answer }, update: { answer },
  });
  res.json({ data: { savedAt: new Date() } });
});

// Idempotent: a second submit returns the already-finalized attempt.
r.post('/attempts/:id/submit', async (req, res) => {
  const { att, own } = await attemptFor(req, uuid.parse(req.params.id));
  if (!own) throw forbidden();
  const done = await finalize(att.id);
  await prisma.learningEvent.create({ data: { userId: req.user!.id, offeringId: att.quiz.offeringId, resourceType: 'QUIZ', resourceId: att.quizId, type: 'SUBMITTED' } });
  res.json({ data: { id: done.id, status: done.status, submittedAt: done.submittedAt, score: att.quiz.resultsPublished ? done.score : null, maxScore: done.maxScore } });
});

r.get('/quizzes/:id/attempts', async (req, res) => {
  const quiz = await quizOf(uuid.parse(req.params.id));
  await assertStaff(req.user!, quiz.offeringId);
  res.json({ data: await prisma.quizAttempt.findMany({ where: { quizId: quiz.id }, orderBy: [{ studentId: 'asc' }, { attemptNo: 'asc' }], include: { student: { select: { id: true, firstName: true, lastName: true, email: true } } } }) });
});

// Manual grading of descriptive answers.
r.patch('/attempts/:id/answers/:questionVersionId/grade', async (req, res) => {
  const { att, isInstructor } = await attemptFor(req, uuid.parse(req.params.id));
  if (!isInstructor) throw forbidden();
  if (att.status === 'IN_PROGRESS') throw conflict('Attempt is still in progress');
  const qvId = uuid.parse(req.params.questionVersionId);
  const v = await prisma.questionVersion.findUniqueOrThrow({ where: { id: qvId } });
  const g = z.object({ pointsAwarded: z.number().min(0).max(v.points), feedback: z.string().max(5000).optional() }).parse(req.body);
  await prisma.$transaction(async (tx) => {
    const prev = await tx.attemptAnswer.findUnique({ where: { attemptId_questionVersionId: { attemptId: att.id, questionVersionId: qvId } } });
    await tx.attemptAnswer.upsert({
      where: { attemptId_questionVersionId: { attemptId: att.id, questionVersionId: qvId } },
      create: { attemptId: att.id, questionVersionId: qvId, answer: Prisma.JsonNull as any, pointsAwarded: g.pointsAwarded, isCorrect: g.pointsAwarded === v.points, feedback: g.feedback },
      update: { pointsAwarded: g.pointsAwarded, isCorrect: g.pointsAwarded === v.points, feedback: g.feedback },
    });
    const all = await tx.attemptAnswer.findMany({ where: { attemptId: att.id } });
    const total = await tx.quizQuestion.count({ where: { quizId: att.quizId } });
    const graded = all.filter((x) => x.pointsAwarded !== null);
    await tx.quizAttempt.update({
      where: { id: att.id },
      data: { score: graded.reduce((s, x) => s + Number(x.pointsAwarded), 0), status: graded.length === total ? 'GRADED' : 'SUBMITTED' },
    });
    await tx.auditLog.create({ data: { actorId: req.user!.id, action: 'QUIZ_ANSWER_GRADED', entityType: 'QuizAttempt', entityId: att.id, metadata: { questionVersionId: qvId, old: prev?.pointsAwarded?.toString() ?? null, new: g.pointsAwarded } } });
  });
  res.json({ data: { ok: true } });
});

export default r;
