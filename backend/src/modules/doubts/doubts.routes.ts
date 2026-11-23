import { Router } from 'express';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { authenticate, requireFeature, requireRole } from '../../middleware/auth';
import { audit } from '../../lib/audit';
import { notify } from '../../lib/notify';
import { badRequest, forbidden, notFound, AppError } from '../../lib/errors';
import { assertMember, assertStaff, assertStudent, offeringAccess } from '../../lib/policies';

const r = Router();
r.use(['/offerings/:id/doubts', '/doubts', '/doubt-replies', '/doubt-reports'], requireFeature('doubtBoard'));
const uuid = z.string().uuid();

// The ONLY serializer for doubts. authorId never leaves the server; `mine` lets the author recognise their own post.
function publicDoubt(d: any, viewerId: string) {
  const { authorId, votes, ...rest } = d;
  return { ...rest, mine: authorId === viewerId, voted: Array.isArray(votes) && votes.length > 0, authorLabel: 'Anonymous student' };
}
function publicReply(x: any, viewerId: string) {
  const { authorId, author, ...rest } = x;
  return { ...rest, mine: authorId === viewerId, authorLabel: x.isFaculty && author ? `${author.firstName} ${author.lastName} (Faculty)` : 'Anonymous student' };
}

async function doubtOf(id: string) {
  const d = await prisma.doubt.findUnique({ where: { id } });
  if (!d) throw notFound('Doubt not found');
  return d;
}

r.get('/offerings/:id/doubts', async (req, res) => {
  const offeringId = uuid.parse(req.params.id);
  const a = await assertMember(req.user!, offeringId);
  const staff = a.isInstructor || a.isAdmin;
  const q = z.object({
    sort: z.enum(['votes', 'recent', 'unanswered', 'answered']).default('votes'),
    status: z.enum(['OPEN', 'ANSWERED', 'RESOLVED', 'HIDDEN']).optional(),
    lessonId: uuid.optional(), topicId: uuid.optional(), search: z.string().max(100).optional(),
  }).parse(req.query);
  // Students never see hidden doubts; the sort tabs "unanswered"/"answered" act as status filters.
  const status: Prisma.DoubtWhereInput['status'] =
    q.sort === 'unanswered' ? 'OPEN'
    : q.sort === 'answered' ? { in: ['ANSWERED', 'RESOLVED'] }
    : q.status && (staff || q.status !== 'HIDDEN') ? q.status
    : staff ? undefined : { not: 'HIDDEN' };
  const where: Prisma.DoubtWhereInput = {
    offeringId, lessonId: q.lessonId, topicId: q.topicId, mergedIntoId: null, status,
    OR: q.search ? [{ title: { contains: q.search, mode: 'insensitive' } }, { body: { contains: q.search, mode: 'insensitive' } }] : undefined,
  };
  const rows = await prisma.doubt.findMany({
    where,
    orderBy: [{ isPinned: 'desc' }, q.sort === 'recent' ? { createdAt: 'desc' } : { voteCount: 'desc' }, { createdAt: 'desc' }],
    take: 200,
    include: {
      votes: { where: { studentId: req.user!.id }, select: { studentId: true } },
      lesson: { select: { id: true, title: true } }, topic: { select: { id: true, name: true } },
      _count: { select: { replies: true, reports: staff ? { where: { status: 'OPEN' } } : undefined } },
    },
  });
  res.json({ data: rows.map((d) => publicDoubt(d, req.user!.id)), canModerate: staff });
});

r.post('/offerings/:id/doubts', requireRole('STUDENT'), async (req, res) => {
  const offeringId = uuid.parse(req.params.id);
  await assertStudent(req.user!, offeringId);
  const body = z.object({ title: z.string().trim().min(5).max(200), body: z.string().trim().min(1).max(5000), lessonId: uuid.optional(), topicId: uuid.optional() }).parse(req.body);
  if (body.lessonId && !(await prisma.lesson.count({ where: { id: body.lessonId, offeringId } }))) throw badRequest('Lesson is not in this course');
  if (body.topicId && !(await prisma.topic.count({ where: { id: body.topicId, offeringId } }))) throw badRequest('Topic is not in this course');
  // Anti-spam: 10 doubts per student per hour.
  const recent = await prisma.doubt.count({ where: { authorId: req.user!.id, createdAt: { gte: new Date(Date.now() - 3600_000) } } });
  if (recent >= 10) throw new AppError(429, 'RATE_LIMITED', 'You have posted many doubts recently. Please wait a while.');
  const d = await prisma.doubt.create({ data: { ...body, offeringId, authorId: req.user!.id } });
  await prisma.learningEvent.create({ data: { userId: req.user!.id, offeringId, resourceType: 'DOUBT', resourceId: d.id, type: 'POSTED' } });
  const instructors = await prisma.instructorAssignment.findMany({ where: { offeringId }, select: { facultyId: true } });
  await notify(instructors.map((i) => i.facultyId), { type: 'DOUBT', title: `New doubt: ${d.title}`, link: `/doubts/${d.id}` });
  res.status(201).json({ data: publicDoubt({ ...d, votes: [] }, req.user!.id) });
});

