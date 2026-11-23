import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { authenticate, requireFeature } from '../../middleware/auth';
import { audit } from '../../lib/audit';
import { AppError, badRequest, conflict, notFound } from '../../lib/errors';
import { assertInstructor, assertStaff } from '../../lib/policies';
import { aiConfigured } from '../../lib/ai';
import { createQuestion } from '../quizzes/quizzes.routes';
import { enqueue, JOB_TYPES, validateDraft, type JobType } from './ai-content.service';

const r = Router();
r.use('/ai/content', requireFeature('aiContent'));
const uuid = z.string().uuid();

r.post('/ai/content/jobs', async (req, res) => {
  const body = z.object({
    offeringId: uuid, lessonId: uuid.optional(), type: z.enum(JOB_TYPES), fileAssetIds: z.array(uuid).max(3).default([]),
    useLessonContent: z.boolean().default(false), count: z.number().int().min(1).max(30).default(5),
    difficulty: z.enum(['EASY', 'MEDIUM', 'HARD']).default('MEDIUM'), instructions: z.string().max(1000).optional(),
  }).parse(req.body);
  await assertInstructor(req.user!, body.offeringId);
  if (!aiConfigured()) throw new AppError(503, 'AI_NOT_CONFIGURED', 'AI features are not configured by the administrator yet.');
  const policy = await prisma.aICoursePolicy.findUnique({ where: { offeringId: body.offeringId } });
  if (policy && !policy.contentGenEnabled) throw new AppError(403, 'AI_DISABLED', 'AI content generation is turned off for this course.');
  if (body.lessonId && !(await prisma.lesson.count({ where: { id: body.lessonId, offeringId: body.offeringId } }))) throw badRequest('Lesson is not in this course');
  if (body.useLessonContent && !body.lessonId) throw badRequest('Choose a lesson to use its content');
  // Sources: the faculty member's own uploads, PDF or plain text only.
  const files = await prisma.fileAsset.findMany({ where: { id: { in: body.fileAssetIds }, ownerId: req.user!.id, mimeType: { in: ['application/pdf', 'text/plain'] } } });
  if (files.length !== body.fileAssetIds.length) throw badRequest('Upload PDF or .txt source files first');
  if (!files.length && !body.useLessonContent) throw badRequest('Add a source document or use the lesson content');
  const job = await prisma.aIContentJob.create({
    data: {
      facultyId: req.user!.id, offeringId: body.offeringId, lessonId: body.lessonId, type: body.type,
      settings: { count: body.count, difficulty: body.difficulty, instructions: body.instructions, useLessonContent: body.useLessonContent },
      sources: { create: files.map((f) => ({ fileAssetId: f.id, metadata: { name: f.originalName } })) },
    },
  });
  enqueue(job.id);
  res.status(202).json({ data: job });
});

r.get('/ai/content/jobs', async (req, res) => {
  const { offeringId } = z.object({ offeringId: uuid }).parse(req.query);
  await assertStaff(req.user!, offeringId);
  res.json({
    data: await prisma.aIContentJob.findMany({
      where: { offeringId }, orderBy: { createdAt: 'desc' }, take: 50,
      include: { lesson: { select: { id: true, title: true } }, sources: { include: { fileAsset: { select: { originalName: true } } } }, drafts: { orderBy: { version: 'desc' }, take: 1, select: { id: true, version: true, reviewStatus: true } } },
    }),
  });
});

async function jobOf(id: string) {
  const j = await prisma.aIContentJob.findUnique({ where: { id } });
  if (!j) throw notFound('Job not found');
  return j;
}

r.get('/ai/content/jobs/:id', async (req, res) => {
  const j = await jobOf(uuid.parse(req.params.id));
  await assertStaff(req.user!, j.offeringId);
  res.json({
    data: await prisma.aIContentJob.findUnique({
      where: { id: j.id },
      include: { lesson: { select: { id: true, title: true } }, sources: { include: { fileAsset: { select: { id: true, originalName: true } } } }, drafts: { orderBy: { version: 'desc' }, include: { approvals: { orderBy: { createdAt: 'desc' } } } } },
    }),
  });
});

r.post('/ai/content/jobs/:id/retry', async (req, res) => {
  const j = await jobOf(uuid.parse(req.params.id));
  await assertInstructor(req.user!, j.offeringId);
  if (j.status !== 'FAILED') throw conflict('Only failed jobs can be retried');
  await prisma.aIContentJob.update({ where: { id: j.id }, data: { status: 'QUEUED', error: null } });
  enqueue(j.id);
  res.status(202).json({ data: { ok: true } });
});

async function draftOf(id: string) {
  const d = await prisma.aIContentDraft.findUnique({ where: { id }, include: { job: true } });
  if (!d) throw notFound('Draft not found');
  return d;
}

r.get('/ai/content/drafts/:id', async (req, res) => {
  const d = await draftOf(uuid.parse(req.params.id));
  await assertStaff(req.user!, d.job.offeringId);
  res.json({ data: d });
});

