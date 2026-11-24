// Personal learning path: where a student is weak (course → section → topic) and what to do about it.
// Deterministic and evidence-based — every level comes with the counts it was computed from.
import { prisma } from '../../lib/prisma';
import { visibleLesson } from '../content/content.routes';

export const MASTERY = { weakBelow: 60, strongAt: 75, minAnswers: 3, trendDays: 14, trendMinAnswers: 2, trendNotable: 10 };

export type Level = 'NEEDS_WORK' | 'DEVELOPING' | 'STRONG' | 'NOT_ENOUGH_DATA';
export type Answer = { topicId: string | null; offeringId: string; correct: boolean; at: Date; source: 'QUIZ' | 'PRACTICE' };
export type Action = { text: string; to?: string; feature?: string };

const pct = (n: number, d: number) => (d ? Math.round((n / d) * 100) : null);

export function levelFor(accuracy: number | null, total: number): Level {
  if (accuracy === null || total < MASTERY.minAnswers) return 'NOT_ENOUGH_DATA';
  if (accuracy < MASTERY.weakBelow) return 'NEEDS_WORK';
  return accuracy < MASTERY.strongAt ? 'DEVELOPING' : 'STRONG';
}

/** Accuracy, level and recent-vs-earlier trend for a set of answers. */
export function mastery(answers: Answer[], now: Date) {
  const correct = answers.filter((a) => a.correct).length;
  const accuracy = pct(correct, answers.length);
  const cut = now.getTime() - MASTERY.trendDays * 86400000;
  const recent = answers.filter((a) => a.at.getTime() >= cut), earlier = answers.filter((a) => a.at.getTime() < cut);
  const acc = (xs: Answer[]) => pct(xs.filter((a) => a.correct).length, xs.length);
  const trend = recent.length >= MASTERY.trendMinAnswers && earlier.length >= MASTERY.trendMinAnswers ? acc(recent)! - acc(earlier)! : null;
  return { total: answers.length, correct, wrong: answers.length - correct, accuracy, level: levelFor(accuracy, answers.length), trend };
}

type LessonRef = { id: string; title: string; section: string; done: boolean };

/** Plain-language feedback: what the numbers mean, then concrete next steps. */
export function topicFeedback(m: ReturnType<typeof mastery>, lessons: LessonRef[], offeringId: string): { summary: string; actions: Action[] } {
  const actions: Action[] = [];
  let summary: string;
  if (m.level === 'NOT_ENOUGH_DATA') summary = m.total ? `Only ${m.total} answer(s) so far — attempt more questions to get a reliable picture.` : 'No quiz or revision answers on this topic yet.';
  else if (m.level === 'STRONG') summary = `Strong: ${m.correct} of ${m.total} correct (${m.accuracy}%). Keep it fresh with daily revision.`;
  else summary = `${m.level === 'NEEDS_WORK' ? 'Needs work' : 'Developing'}: ${m.wrong} of ${m.total} answers were wrong (${m.accuracy}% correct; target ${MASTERY.strongAt}%).`;
  if (m.trend !== null && Math.abs(m.trend) >= MASTERY.trendNotable) {
    summary += m.trend > 0 ? ` Improving — up ${m.trend} points in the last ${MASTERY.trendDays} days. Keep going!` : ` Slipping — down ${-m.trend} points in the last ${MASTERY.trendDays} days. Revisit it now.`;
  }
  if (m.level === 'STRONG') return { summary, actions };

  for (const l of lessons.filter((x) => !x.done).slice(0, 2)) actions.push({ text: `Complete the lesson "${l.title}" (${l.section})`, to: `/lessons/${l.id}` });
  if (m.level !== 'NOT_ENOUGH_DATA') {
    for (const l of lessons.filter((x) => x.done).slice(0, 1)) actions.push({ text: `Re-read "${l.title}" (${l.section}) and note what you got wrong`, to: `/lessons/${l.id}` });
    actions.push({ text: "Do today's daily revision — it repeats questions you got wrong first", to: '/revision', feature: 'dailyRevision' });
    actions.push({ text: 'Still unclear? Post a doubt for your faculty and classmates', to: `/offerings/${offeringId}?tab=doubts`, feature: 'doubtBoard' });
  } else {
    actions.push({ text: 'Attempt the course quizzes to measure this topic', to: `/offerings/${offeringId}?tab=quizzes` });
  }
  return { summary, actions };
}

const RANK: Record<Level, number> = { NEEDS_WORK: 0, DEVELOPING: 1, NOT_ENOUGH_DATA: 2, STRONG: 3 };
const byWeakness = <T extends { level: Level; accuracy: number | null }>(a: T, b: T) => RANK[a.level] - RANK[b.level] || (a.accuracy ?? 101) - (b.accuracy ?? 101);

