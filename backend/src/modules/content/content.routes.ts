import { Router } from 'express';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { authenticate, requireRole } from '../../middleware/auth';
import { badRequest, notFound } from '../../lib/errors';
import { assertInstructor, assertMember, assertStaff, assertStudent } from '../../lib/policies';
import { notify } from '../../lib/notify';

const r = Router();
const uuid = z.string().uuid();

// A lesson is visible to students when published, or scheduled and its publish time has passed.
export const visibleLesson = (): Prisma.LessonWhereInput => ({
  OR: [{ status: 'PUBLISHED' }, { status: 'SCHEDULED', publishAt: { lte: new Date() } }],
});

// ── Topics ──
r.get('/offerings/:id/topics', async (req, res) => {
  const offeringId = uuid.parse(req.params.id);
  await assertMember(req.user!, offeringId);
  res.json({ data: await prisma.topic.findMany({ where: { offeringId }, orderBy: { name: 'asc' } }) });
});
r.post('/offerings/:id/topics', async (req, res) => {
  const offeringId = uuid.parse(req.params.id);
  await assertInstructor(req.user!, offeringId);
  const { name } = z.object({ name: z.string().min(1).max(80) }).parse(req.body);
  res.status(201).json({ data: await prisma.topic.create({ data: { offeringId, name: name.trim() } }) });
});

// ── Modules & lessons tree ──
r.get('/offerings/:id/modules', async (req, res) => {
  const offeringId = uuid.parse(req.params.id);
  const a = await assertMember(req.user!, offeringId);
  const staff = a.isInstructor || a.isAdmin;
  const modules = await prisma.courseModule.findMany({
    where: { offeringId },
    orderBy: { position: 'asc' },
    include: {
      lessons: {
        where: staff ? { status: { not: 'ARCHIVED' } } : visibleLesson(),
        orderBy: { position: 'asc' },
        select: { id: true, title: true, status: true, publishAt: true, isRequired: true, position: true, videoUrl: true,
          progress: a.isStudent ? { where: { studentId: req.user!.id }, select: { completedAt: true } } : false },
      },
    },
  });
  res.json({ data: modules });
});

r.post('/offerings/:id/modules', async (req, res) => {
  const offeringId = uuid.parse(req.params.id);
  await assertInstructor(req.user!, offeringId);
  const { title } = z.object({ title: z.string().min(1).max(160) }).parse(req.body);
  const position = await prisma.courseModule.count({ where: { offeringId } });
  res.status(201).json({ data: await prisma.courseModule.create({ data: { offeringId, title, position } }) });
});

async function moduleOf(id: string) {
  const m = await prisma.courseModule.findUnique({ where: { id } });
  if (!m) throw notFound('Module not found');
  return m;
}
r.patch('/modules/:id', async (req, res) => {
  const m = await moduleOf(uuid.parse(req.params.id));
  await assertInstructor(req.user!, m.offeringId);
  const body = z.object({ title: z.string().min(1).max(160), position: z.number().int().min(0) }).partial().parse(req.body);
  res.json({ data: await prisma.courseModule.update({ where: { id: m.id }, data: body }) });
});
r.delete('/modules/:id', async (req, res) => {
  const m = await moduleOf(uuid.parse(req.params.id));
  await assertInstructor(req.user!, m.offeringId);
  if (await prisma.lesson.count({ where: { moduleId: m.id } })) throw badRequest('Move or delete the lessons in this module first');
  await prisma.courseModule.delete({ where: { id: m.id } });
  res.json({ data: { ok: true } });
});

const lessonBody = z.object({
  title: z.string().min(1).max(200), content: z.string().max(100_000), videoUrl: z.string().url().nullable(),
  learningOutcomes: z.string().max(4000).nullable(), status: z.enum(['DRAFT', 'SCHEDULED', 'PUBLISHED', 'ARCHIVED']),
  publishAt: z.coerce.date().nullable(), isRequired: z.boolean(), position: z.number().int().min(0), topicIds: z.array(uuid).max(20),
});

