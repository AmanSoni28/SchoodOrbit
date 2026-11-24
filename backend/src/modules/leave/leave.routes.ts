import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { requireRole } from '../../middleware/auth';
import { audit } from '../../lib/audit';
import { notify } from '../../lib/notify';
import { badRequest, conflict, forbidden, notFound } from '../../lib/errors';
import { getSettings } from '../../lib/settings';
import { localDate, toDay, ymd } from '../../lib/time';
import { checkRange, leaveDays } from './leave.service';

const r = Router();
const uuid = z.string().uuid();
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD').refine((s) => !isNaN(Date.parse(s)), 'Invalid date');
const today = async () => localDate((await getSettings()).settings.timeZone);

const person = { select: { id: true, firstName: true, lastName: true, email: true, roles: { select: { role: true } } } };
const out = (l: any) => ({
  ...l, fromDate: ymd(l.fromDate), toDate: ymd(l.toDate),
  applicant: l.applicant && { ...l.applicant, roles: l.applicant.roles.map((x: any) => x.role) },
});

// ── Applicants (students and faculty) ──
r.get('/leaves/mine', requireRole('STUDENT', 'FACULTY'), async (req, res) => {
  const rows = await prisma.leaveRequest.findMany({
    where: { applicantId: req.user!.id }, orderBy: { fromDate: 'desc' }, take: 200,
    include: { reviewer: { select: { firstName: true, lastName: true } } },
  });
  res.json({ data: rows.map(out) });
});

r.post('/leaves', requireRole('STUDENT', 'FACULTY'), async (req, res) => {
  const b = z.object({
    type: z.enum(['SICK', 'CASUAL', 'MEDICAL', 'FAMILY', 'OTHER']),
    fromDate: day, toDate: day,
    reason: z.string().trim().min(10, 'Please give a short reason (at least 10 characters)').max(2000),
  }).parse(req.body);
  const err = checkRange(b.fromDate, b.toDate, await today());
  if (err) throw badRequest(err);
  const from = toDay(b.fromDate), to = toDay(b.toDate);
  const overlap = await prisma.leaveRequest.findFirst({
    where: { applicantId: req.user!.id, status: { in: ['PENDING', 'APPROVED'] }, fromDate: { lte: to }, toDate: { gte: from } },
  });
  if (overlap) throw conflict(`You already have a ${overlap.status.toLowerCase()} leave from ${ymd(overlap.fromDate)} to ${ymd(overlap.toDate)} that overlaps these dates`);

  const l = await prisma.leaveRequest.create({ data: { applicantId: req.user!.id, type: b.type, fromDate: from, toDate: to, days: leaveDays(b.fromDate, b.toDate), reason: b.reason } });
  await audit(req, 'LEAVE_APPLIED', 'LeaveRequest', l.id, { from: b.fromDate, to: b.toDate });
  const admins = await prisma.user.findMany({ where: { status: 'ACTIVE', roles: { some: { role: 'COLLEGE_ADMIN' } } }, select: { id: true } });
  await notify(admins.map((a) => a.id), {
    type: 'LEAVE', title: `Leave request: ${req.user!.firstName} ${req.user!.lastName}`,
    body: `${l.days} day(s), ${b.fromDate} → ${b.toDate}`, link: '/admin/leaves',
  });
  res.status(201).json({ data: out(l) });
});

r.post('/leaves/:id/cancel', requireRole('STUDENT', 'FACULTY'), async (req, res) => {
  const id = uuid.parse(req.params.id);
  const l = await prisma.leaveRequest.findUnique({ where: { id } });
  if (!l || l.applicantId !== req.user!.id) throw notFound('Leave request not found');
  // Guarded update: a concurrent approval wins instead of being silently overwritten.
  const { count } = await prisma.leaveRequest.updateMany({ where: { id, status: 'PENDING' }, data: { status: 'CANCELLED' } });
  if (!count) throw conflict('Only pending requests can be cancelled');
  await audit(req, 'LEAVE_CANCELLED', 'LeaveRequest', id);
  res.json({ data: { id, status: 'CANCELLED' } });
});

// ── Review (college admin) ──
r.get('/leaves', requireRole('COLLEGE_ADMIN'), async (req, res) => {
  const q = z.object({ status: z.enum(['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED']).optional(), search: z.string().trim().max(100).optional() }).parse(req.query);
  const rows = await prisma.leaveRequest.findMany({
    where: {
      status: q.status,
      applicant: q.search ? { OR: [{ firstName: { contains: q.search, mode: 'insensitive' } }, { lastName: { contains: q.search, mode: 'insensitive' } }, { email: { contains: q.search, mode: 'insensitive' } }] } : undefined,
    },
    orderBy: q.status === 'PENDING' ? { fromDate: 'asc' } : { createdAt: 'desc' }, take: 300,
    include: { applicant: person, reviewer: { select: { firstName: true, lastName: true } } },
  });
  res.json({ data: rows.map(out) });
});

r.post('/leaves/:id/review', requireRole('COLLEGE_ADMIN'), async (req, res) => {
  const id = uuid.parse(req.params.id);
  const b = z.object({ decision: z.enum(['APPROVED', 'REJECTED']), note: z.string().trim().max(1000).optional() }).parse(req.body);
  if (b.decision === 'REJECTED' && !b.note) throw badRequest('Please give a reason when rejecting');
  const l = await prisma.leaveRequest.findUnique({ where: { id } });
  if (!l) throw notFound('Leave request not found');
  if (l.applicantId === req.user!.id) throw forbidden('You cannot review your own leave request');
  const { count } = await prisma.leaveRequest.updateMany({
    where: { id, status: 'PENDING' },
    data: { status: b.decision, reviewNote: b.note || null, reviewerId: req.user!.id, reviewedAt: new Date() },
  });
  if (!count) throw conflict('This request has already been reviewed or cancelled');
  await audit(req, `LEAVE_${b.decision}`, 'LeaveRequest', id);

  const range = `${ymd(l.fromDate)} → ${ymd(l.toDate)}`;
  const verb = b.decision === 'APPROVED' ? 'approved' : 'rejected';
  await notify([l.applicantId], { type: 'LEAVE', title: `Your leave (${range}) was ${verb}`, body: b.note, link: '/leave' });
  // Parents with an active link hear about their child's leave decisions.
  const parents = await prisma.parentStudentLink.findMany({ where: { studentId: l.applicantId, status: 'ACTIVE' }, select: { parentId: true, student: { select: { firstName: true } } } });
  if (parents.length) await notify(parents.map((p) => p.parentId), { type: 'LEAVE', title: `${parents[0].student.firstName}'s leave (${range}) was ${verb}` });
  res.json({ data: { id, status: b.decision } });
});

export default r;