export async function learningPath(studentId: string, now = new Date()) {
  const enr = await prisma.enrollment.findMany({
    where: { studentId, status: 'ACTIVE', offering: { status: 'PUBLISHED' } },
    select: { offeringId: true, offering: { select: { course: { select: { code: true, title: true } } } } },
  });
  const ids = enr.map((e) => e.offeringId);
  const [topics, lessons, quizAns, practiceAns, overdue] = await Promise.all([
    prisma.topic.findMany({ where: { offeringId: { in: ids } }, select: { id: true, name: true, offeringId: true } }),
    prisma.lesson.findMany({
      where: { offeringId: { in: ids }, ...visibleLesson() }, orderBy: [{ module: { position: 'asc' } }, { position: 'asc' }],
      select: { id: true, title: true, offeringId: true, isRequired: true, module: { select: { id: true, title: true } }, topics: { select: { topicId: true } }, progress: { where: { studentId }, select: { studentId: true } } },
    }),
    // Only quizzes whose results are published — otherwise this would leak correctness early.
    prisma.attemptAnswer.findMany({
      where: { isCorrect: { not: null }, attempt: { studentId, status: { not: 'IN_PROGRESS' }, quiz: { offeringId: { in: ids }, resultsPublished: true } } },
      select: { isCorrect: true, attempt: { select: { submittedAt: true, startedAt: true, quiz: { select: { offeringId: true } } } }, questionVersion: { select: { question: { select: { topicId: true } } } } },
    }),
    prisma.revisionAnswer.findMany({
      where: { attempt: { submittedAt: { not: null }, revisionQuiz: { studentId, offeringId: { in: ids } } } },
      select: { correct: true, attempt: { select: { submittedAt: true, revisionQuiz: { select: { offeringId: true } } } }, questionVersion: { select: { question: { select: { topicId: true } } } } },
    }),
    prisma.assignment.findMany({ where: { offeringId: { in: ids }, status: { in: ['PUBLISHED', 'CLOSED'] }, dueAt: { lte: now }, submissions: { none: { studentId } } }, select: { offeringId: true } }),
  ]);

  const answers: Answer[] = [
    ...quizAns.map((a) => ({ topicId: a.questionVersion.question.topicId, offeringId: a.attempt.quiz.offeringId, correct: !!a.isCorrect, at: a.attempt.submittedAt ?? a.attempt.startedAt, source: 'QUIZ' as const })),
    ...practiceAns.map((a) => ({ topicId: a.questionVersion.question.topicId, offeringId: a.attempt.revisionQuiz.offeringId, correct: a.correct, at: a.attempt.submittedAt!, source: 'PRACTICE' as const })),
  ];

  const courses = enr.map((e) => {
    const oid = e.offeringId;
    const mine = answers.filter((a) => a.offeringId === oid);
    const ls = lessons.filter((l) => l.offeringId === oid);
    const ref = (l: (typeof ls)[number]): LessonRef => ({ id: l.id, title: l.title, section: l.module.title, done: l.progress.length > 0 });

    const topicRows = topics.filter((t) => t.offeringId === oid).map((t) => {
      const m = mastery(mine.filter((a) => a.topicId === t.id), now);
      const linked = ls.filter((l) => l.topics.some((x) => x.topicId === t.id)).map(ref);
      return { topicId: t.id, name: t.name, sections: [...new Set(linked.map((l) => l.section))], ...m, ...topicFeedback(m, linked, oid) };
    }).sort(byWeakness);

    // Sections = course modules. Accuracy comes from questions on topics taught in that module's lessons.
    const sectionMap = new Map<string, { id: string; title: string; lessons: typeof ls }>();
    for (const l of ls) { const s = sectionMap.get(l.module.id) ?? { id: l.module.id, title: l.module.title, lessons: [] }; s.lessons.push(l); sectionMap.set(l.module.id, s); }
    const sections = [...sectionMap.values()].map((s) => {
      const tids = new Set(s.lessons.flatMap((l) => l.topics.map((t) => t.topicId)));
      const m = mastery(mine.filter((a) => a.topicId && tids.has(a.topicId)), now);
      const req = s.lessons.filter((l) => l.isRequired);
      return { sectionId: s.id, title: s.title, completionPct: pct(req.filter((l) => l.progress.length).length, req.length), lessonsLeft: req.filter((l) => !l.progress.length).length, ...m };
    }).sort(byWeakness);

    const overall = mastery(mine, now);
    const req = ls.filter((l) => l.isRequired);
    const completionPct = pct(req.filter((l) => l.progress.length).length, req.length);
    const missing = overdue.filter((a) => a.offeringId === oid).length;
    const actions: Action[] = [];
    if (missing) actions.push({ text: `Submit ${missing} overdue assignment${missing > 1 ? 's' : ''}`, to: `/offerings/${oid}?tab=assignments` });
    const weakSection = sections.find((s) => s.level === 'NEEDS_WORK');
    if (weakSection) actions.push({ text: `Focus on the section "${weakSection.title}" — ${weakSection.accuracy}% correct so far`, to: `/offerings/${oid}` });
    if (completionPct !== null && completionPct < 50) actions.push({ text: `You've finished ${completionPct}% of required lessons — aim to complete the next one today`, to: `/offerings/${oid}` });
    return { offeringId: oid, course: e.offering.course, completionPct, missingAssignments: missing, ...overall, sections, topics: topicRows, actions };
  }).sort(byWeakness);

  const focus = courses.flatMap((c) => c.topics.filter((t) => t.level === 'NEEDS_WORK' || t.level === 'DEVELOPING').map((t) => ({ ...t, offeringId: c.offeringId, course: c.course }))).sort(byWeakness).slice(0, 5);
  return { generatedAt: now, rules: MASTERY, overall: mastery(answers, now), courses, focus };
}