r.post('/modules/:id/lessons', async (req, res) => {
  const m = await moduleOf(uuid.parse(req.params.id));
  await assertInstructor(req.user!, m.offeringId);
  const body = lessonBody.partial({ content: true, videoUrl: true, learningOutcomes: true, status: true, publishAt: true, isRequired: true, position: true, topicIds: true }).parse(req.body);
  if (body.status === 'SCHEDULED' && !body.publishAt) throw badRequest('Choose a publish date for a scheduled lesson');
  const { topicIds, ...data } = body;
  const position = data.position ?? (await prisma.lesson.count({ where: { moduleId: m.id } }));
  const lesson = await prisma.lesson.create({
    data: { ...data, position, moduleId: m.id, offeringId: m.offeringId, topics: topicIds ? { create: topicIds.map((topicId) => ({ topicId })) } : undefined },
  });
  if (lesson.status === 'PUBLISHED') await notifyStudents(m.offeringId, `New lesson: ${lesson.title}`, `/lessons/${lesson.id}`);
  res.status(201).json({ data: lesson });
});

async function notifyStudents(offeringId: string, title: string, link: string) {
  const enr = await prisma.enrollment.findMany({ where: { offeringId, status: 'ACTIVE' }, select: { studentId: true } });
  await notify(enr.map((e) => e.studentId), { type: 'LESSON', title, link });
}

async function lessonOf(id: string) {
  const l = await prisma.lesson.findUnique({ where: { id } });
  if (!l) throw notFound('Lesson not found');
  return l;
}

r.get('/lessons/:id', async (req, res) => {
  const l = await lessonOf(uuid.parse(req.params.id));
  const a = await assertMember(req.user!, l.offeringId);
  const staff = a.isInstructor || a.isAdmin;
  const lesson = await prisma.lesson.findFirst({
    where: { id: l.id, ...(staff ? {} : visibleLesson()) },
    include: {
      resources: { include: { fileAsset: { select: { id: true, originalName: true, mimeType: true, size: true } } }, orderBy: { createdAt: 'asc' } },
      topics: { include: { topic: true } },
      module: { select: { id: true, title: true } },
      progress: a.isStudent ? { where: { studentId: req.user!.id } } : false,
    },
  });
  if (!lesson) throw notFound('Lesson not found');
  if (a.isStudent) await prisma.learningEvent.create({ data: { userId: req.user!.id, offeringId: l.offeringId, resourceType: 'LESSON', resourceId: l.id, type: 'VIEWED' } });
  res.json({ data: { ...lesson, access: { isInstructor: a.isInstructor, isStudent: a.isStudent, isAdmin: a.isAdmin } } });
});

r.patch('/lessons/:id', async (req, res) => {
  const l = await lessonOf(uuid.parse(req.params.id));
  await assertInstructor(req.user!, l.offeringId);
  const { topicIds, ...data } = lessonBody.partial().parse(req.body);
  if (data.status === 'SCHEDULED' && !(data.publishAt ?? l.publishAt)) throw badRequest('Choose a publish date for a scheduled lesson');
  const updated = await prisma.$transaction(async (tx) => {
    if (topicIds) {
      await tx.lessonTopic.deleteMany({ where: { lessonId: l.id } });
      await tx.lessonTopic.createMany({ data: topicIds.map((topicId) => ({ lessonId: l.id, topicId })) });
    }
    return tx.lesson.update({ where: { id: l.id }, data });
  });
  if (l.status !== 'PUBLISHED' && updated.status === 'PUBLISHED') await notifyStudents(l.offeringId, `New lesson: ${updated.title}`, `/lessons/${l.id}`);
  res.json({ data: updated });
});

r.delete('/lessons/:id', async (req, res) => {
  const l = await lessonOf(uuid.parse(req.params.id));
  await assertInstructor(req.user!, l.offeringId);
  // Archive rather than delete: progress records and doubts reference lessons.
  res.json({ data: await prisma.lesson.update({ where: { id: l.id }, data: { status: 'ARCHIVED' } }) });
});

