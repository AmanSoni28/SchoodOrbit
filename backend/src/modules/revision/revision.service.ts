import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { addDays } from '../../lib/time';

/**
 * Builds (or returns) the student's revision quiz for a local date. Idempotent:
 * the unique (student, offering, date) constraint guarantees at most one quiz per day.
 * Eligible questions: APPROVED, auto-gradable, topic linked to a lesson the student completed
 * within the policy window. If none qualify the quiz is stored as NO_CONTENT — never invented.
 */
export async function ensureRevisionQuiz(studentId: string, offeringId: string, date: string) {
  const existing = await prisma.revisionQuiz.findUnique({ where: { studentId_offeringId_scheduledLocalDate: { studentId, offeringId, scheduledLocalDate: date } } });
  if (existing) return existing;

  const policy = await prisma.revisionPolicy.findUnique({ where: { offeringId } });
  if (!policy?.enabled) return null;

  const since = new Date(new Date(addDays(date, -policy.topicWindowDays) + 'T00:00:00Z'));
  const completed = await prisma.lessonProgress.findMany({ where: { studentId, completedAt: { gte: since }, lesson: { offeringId } }, select: { lessonId: true } });
  const topics = await prisma.lessonTopic.findMany({ where: { lessonId: { in: completed.map((c) => c.lessonId) } }, select: { topicId: true } });
  const candidates = await prisma.question.findMany({
    where: {
      offeringId, status: 'APPROVED', topicId: { in: [...new Set(topics.map((t) => t.topicId))] },
      OR: [{ type: { in: ['MCQ', 'MULTI', 'TRUE_FALSE'] } }],
    },
    include: { versions: { orderBy: { version: 'desc' }, take: 1 } },
  });

  // Prefer questions the student previously got wrong in practice, then unseen ones; shuffle within groups.
  const wrong = new Set((await prisma.revisionAnswer.findMany({ where: { correct: false, attempt: { revisionQuiz: { studentId, offeringId } } }, select: { questionVersion: { select: { questionId: true } } } })).map((x) => x.questionVersion.questionId));
  const seen = new Set((await prisma.revisionQuizQuestion.findMany({ where: { revisionQuiz: { studentId, offeringId } }, select: { questionVersion: { select: { questionId: true } } } })).map((x) => x.questionVersion.questionId));
  const shuffle = <T,>(xs: T[]) => xs.map((x) => [Math.random(), x] as const).sort((a, b) => a[0] - b[0]).map(([, x]) => x);
  const ordered = [
    ...shuffle(candidates.filter((q) => wrong.has(q.id))),
    ...shuffle(candidates.filter((q) => !wrong.has(q.id) && !seen.has(q.id))),
    ...shuffle(candidates.filter((q) => !wrong.has(q.id) && seen.has(q.id))),
  ].slice(0, policy.questionsPerDay);

  try {
    return await prisma.revisionQuiz.create({
      data: {
        studentId, offeringId, scheduledLocalDate: date, status: ordered.length ? 'READY' : 'NO_CONTENT',
        questions: { create: ordered.map((q, position) => ({ questionVersionId: q.versions[0].id, position })) },
      },
    });
  } catch (e) {
    // Concurrent request created it first — return that one.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return prisma.revisionQuiz.findUniqueOrThrow({ where: { studentId_offeringId_scheduledLocalDate: { studentId, offeringId, scheduledLocalDate: date } } });
    }
    throw e;
  }
}

/** Streak: consecutive local days with at least one completed revision quiz. */
export function nextStreak(prev: { lastCompletedDate: string | null; currentStreak: number; longestStreak: number } | null, today: string) {
  if (prev?.lastCompletedDate === today) return prev;
  const current = prev?.lastCompletedDate === addDays(today, -1) ? prev.currentStreak + 1 : 1;
  return { lastCompletedDate: today, currentStreak: current, longestStreak: Math.max(current, prev?.longestStreak ?? 0) };
}
