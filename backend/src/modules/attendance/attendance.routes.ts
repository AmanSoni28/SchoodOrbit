import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { authenticate } from '../../middleware/auth';
import { audit } from '../../lib/audit';
import { badRequest, notFound } from '../../lib/errors';
import { assertInstructor, assertMember, assertStaff, assertStudent } from '../../lib/policies';

const r = Router();
const uuid = z.string().uuid();

r.get('/offerings/:id/sessions', async (req, res) => {
  const offeringId = uuid.parse(req.params.id);
  await assertMember(req.user!, offeringId);
  res.json({ data: await prisma.classSession.findMany({ where: { offeringId }, orderBy: { startsAt: 'desc' }, include: { _count: { select: { records: true } } } }) });
});

r.post('/offerings/:id/sessions', async (req, res) => {
  const offeringId = uuid.parse(req.params.id);
  await assertInstructor(req.user!, offeringId);
  const body = z.object({ title: z.string().min(1).max(200), startsAt: z.coerce.date(), endsAt: z.coerce.date(), meetingUrl: z.string().url().optional() }).parse(req.body);
  if (body.endsAt <= body.startsAt) throw badRequest('End time must be after start time');
  res.status(201).json({ data: await prisma.classSession.create({ data: { ...body, offeringId } }) });
});

async function sessionOf(id: string) {
  const s = await prisma.classSession.findUnique({ where: { id } });
  if (!s) throw notFound('Session not found');
  return s;
}

r.get('/sessions/:id/attendance', async (req, res) => {
  const s = await sessionOf(uuid.parse(req.params.id));
  await assertStaff(req.user!, s.offeringId);
  const [enr, recs] = await Promise.all([
    prisma.enrollment.findMany({ where: { offeringId: s.offeringId, status: 'ACTIVE' }, include: { student: { select: { id: true, firstName: true, lastName: true, email: true } } }, orderBy: { student: { lastName: 'asc' } } }),
    prisma.attendanceRecord.findMany({ where: { sessionId: s.id } }),
  ]);
  res.json({ data: { session: s, roster: enr.map((e) => ({ student: e.student, status: recs.find((x) => x.studentId === e.studentId)?.status ?? null })) } });
});

r.put('/sessions/:id/attendance', async (req, res) => {
  const s = await sessionOf(uuid.parse(req.params.id));
  await assertInstructor(req.user!, s.offeringId);
  const { records } = z.object({ records: z.array(z.object({ studentId: uuid, status: z.enum(['PRESENT', 'ABSENT', 'LATE', 'EXCUSED']) })).max(1000) }).parse(req.body);
  const enrolled = new Set((await prisma.enrollment.findMany({ where: { offeringId: s.offeringId, status: 'ACTIVE' }, select: { studentId: true } })).map((e) => e.studentId));
  if (records.some((x) => !enrolled.has(x.studentId))) throw badRequest('Some students are not enrolled in this course');
  const before = await prisma.attendanceRecord.findMany({ where: { sessionId: s.id } });
  await prisma.$transaction(records.map((x) => prisma.attendanceRecord.upsert({
    where: { sessionId_studentId: { sessionId: s.id, studentId: x.studentId } },
    create: { sessionId: s.id, studentId: x.studentId, status: x.status, markedById: req.user!.id },
    update: { status: x.status, markedById: req.user!.id },
  })));
  // Corrections (changes to an existing mark) are audited.
  const corrections = records.filter((x) => { const b = before.find((y) => y.studentId === x.studentId); return b && b.status !== x.status; });
  if (corrections.length) await audit(req, 'ATTENDANCE_CORRECTED', 'ClassSession', s.id, { corrections });
  res.json({ data: { saved: records.length } });
});

export async function attendanceSummary(offeringId: string, studentIds: string[]) {
  const sessions = await prisma.classSession.findMany({ where: { offeringId, startsAt: { lte: new Date() } }, select: { id: true } });
  const recs = await prisma.attendanceRecord.findMany({ where: { sessionId: { in: sessions.map((x) => x.id) }, studentId: { in: studentIds } } });
  return studentIds.map((sid) => {
    const mine = recs.filter((x) => x.studentId === sid);
    const attended = mine.filter((x) => x.status === 'PRESENT' || x.status === 'LATE').length;
    const marked = mine.filter((x) => x.status !== 'EXCUSED').length;
    return { studentId: sid, sessions: sessions.length, marked, attended, percent: marked ? Math.round((attended / marked) * 100) : null };
  });
}

r.get('/offerings/:id/attendance/me', async (req, res) => {
  const offeringId = uuid.parse(req.params.id);
  await assertStudent(req.user!, offeringId);
  const [summary] = await attendanceSummary(offeringId, [req.user!.id]);
  const records = await prisma.attendanceRecord.findMany({ where: { studentId: req.user!.id, session: { offeringId } }, include: { session: { select: { title: true, startsAt: true } } }, orderBy: { session: { startsAt: 'desc' } } });
  res.json({ data: { summary, records } });
});

r.get('/offerings/:id/attendance/report', async (req, res) => {
  const offeringId = uuid.parse(req.params.id);
  await assertStaff(req.user!, offeringId);
  const enr = await prisma.enrollment.findMany({ where: { offeringId, status: 'ACTIVE' }, include: { student: { select: { id: true, firstName: true, lastName: true } } } });
  const sum = await attendanceSummary(offeringId, enr.map((e) => e.studentId));
  res.json({ data: sum.map((s) => ({ ...s, student: enr.find((e) => e.studentId === s.studentId)!.student })) });
});

export default r;