r.get('/doubts/:id', async (req, res) => {
  const d0 = await doubtOf(uuid.parse(req.params.id));
  const a = await assertMember(req.user!, d0.offeringId);
  const staff = a.isInstructor || a.isAdmin;
  if (d0.status === 'HIDDEN' && !staff) throw notFound('Doubt not found');
  const d = await prisma.doubt.findUniqueOrThrow({
    where: { id: d0.id },
    include: {
      votes: { where: { studentId: req.user!.id }, select: { studentId: true } },
      lesson: { select: { id: true, title: true } }, topic: { select: { id: true, name: true } },
      replies: { orderBy: { createdAt: 'asc' }, include: { author: { select: { firstName: true, lastName: true } } } },
      reports: staff ? { orderBy: { createdAt: 'desc' }, select: { id: true, reason: true, status: true, resolution: true, createdAt: true } } : false,
      moderation: staff ? { orderBy: { createdAt: 'desc' }, include: { moderator: { select: { firstName: true, lastName: true } } } } : false,
    },
  });
  res.json({ data: { ...publicDoubt(d, req.user!.id), replies: d.replies.map((x) => publicReply(x, req.user!.id)), canModerate: staff, canRevealIdentity: a.isAdmin } });
});

// Idempotent vote: the composite PK means a duplicate request can't double-count.
r.post('/doubts/:id/votes', requireRole('STUDENT'), async (req, res) => {
  const d = await doubtOf(uuid.parse(req.params.id));
  await assertStudent(req.user!, d.offeringId);
  if (d.authorId === req.user!.id) throw badRequest('You cannot upvote your own doubt');
  if (d.status === 'HIDDEN') throw notFound('Doubt not found');
  const voteCount = await prisma.$transaction(async (tx) => {
    const created = await tx.doubtVote.createMany({ data: [{ doubtId: d.id, studentId: req.user!.id }], skipDuplicates: true });
    if (created.count) return (await tx.doubt.update({ where: { id: d.id }, data: { voteCount: { increment: 1 } } })).voteCount;
    return d.voteCount;
  });
  res.json({ data: { voted: true, voteCount } });
});

r.delete('/doubts/:id/votes', requireRole('STUDENT'), async (req, res) => {
  const d = await doubtOf(uuid.parse(req.params.id));
  await assertStudent(req.user!, d.offeringId);
  const voteCount = await prisma.$transaction(async (tx) => {
    const del = await tx.doubtVote.deleteMany({ where: { doubtId: d.id, studentId: req.user!.id } });
    if (del.count) return (await tx.doubt.update({ where: { id: d.id }, data: { voteCount: { decrement: 1 } } })).voteCount;
    return d.voteCount;
  });
  res.json({ data: { voted: false, voteCount } });
});

r.post('/doubts/:id/replies', async (req, res) => {
  const d = await doubtOf(uuid.parse(req.params.id));
  const a = await assertMember(req.user!, d.offeringId);
  if (d.status === 'HIDDEN') throw notFound('Doubt not found');
  const { body } = z.object({ body: z.string().trim().min(1).max(10_000) }).parse(req.body);
  const isFaculty = a.isInstructor;
  const reply = await prisma.doubtReply.create({ data: { doubtId: d.id, authorId: req.user!.id, body, isFaculty }, include: { author: { select: { firstName: true, lastName: true } } } });
  if (isFaculty && d.status === 'OPEN') await prisma.doubt.update({ where: { id: d.id }, data: { status: 'ANSWERED' } });
  if (d.authorId !== req.user!.id) await notify([d.authorId], { type: 'DOUBT_REPLY', title: isFaculty ? 'Faculty answered your doubt' : 'New reply to your doubt', link: `/doubts/${d.id}` });
  res.status(201).json({ data: publicReply(reply, req.user!.id) });
});

