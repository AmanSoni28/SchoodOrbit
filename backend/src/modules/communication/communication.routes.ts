import { Router, type RequestHandler } from 'express';
import crypto from 'crypto';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { hasRole, requireFeature, requireRole } from '../../middleware/auth';
import { notify } from '../../lib/notify';
import { audit } from '../../lib/audit';
import { paging, meta } from '../../lib/http';
import { notFound, unprocessable } from '../../lib/errors';
import { assertInstructor, assertMember } from '../../lib/policies';
import { lessonCompletion } from '../content/content.routes';

const r = Router();
const uuid = z.string().uuid();
const author = { select: { id: true, firstName: true, lastName: true } };

// Public certificate verification (no auth; mounted before authentication in routes.ts).
// Reveals only what is printed on the certificate.
export const verifyCertificate: RequestHandler = async (req, res) => {
  const c = await prisma.certificate.findUnique({
    where: { verificationCode: z.string().min(8).max(40).parse(req.params.code) },
    include: { student: { select: { firstName: true, lastName: true } }, offering: { include: { course: { select: { code: true, title: true } }, semester: { select: { name: true } } } } },
  });
  if (!c) throw notFound('Certificate not found');
  res.json({ data: { valid: true, student: `${c.student.firstName} ${c.student.lastName}`, course: `${c.offering.course.code} ${c.offering.course.title}`, semester: c.offering.semester.name, issuedAt: c.issuedAt } });
};


// ── Notifications ──
r.get('/notifications', async (req, res) => {
  const p = paging(req.query);
  const where = { userId: req.user!.id };
  const [rows, total, unread] = await Promise.all([
    prisma.notification.findMany({ where, orderBy: { createdAt: 'desc' }, skip: p.skip, take: p.take }),
    prisma.notification.count({ where }),
    prisma.notification.count({ where: { ...where, readAt: null } }),
  ]);
  res.json({ data: rows, meta: { ...meta(p, total), unread } });
});
r.post('/notifications/:id/read', async (req, res) => {
  await prisma.notification.updateMany({ where: { id: uuid.parse(req.params.id), userId: req.user!.id }, data: { readAt: new Date() } });
  res.json({ data: { ok: true } });
});
r.post('/notifications/read-all', async (req, res) => {
  await prisma.notification.updateMany({ where: { userId: req.user!.id, readAt: null }, data: { readAt: new Date() } });
  res.json({ data: { ok: true } });
});

// ── Announcements ──
r.get('/announcements', async (req, res) => {
  const u = req.user!;
  const mine = await prisma.courseOffering.findMany({
    where: { OR: [{ instructors: { some: { facultyId: u.id } } }, { enrollments: { some: { studentId: u.id, status: 'ACTIVE' } }, status: 'PUBLISHED' }] },
    select: { id: true },
  });
  const rows = await prisma.announcement.findMany({
    where: hasRole(u, 'COLLEGE_ADMIN', 'SUPER_ADMIN') ? {} : { OR: [{ offeringId: null }, { offeringId: { in: mine.map((m) => m.id) } }] },
    orderBy: { createdAt: 'desc' }, take: 50,
    include: { author, offering: { select: { id: true, course: { select: { code: true, title: true } } } } },
  });
  res.json({ data: rows });
});

const annBody = z.object({ title: z.string().min(1).max(200), body: z.string().min(1).max(20_000) });

r.post('/announcements', requireRole('COLLEGE_ADMIN'), async (req, res) => {
  const a = await prisma.announcement.create({ data: { ...annBody.parse(req.body), authorId: req.user!.id } });
  const users = await prisma.user.findMany({ where: { status: 'ACTIVE' }, select: { id: true } });
  await notify(users.map((u) => u.id), { type: 'ANNOUNCEMENT', title: a.title, link: '/announcements' });
  await audit(req, 'ANNOUNCEMENT_COLLEGE', 'Announcement', a.id);
  res.status(201).json({ data: a });
});

r.get('/offerings/:id/announcements', async (req, res) => {
  const offeringId = uuid.parse(req.params.id);
  await assertMember(req.user!, offeringId);
  res.json({ data: await prisma.announcement.findMany({ where: { offeringId }, orderBy: { createdAt: 'desc' }, include: { author } }) });
});

r.post('/offerings/:id/announcements', async (req, res) => {
  const offeringId = uuid.parse(req.params.id);
  await assertInstructor(req.user!, offeringId);
  const a = await prisma.announcement.create({ data: { ...annBody.parse(req.body), offeringId, authorId: req.user!.id } });
  const enr = await prisma.enrollment.findMany({ where: { offeringId, status: 'ACTIVE' }, select: { studentId: true } });
  await notify(enr.map((e) => e.studentId), { type: 'ANNOUNCEMENT', title: a.title, link: `/offerings/${offeringId}` });
  res.status(201).json({ data: a });
});

// ── Discussions (named, moderated) ──
const disc = requireFeature('discussions');