// ── Resources (file attachment or external link) ──
r.post('/lessons/:id/resources', async (req, res) => {
  const l = await lessonOf(uuid.parse(req.params.id));
  await assertInstructor(req.user!, l.offeringId);
  const body = z.discriminatedUnion('type', [
    z.object({ type: z.literal('LINK'), title: z.string().min(1).max(200), url: z.string().url() }),
    z.object({ type: z.literal('FILE'), title: z.string().min(1).max(200), fileAssetId: uuid }),
  ]).parse(req.body);
  if (body.type === 'FILE') {
    const f = await prisma.fileAsset.findUnique({ where: { id: body.fileAssetId } });
    if (!f || f.ownerId !== req.user!.id) throw badRequest('Upload the file first');
  }
  res.status(201).json({ data: await prisma.lessonResource.create({ data: { ...body, lessonId: l.id } }) });
});

r.delete('/resources/:id', async (req, res) => {
  const resource = await prisma.lessonResource.findUnique({ where: { id: uuid.parse(req.params.id) }, include: { lesson: true } });
  if (!resource) throw notFound();
  await assertInstructor(req.user!, resource.lesson.offeringId);
  await prisma.lessonResource.delete({ where: { id: resource.id } });
  res.json({ data: { ok: true } });
});

// ── Progress ──
r.post('/lessons/:id/complete', requireRole('STUDENT'), async (req, res) => {
  const l = await lessonOf(uuid.parse(req.params.id));
  await assertStudent(req.user!, l.offeringId);
  const visible = await prisma.lesson.count({ where: { id: l.id, ...visibleLesson() } });
  if (!visible) throw notFound('Lesson not found');
  await prisma.lessonProgress.upsert({ where: { lessonId_studentId: { lessonId: l.id, studentId: req.user!.id } }, create: { lessonId: l.id, studentId: req.user!.id }, update: {} });
  await prisma.learningEvent.create({ data: { userId: req.user!.id, offeringId: l.offeringId, resourceType: 'LESSON', resourceId: l.id, type: 'COMPLETED' } });
  res.json({ data: { ok: true } });
});

export async function lessonCompletion(offeringId: string, studentIds?: string[]) {
  const required = await prisma.lesson.findMany({ where: { offeringId, isRequired: true, ...visibleLesson() }, select: { id: true } });
  const done = await prisma.lessonProgress.groupBy({
    by: ['studentId'], _count: true,
    where: { lessonId: { in: required.map((l) => l.id) }, studentId: studentIds ? { in: studentIds } : undefined },
  });
  return { requiredCount: required.length, byStudent: Object.fromEntries(done.map((d) => [d.studentId, d._count])) as Record<string, number> };
}

r.get('/offerings/:id/progress', async (req, res) => {
  const offeringId = uuid.parse(req.params.id);
  const a = await assertMember(req.user!, offeringId);
  if (a.isStudent && !a.isInstructor) {
    const c = await lessonCompletion(offeringId, [req.user!.id]);
    const done = c.byStudent[req.user!.id] ?? 0;
    return res.json({ data: { requiredLessons: c.requiredCount, completed: done, percent: c.requiredCount ? Math.round((done / c.requiredCount) * 100) : null } });
  }
  await assertStaff(req.user!, offeringId);
  const enr = await prisma.enrollment.findMany({ where: { offeringId, status: 'ACTIVE' }, include: { student: { select: { id: true, firstName: true, lastName: true, email: true } } } });
  const c = await lessonCompletion(offeringId);
  res.json({
    data: {
      requiredLessons: c.requiredCount,
      students: enr.map((e) => ({ student: e.student, completed: c.byStudent[e.studentId] ?? 0, percent: c.requiredCount ? Math.round(((c.byStudent[e.studentId] ?? 0) / c.requiredCount) * 100) : null })),
    },
  });
});

export default r;