// The doubt's author marks a reply useful.
r.post('/doubt-replies/:id/useful', async (req, res) => {
  const reply = await prisma.doubtReply.findUnique({ where: { id: uuid.parse(req.params.id) }, include: { doubt: true } });
  if (!reply || reply.doubt.authorId !== req.user!.id) throw notFound();
  const { useful } = z.object({ useful: z.boolean() }).parse(req.body);
  await prisma.doubtReply.update({ where: { id: reply.id }, data: { isUseful: useful } });
  res.json({ data: { ok: true } });
});

r.patch('/doubts/:id/status', async (req, res) => {
  const d = await doubtOf(uuid.parse(req.params.id));
  const a = await offeringAccess(req.user!, d.offeringId);
  const staff = a.isInstructor || a.isAdmin;
  const body = z.object({ status: z.enum(['OPEN', 'ANSWERED', 'RESOLVED', 'HIDDEN']).optional(), isPinned: z.boolean().optional(), mergedIntoId: uuid.nullable().optional(), note: z.string().max(500).optional() }).parse(req.body);
  // Students may only mark their own doubt resolved.
  const authorResolving = d.authorId === req.user!.id && body.status === 'RESOLVED' && body.isPinned === undefined && body.mergedIntoId === undefined;
  if (!staff && !authorResolving) throw forbidden();
  if (body.mergedIntoId) {
    const target = await prisma.doubt.findUnique({ where: { id: body.mergedIntoId } });
    if (!target || target.offeringId !== d.offeringId || target.id === d.id) throw badRequest('Choose another doubt in this course to merge into');
  }
  const updated = await prisma.doubt.update({ where: { id: d.id }, data: { status: body.status, isPinned: body.isPinned, mergedIntoId: body.mergedIntoId } });
  if (staff) {
    const action = body.mergedIntoId ? 'MERGED' : body.isPinned !== undefined ? (body.isPinned ? 'PINNED' : 'UNPINNED') : `STATUS_${body.status}`;
    await prisma.doubtModerationLog.create({ data: { doubtId: d.id, moderatorId: req.user!.id, action, note: body.note } });
  }
  res.json({ data: publicDoubt({ ...updated, votes: [] }, req.user!.id) });
});

r.post('/doubts/:id/reports', async (req, res) => {
  const d = await doubtOf(uuid.parse(req.params.id));
  await assertMember(req.user!, d.offeringId);
  const { reason } = z.object({ reason: z.string().trim().min(3).max(500) }).parse(req.body);
  await prisma.doubtReport.upsert({ where: { doubtId_reporterId: { doubtId: d.id, reporterId: req.user!.id } }, create: { doubtId: d.id, reporterId: req.user!.id, reason }, update: { reason, status: 'OPEN' } });
  res.status(201).json({ data: { ok: true } });
});

r.patch('/doubt-reports/:id', async (req, res) => {
  const rep = await prisma.doubtReport.findUnique({ where: { id: uuid.parse(req.params.id) }, include: { doubt: true } });
  if (!rep) throw notFound();
  await assertStaff(req.user!, rep.doubt.offeringId);
  const { resolution } = z.object({ resolution: z.string().min(1).max(500) }).parse(req.body);
  await prisma.doubtReport.update({ where: { id: rep.id }, data: { status: 'RESOLVED', resolution } });
  await prisma.doubtModerationLog.create({ data: { doubtId: rep.doubtId, moderatorId: req.user!.id, action: 'REPORT_RESOLVED', note: resolution } });
  res.json({ data: { ok: true } });
});

// Restricted accountability: College Admin only, reason required, logged twice (moderation + audit).
r.post('/doubts/:id/reveal-identity', requireRole('COLLEGE_ADMIN'), async (req, res) => {
  const d = await doubtOf(uuid.parse(req.params.id));
  const { reason } = z.object({ reason: z.string().trim().min(10).max(500) }).parse(req.body);
  const author = await prisma.user.findUniqueOrThrow({ where: { id: d.authorId }, select: { id: true, firstName: true, lastName: true, email: true } });
  await prisma.doubtModerationLog.create({ data: { doubtId: d.id, moderatorId: req.user!.id, action: 'IDENTITY_REVEALED', note: reason } });
  await audit(req, 'DOUBT_IDENTITY_REVEALED', 'Doubt', d.id, { reason });
  res.json({ data: author });
});

export default r;
