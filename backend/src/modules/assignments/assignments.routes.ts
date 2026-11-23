import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { authenticate, requireRole } from '../../middleware/auth';
import { audit } from '../../lib/audit';
import { notify } from '../../lib/notify';
import { badRequest, conflict, notFound, unprocessable } from '../../lib/errors';
import { assertInstructor, assertMember, assertStaff, assertStudent } from '../../lib/policies';

const r = Router();
const uuid = z.string().uuid();
const studentBrief = { select: { id: true, firstName: true, lastName: true, email: true } };
const fileBrief = { include: { fileAsset: { select: { id: true, originalName: true, mimeType: true, size: true } } } };

async function assignmentOf(id: string) {
  const a = await prisma.assignment.findUnique({ where: { id } });
  if (!a) throw notFound('Assignment not found');
  return a;
}

r.get('/offerings/:id/assignments', async (req, res) => {
  const offeringId = uuid.parse(req.params.id);
  const a = await assertMember(req.user!, offeringId);
  const staff = a.isInstructor || a.isAdmin;
  const rows = await prisma.assignment.findMany({
    where: { offeringId, status: staff ? { not: 'ARCHIVED' } : { in: ['PUBLISHED', 'CLOSED'] } },
    orderBy: { dueAt: 'asc' },
    include: {
      _count: staff ? { select: { submissions: true } } : undefined,
      submissions: a.isStudent ? { where: { studentId: req.user!.id }, orderBy: { attemptNo: 'desc' }, take: 1, select: { id: true, status: true, submittedAt: true, isLate: true, gradePublishedAt: true, score: true } } : false,
    },
  });
  // Hide unpublished scores from students.
  res.json({ data: rows.map((x: any) => ({ ...x, submissions: x.submissions?.map((s: any) => (s.gradePublishedAt ? s : { ...s, score: null })) })) });
});

const body = z.object({
  title: z.string().min(1).max(200), instructions: z.string().min(1).max(50_000), dueAt: z.coerce.date(),
  maxPoints: z.number().int().min(1).max(1000), allowLate: z.boolean(), latePenaltyPct: z.number().int().min(0).max(100),
  allowResubmission: z.boolean(), rubric: z.array(z.object({ criterion: z.string().min(1).max(200), points: z.number().min(0) })).max(20).nullable(),
  status: z.enum(['DRAFT', 'PUBLISHED', 'CLOSED', 'ARCHIVED']),
});

r.post('/offerings/:id/assignments', async (req, res) => {
  const offeringId = uuid.parse(req.params.id);
  await assertInstructor(req.user!, offeringId);
  const data = body.partial({ maxPoints: true, allowLate: true, latePenaltyPct: true, allowResubmission: true, rubric: true, status: true }).parse(req.body);
  const a = await prisma.assignment.create({ data: { ...data, rubric: data.rubric ?? undefined, offeringId } });
  if (a.status === 'PUBLISHED') await announce(a.offeringId, a.id, a.title);
  res.status(201).json({ data: a });
});

async function announce(offeringId: string, id: string, title: string) {
  const enr = await prisma.enrollment.findMany({ where: { offeringId, status: 'ACTIVE' }, select: { studentId: true } });
  await notify(enr.map((e) => e.studentId), { type: 'ASSIGNMENT', title: `New assignment: ${title}`, link: `/assignments/${id}` });
}

r.get('/assignments/:id', async (req, res) => {
  const a = await assignmentOf(uuid.parse(req.params.id));
  const acc = await assertMember(req.user!, a.offeringId);
  if (!acc.isInstructor && !acc.isAdmin && !['PUBLISHED', 'CLOSED'].includes(a.status)) throw notFound('Assignment not found');
  const mine = acc.isStudent
    ? await prisma.submission.findMany({ where: { assignmentId: a.id, studentId: req.user!.id }, orderBy: { attemptNo: 'desc' }, include: { files: fileBrief } })
    : [];
  res.json({
    data: {
      ...a,
      mySubmissions: mine.map((s) => (s.gradePublishedAt ? s : { ...s, score: null, feedback: null })),
      access: { isInstructor: acc.isInstructor, isStudent: acc.isStudent, isAdmin: acc.isAdmin },
    },
  });
});

r.patch('/assignments/:id', async (req, res) => {
  const a = await assignmentOf(uuid.parse(req.params.id));
  await assertInstructor(req.user!, a.offeringId);
  const data = body.partial().parse(req.body);
  const updated = await prisma.assignment.update({ where: { id: a.id }, data: { ...data, rubric: data.rubric === null ? undefined : data.rubric } });
  if (a.status === 'DRAFT' && updated.status === 'PUBLISHED') await announce(a.offeringId, a.id, a.title);
  res.json({ data: updated });
});