// Faculty edits create a new draft version (history kept).
r.patch('/ai/content/drafts/:id', async (req, res) => {
  const d = await draftOf(uuid.parse(req.params.id));
  await assertInstructor(req.user!, d.job.offeringId);
  if (d.reviewStatus === 'PUBLISHED') throw conflict('Published drafts cannot be edited');
  const { structuredContent } = z.object({ structuredContent: z.unknown() }).parse(req.body);
  const content = validateDraft(d.job.type as JobType, structuredContent);
  const latest = await prisma.aIContentDraft.findFirstOrThrow({ where: { jobId: d.jobId }, orderBy: { version: 'desc' } });
  const nd = await prisma.aIContentDraft.create({ data: { jobId: d.jobId, version: latest.version + 1, structuredContent: content } });
  res.status(201).json({ data: nd });
});

r.post('/ai/content/drafts/:id/approve', async (req, res) => {
  const d = await draftOf(uuid.parse(req.params.id));
  await assertInstructor(req.user!, d.job.offeringId);
  const { decision, note } = z.object({ decision: z.enum(['APPROVED', 'REJECTED']), note: z.string().max(1000).optional() }).parse(req.body);
  if (d.reviewStatus === 'PUBLISHED') throw conflict('Already published');
  await prisma.$transaction([
    prisma.aIContentDraft.update({ where: { id: d.id }, data: { reviewStatus: decision } }),
    prisma.aIContentApproval.create({ data: { draftId: d.id, reviewerId: req.user!.id, decision, note } }),
  ]);
  await audit(req, `AI_DRAFT_${decision}`, 'AIContentDraft', d.id);
  res.json({ data: { ok: true } });
});

const requireApproved = (d: { reviewStatus: string }) => {
  if (d.reviewStatus !== 'APPROVED') throw conflict('Approve the draft before publishing it');
};

const toMarkdown = (c: any) => [
  `## ${c.title}`, ...c.sections.map((s: any) => `### ${s.heading}\n${s.body}`),
  c.keyPoints?.length ? `### Key points\n${c.keyPoints.map((k: string) => `- ${k}`).join('\n')}` : '',
].filter(Boolean).join('\n\n');

// Notes / summary / flashcards → appended to a lesson's content. Lesson publication stays under faculty control.
r.post('/ai/content/drafts/:id/publish', async (req, res) => {
  const d = await draftOf(uuid.parse(req.params.id));
  await assertInstructor(req.user!, d.job.offeringId);
  requireApproved(d);
  const type = d.job.type as JobType;
  if (type === 'MCQ' || type === 'DESCRIPTIVE') throw badRequest('Add questions to the question bank instead');
  const { lessonId } = z.object({ lessonId: uuid }).parse(req.body);
  const lesson = await prisma.lesson.findFirst({ where: { id: lessonId, offeringId: d.job.offeringId } });
  if (!lesson) throw badRequest('Lesson is not in this course');
  const c = d.structuredContent as any;
  const block = type === 'FLASHCARDS' ? `## Flashcards\n${c.cards.map((x: any) => `**${x.front}** — ${x.back}`).join('\n\n')}` : toMarkdown(c);
  await prisma.$transaction([
    prisma.lesson.update({ where: { id: lesson.id }, data: { content: `${lesson.content}\n\n${block}`.trim() } }),
    prisma.aIContentDraft.update({ where: { id: d.id }, data: { reviewStatus: 'PUBLISHED' } }),
    prisma.aIContentApproval.create({ data: { draftId: d.id, reviewerId: req.user!.id, decision: 'PUBLISHED', note: `Lesson ${lesson.id}` } }),
  ]);
  await audit(req, 'AI_DRAFT_PUBLISHED', 'AIContentDraft', d.id, { lessonId });
  res.json({ data: { ok: true, lessonId } });
});

// MCQ / descriptive → question bank as APPROVED (the draft approval is the human review step).
r.post('/ai/content/drafts/:id/add-to-question-bank', async (req, res) => {
  const d = await draftOf(uuid.parse(req.params.id));
  await assertInstructor(req.user!, d.job.offeringId);
  requireApproved(d);
  const type = d.job.type as JobType;
  if (type !== 'MCQ' && type !== 'DESCRIPTIVE') throw badRequest('Only question drafts can be added to the question bank');
  const { topicId } = z.object({ topicId: uuid.nullable().optional() }).parse(req.body);
  const c = d.structuredContent as any;
  const created = [];
  for (const q of c.questions) {
    created.push(await createQuestion(d.job.offeringId, req.user!.id, type === 'MCQ'
      ? { type: 'MCQ', difficulty: q.difficulty, topicId, status: 'APPROVED', prompt: q.prompt, options: q.options.map((text: string, i: number) => ({ id: String.fromCharCode(97 + i), text })), correctAnswer: String.fromCharCode(97 + q.correctIndex), explanation: q.explanation, points: 1 }
      : { type: 'SHORT', difficulty: q.difficulty, topicId, status: 'APPROVED', prompt: q.prompt, correctAnswer: [], explanation: `Model answer: ${q.modelAnswer}\n\nRubric:\n${q.rubricPoints.map((p: string) => `- ${p}`).join('\n')}`, points: Math.max(1, q.rubricPoints.length) },
    'AI'));
  }
  await prisma.$transaction([
    prisma.aIContentDraft.update({ where: { id: d.id }, data: { reviewStatus: 'PUBLISHED' } }),
    prisma.aIContentApproval.create({ data: { draftId: d.id, reviewerId: req.user!.id, decision: 'PUBLISHED', note: `${created.length} questions added` } }),
  ]);
  await audit(req, 'AI_QUESTIONS_ADDED', 'AIContentDraft', d.id, { count: created.length });
  res.json({ data: { added: created.length } });
});

export default r;