r.get('/offerings/:id/threads', disc, async (req, res) => {
  const offeringId = uuid.parse(req.params.id);
  const a = await assertMember(req.user!, offeringId);
  res.json({
    data: await prisma.discussionThread.findMany({
      where: { offeringId, isHidden: a.isInstructor || a.isAdmin ? undefined : false },
      orderBy: { createdAt: 'desc' }, include: { author, _count: { select: { posts: true } } },
    }),
  });
});
r.post('/offerings/:id/threads', disc, async (req, res) => {
  const offeringId = uuid.parse(req.params.id);
  await assertMember(req.user!, offeringId);
  const body = z.object({ title: z.string().min(3).max(200), body: z.string().min(1).max(20_000) }).parse(req.body);
  res.status(201).json({ data: await prisma.discussionThread.create({ data: { ...body, offeringId, authorId: req.user!.id } }) });
});
r.get('/threads/:id', disc, async (req, res) => {
  const t = await prisma.discussionThread.findUnique({ where: { id: uuid.parse(req.params.id) } });
  if (!t) throw notFound();
  const a = await assertMember(req.user!, t.offeringId);
  const staff = a.isInstructor || a.isAdmin;
  if (t.isHidden && !staff) throw notFound();
  const full = await prisma.discussionThread.findUnique({ where: { id: t.id }, include: { author, posts: { where: staff ? {} : { isHidden: false }, orderBy: { createdAt: 'asc' }, include: { author } } } });
  res.json({ data: { ...full, canModerate: a.isInstructor } });
});
r.post('/threads/:id/posts', disc, async (req, res) => {
  const t = await prisma.discussionThread.findUnique({ where: { id: uuid.parse(req.params.id) } });
  if (!t || t.isHidden) throw notFound();
  await assertMember(req.user!, t.offeringId);
  const { body } = z.object({ body: z.string().min(1).max(20_000) }).parse(req.body);
  const p = await prisma.discussionPost.create({ data: { threadId: t.id, authorId: req.user!.id, body } });
  if (t.authorId !== req.user!.id) await notify([t.authorId], { type: 'DISCUSSION', title: `New reply: ${t.title}`, link: `/threads/${t.id}` });
  res.status(201).json({ data: p });
});
r.patch('/threads/:id/hide', disc, async (req, res) => {
  const t = await prisma.discussionThread.findUnique({ where: { id: uuid.parse(req.params.id) } });
  if (!t) throw notFound();
  await assertInstructor(req.user!, t.offeringId);
  const { hidden } = z.object({ hidden: z.boolean() }).parse(req.body);
  await prisma.discussionThread.update({ where: { id: t.id }, data: { isHidden: hidden } });
  await audit(req, hidden ? 'THREAD_HIDDEN' : 'THREAD_UNHIDDEN', 'DiscussionThread', t.id);
  res.json({ data: { ok: true } });
});
r.patch('/posts/:id/hide', disc, async (req, res) => {
  const p = await prisma.discussionPost.findUnique({ where: { id: uuid.parse(req.params.id) }, include: { thread: true } });
  if (!p) throw notFound();
  await assertInstructor(req.user!, p.thread.offeringId);
  const { hidden } = z.object({ hidden: z.boolean() }).parse(req.body);
  await prisma.discussionPost.update({ where: { id: p.id }, data: { isHidden: hidden } });
  await audit(req, hidden ? 'POST_HIDDEN' : 'POST_UNHIDDEN', 'DiscussionPost', p.id);
  res.json({ data: { ok: true } });
});

// ── Certificates ──
r.post('/offerings/:id/certificates', async (req, res) => {
  const offeringId = uuid.parse(req.params.id);
  await assertInstructor(req.user!, offeringId);
  const { studentId } = z.object({ studentId: uuid }).parse(req.body);
  const enr = await prisma.enrollment.findUnique({ where: { studentId_offeringId: { studentId, offeringId } } });
  if (!enr || enr.status === 'DROPPED') throw unprocessable('Student is not enrolled');
  const c = await lessonCompletion(offeringId, [studentId]);
  if (c.requiredCount === 0 || (c.byStudent[studentId] ?? 0) < c.requiredCount) throw unprocessable('Student has not completed all required lessons');
  const cert = await prisma.certificate.upsert({
    where: { offeringId_studentId: { offeringId, studentId } }, update: {},
    create: { offeringId, studentId, verificationCode: crypto.randomBytes(9).toString('base64url') },
  });
  await prisma.enrollment.update({ where: { id: enr.id }, data: { status: 'COMPLETED' } });
  await audit(req, 'CERTIFICATE_ISSUED', 'Certificate', cert.id);
  await notify([studentId], { type: 'CERTIFICATE', title: 'You earned a course certificate', link: '/certificates' });
  res.status(201).json({ data: cert });
});

r.get('/certificates/me', async (req, res) => {
  res.json({
    data: await prisma.certificate.findMany({
      where: { studentId: req.user!.id }, orderBy: { issuedAt: 'desc' },
      include: { offering: { include: { course: { select: { code: true, title: true } }, semester: { select: { name: true } } } } },
    }),
  });
});

export default r;