// ── Submissions ──
r.post('/assignments/:id/submissions', requireRole('STUDENT'), async (req, res) => {
  const a = await assignmentOf(uuid.parse(req.params.id));
  await assertStudent(req.user!, a.offeringId);
  const input = z.object({ content: z.string().max(50_000).default(''), fileAssetIds: z.array(uuid).max(5).default([]) }).parse(req.body);
  if (!input.content.trim() && !input.fileAssetIds.length) throw badRequest('Add text or attach a file');
  if (a.status !== 'PUBLISHED') throw unprocessable('This assignment is not accepting submissions');
  const now = new Date(); // server timestamp is authoritative
  const isLate = now > a.dueAt;
  if (isLate && !a.allowLate) throw unprocessable('The deadline has passed and late submissions are not allowed');
  const files = await prisma.fileAsset.findMany({ where: { id: { in: input.fileAssetIds }, ownerId: req.user!.id } });
  if (files.length !== input.fileAssetIds.length) throw badRequest('Upload your files first');
  const prev = await prisma.submission.findFirst({ where: { assignmentId: a.id, studentId: req.user!.id }, orderBy: { attemptNo: 'desc' } });
  if (prev && !a.allowResubmission) throw conflict('You have already submitted this assignment');
  if (prev?.status === 'GRADED' && prev.gradePublishedAt) throw conflict('This submission has already been graded');
  // Unique (assignment, student, attemptNo) makes concurrent double-submits fail safely with 409.
  const s = await prisma.submission.create({
    data: {
      assignmentId: a.id, studentId: req.user!.id, attemptNo: (prev?.attemptNo ?? 0) + 1, content: input.content, isLate, submittedAt: now,
      files: { create: files.map((f) => ({ fileAssetId: f.id })) },
    },
    include: { files: fileBrief },
  });
  await prisma.learningEvent.create({ data: { userId: req.user!.id, offeringId: a.offeringId, resourceType: 'ASSIGNMENT', resourceId: a.id, type: 'SUBMITTED' } });
  res.status(201).json({ data: s });
});

r.get('/assignments/:id/submissions', async (req, res) => {
  const a = await assignmentOf(uuid.parse(req.params.id));
  await assertStaff(req.user!, a.offeringId);
  const [subs, enrolled] = await Promise.all([
    prisma.submission.findMany({ where: { assignmentId: a.id }, orderBy: [{ studentId: 'asc' }, { attemptNo: 'desc' }], include: { student: studentBrief, files: fileBrief } }),
    prisma.enrollment.findMany({ where: { offeringId: a.offeringId, status: 'ACTIVE' }, include: { student: studentBrief } }),
  ]);
  const latest = new Map<string, (typeof subs)[number]>();
  for (const s of subs) if (!latest.has(s.studentId)) latest.set(s.studentId, s);
  res.json({
    data: {
      assignment: a,
      rows: enrolled.map((e) => ({ student: e.student, latest: latest.get(e.studentId) ?? null, attempts: subs.filter((s) => s.studentId === e.studentId).length })),
    },
  });
});

r.patch('/submissions/:id/grade', async (req, res) => {
  const s = await prisma.submission.findUnique({ where: { id: uuid.parse(req.params.id) }, include: { assignment: true } });
  if (!s) throw notFound('Submission not found');
  await assertInstructor(req.user!, s.assignment.offeringId);
  const g = z.object({ score: z.number().min(0), feedback: z.string().max(10_000).optional(), publish: z.boolean().default(false) }).parse(req.body);
  if (g.score > s.assignment.maxPoints) throw badRequest(`Score cannot exceed ${s.assignment.maxPoints}`);
  const updated = await prisma.submission.update({
    where: { id: s.id },
    data: { score: g.score, feedback: g.feedback, status: 'GRADED', gradedById: req.user!.id, gradedAt: new Date(), gradePublishedAt: g.publish ? new Date() : s.gradePublishedAt },
  });
  // Grade history: every change is in the audit log with old and new values.
  await audit(req, s.score === null ? 'GRADE_ENTERED' : 'GRADE_CHANGED', 'Submission', s.id, { old: s.score?.toString() ?? null, new: g.score, published: g.publish });
  if (g.publish) await notify([s.studentId], { type: 'GRADE', title: `Grade published: ${s.assignment.title}`, link: `/assignments/${s.assignmentId}` });
  res.json({ data: updated });
});

r.post('/assignments/:id/publish-grades', async (req, res) => {
  const a = await assignmentOf(uuid.parse(req.params.id));
  await assertInstructor(req.user!, a.offeringId);
  const toPublish = await prisma.submission.findMany({ where: { assignmentId: a.id, status: 'GRADED', gradePublishedAt: null }, select: { id: true, studentId: true } });
  await prisma.submission.updateMany({ where: { id: { in: toPublish.map((s) => s.id) } }, data: { gradePublishedAt: new Date() } });
  await audit(req, 'GRADES_PUBLISHED', 'Assignment', a.id, { count: toPublish.length });
  await notify(toPublish.map((s) => s.studentId), { type: 'GRADE', title: `Grade published: ${a.title}`, link: `/assignments/${a.id}` });
  res.json({ data: { published: toPublish.length } });
});

export default r;
