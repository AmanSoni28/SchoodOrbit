// Deterministic analytics. Every metric returns its numerator, denominator and population so the UI
// can show how it was calculated. lowData flags results based on too few observations.
import { prisma } from '../../lib/prisma';
import { lessonCompletion } from '../content/content.routes';

export const LOW_DATA = 5;
export const AT_RISK_RULES = { completionBelow: 50, quizBelow: 40, missingAtLeast: 2, reasonsNeeded: 2 };

export type Range = { from: Date; to: Date };
const pct = (n: number, d: number) => (d ? Math.round((n / d) * 1000) / 10 : null);
const metric = (numerator: number, denominator: number, population: string) => ({ value: pct(numerator, denominator), numerator, denominator, population, lowData: denominator < LOW_DATA });

async function activeStudents(offeringId: string) {
  return (await prisma.enrollment.findMany({ where: { offeringId, status: 'ACTIVE' }, select: { studentId: true } })).map((e) => e.studentId);
}

async function evaluatedAnswers(offeringId: string, range: Range, studentIds?: string[]) {
  return prisma.attemptAnswer.findMany({
    where: { isCorrect: { not: null }, attempt: { quiz: { offeringId }, status: { not: 'IN_PROGRESS' }, submittedAt: { gte: range.from, lte: range.to }, studentId: studentIds ? { in: studentIds } : undefined } },
    select: { isCorrect: true, answer: true, questionVersionId: true, attempt: { select: { studentId: true } }, questionVersion: { select: { prompt: true, options: true, correctAnswer: true, question: { select: { id: true, type: true, topicId: true } } } } },
  });
}

export async function overview(offeringId: string, range: Range) {
  const students = await activeStudents(offeringId);
  const now = new Date();
  const [answers, assignments, completion, openDoubts, activity] = await Promise.all([
    evaluatedAnswers(offeringId, range, students),
    prisma.assignment.findMany({ where: { offeringId, status: { in: ['PUBLISHED', 'CLOSED'] }, dueAt: { gte: range.from, lte: range.to < now ? range.to : now } }, select: { id: true } }),
    lessonCompletion(offeringId, students),
    prisma.doubt.count({ where: { offeringId, status: 'OPEN', mergedIntoId: null, createdAt: { gte: range.from, lte: range.to } } }),
    // Deduplicated: one event per (user, type, resource, day).
    prisma.$queryRaw<{ n: bigint }[]>`SELECT COUNT(DISTINCT ("userId", type, "resourceId", date_trunc('day', "occurredAt")))::bigint AS n FROM "LearningEvent" WHERE "offeringId" = ${offeringId}::uuid AND "occurredAt" BETWEEN ${range.from} AND ${range.to}`,
  ]);
  const submitted = assignments.length
    ? (await prisma.submission.findMany({ where: { assignmentId: { in: assignments.map((a) => a.id) }, studentId: { in: students } }, distinct: ['assignmentId', 'studentId'], select: { assignmentId: true } })).length
    : 0;
  const completed = Object.values(completion.byStudent).reduce((s, n) => s + n, 0);
  return {
    range, generatedAt: now, students: students.length,
    quizAccuracy: metric(answers.filter((a) => a.isCorrect).length, answers.length, 'Evaluated quiz answers from enrolled students'),
    submissionRate: metric(submitted, students.length * assignments.length, `${assignments.length} assignment(s) due in range × ${students.length} students`),
    lessonCompletion: metric(completed, completion.requiredCount * students.length, `${completion.requiredCount} required lesson(s) × ${students.length} students`),
    unansweredDoubts: { value: openDoubts, population: 'Open doubts posted in range' },
    learningActivity: { value: Number(activity[0]?.n ?? 0), population: 'Distinct student actions (deduplicated per day)' },
  };
}

export async function topics(offeringId: string, range: Range) {
  const [topicRows, answers, practice, doubts] = await Promise.all([
    prisma.topic.findMany({ where: { offeringId }, include: { _count: { select: { lessons: true, questions: true } } } }),
    evaluatedAnswers(offeringId, range),
    prisma.revisionAnswer.findMany({ where: { attempt: { revisionQuiz: { offeringId }, submittedAt: { gte: range.from, lte: range.to } } }, select: { correct: true, questionVersion: { select: { question: { select: { topicId: true } } } } } }),
    prisma.doubt.groupBy({ by: ['topicId'], where: { offeringId, createdAt: { gte: range.from, lte: range.to }, status: { not: 'HIDDEN' } }, _count: true }),
  ]);
  return topicRows.map((t) => {
    const mine = answers.filter((a) => a.questionVersion.question.topicId === t.id);
    const prac = practice.filter((a) => a.questionVersion.question.topicId === t.id);
    return {
      topicId: t.id, name: t.name, lessons: t._count.lessons, questions: t._count.questions,
      quizAccuracy: metric(mine.filter((a) => a.isCorrect).length, mine.length, 'Evaluated quiz answers on this topic'),
      practiceAccuracy: metric(prac.filter((a) => a.correct).length, prac.length, 'Daily revision answers on this topic (practice, not graded)'),
      doubts: doubts.find((d) => d.topicId === t.id)?._count ?? 0,
    };
  });
}

export async function wrongAnswers(offeringId: string, range: Range) {
  const answers = await evaluatedAnswers(offeringId, range);
  const byQ = new Map<string, { prompt: string; type: string; total: number; wrong: number; choices: Record<string, number>; options: any }>();
  for (const a of answers) {
    const k = a.questionVersionId;
    const row = byQ.get(k) ?? { prompt: a.questionVersion.prompt, type: a.questionVersion.question.type, total: 0, wrong: 0, choices: {}, options: a.questionVersion.options };
    row.total++;
    if (!a.isCorrect) {
      row.wrong++;
      if (typeof a.answer === 'string' && a.questionVersion.question.type !== 'SHORT') row.choices[a.answer] = (row.choices[a.answer] ?? 0) + 1;
    }
    byQ.set(k, row);
  }
  return [...byQ.entries()].map(([questionVersionId, r]) => {
    const top = Object.entries(r.choices).sort((a, b) => b[1] - a[1])[0];
    const opt = top && Array.isArray(r.options) ? (r.options as any[]).find((o) => o.id === top[0]) : null;
    return { questionVersionId, prompt: r.prompt, type: r.type, total: r.total, wrong: r.wrong, wrongRate: pct(r.wrong, r.total), mostCommonWrong: opt ? { text: opt.text, count: top[1] } : null, lowData: r.total < LOW_DATA };
  }).filter((r) => r.wrong > 0).sort((a, b) => (b.wrongRate ?? 0) - (a.wrongRate ?? 0)).slice(0, 15);
}

export async function studentsTable(offeringId: string, range: Range) {
  const enr = await prisma.enrollment.findMany({ where: { offeringId, status: 'ACTIVE' }, include: { student: { select: { id: true, firstName: true, lastName: true, email: true } } }, orderBy: { student: { lastName: 'asc' } } });
  const ids = enr.map((e) => e.studentId);
  const now = new Date();
  const [completion, attempts, due, subs, last] = await Promise.all([
    lessonCompletion(offeringId, ids),
    prisma.quizAttempt.findMany({ where: { quiz: { offeringId }, status: 'GRADED', studentId: { in: ids }, submittedAt: { gte: range.from, lte: range.to } }, select: { studentId: true, quizId: true, score: true, maxScore: true } }),
    prisma.assignment.findMany({ where: { offeringId, status: { in: ['PUBLISHED', 'CLOSED'] }, dueAt: { lte: now, gte: range.from } }, select: { id: true } }),
    prisma.submission.findMany({ where: { assignment: { offeringId }, studentId: { in: ids } }, distinct: ['assignmentId', 'studentId'], select: { assignmentId: true, studentId: true } }),
    prisma.learningEvent.groupBy({ by: ['userId'], where: { offeringId, userId: { in: ids } }, _max: { occurredAt: true } }),
  ]);
  return enr.map((e) => {
    const sid = e.studentId;
    const done = completion.byStudent[sid] ?? 0;
    const completionPct = completion.requiredCount ? Math.round((done / completion.requiredCount) * 100) : null;
    // Best attempt per quiz, then mean.
    const best = new Map<string, number>();
    for (const a of attempts.filter((x) => x.studentId === sid && Number(x.maxScore) > 0)) best.set(a.quizId, Math.max(best.get(a.quizId) ?? 0, Number(a.score) / Number(a.maxScore)));
    const quizAvg = best.size ? Math.round(([...best.values()].reduce((s, x) => s + x, 0) / best.size) * 100) : null;
    const missing = due.filter((a) => !subs.some((s) => s.assignmentId === a.id && s.studentId === sid)).length;
    const reasons: string[] = [];
    if (completionPct !== null && completionPct < AT_RISK_RULES.completionBelow) reasons.push(`Lesson completion ${completionPct}% (< ${AT_RISK_RULES.completionBelow}%)`);
    if (quizAvg !== null && quizAvg < AT_RISK_RULES.quizBelow) reasons.push(`Quiz average ${quizAvg}% (< ${AT_RISK_RULES.quizBelow}%)`);
    if (missing >= AT_RISK_RULES.missingAtLeast) reasons.push(`${missing} past-due assignment(s) not submitted`);
    return {
      student: e.student, completionPct, quizAvg, quizzesTaken: best.size, assignmentsDue: due.length, missing,
      lastActivity: last.find((l) => l.userId === sid)?._max.occurredAt ?? null,
      needsAttention: reasons.length >= AT_RISK_RULES.reasonsNeeded, reasons,
    };
  });
}

export async function doubtTrends(offeringId: string, range: Range) {
  const doubts = await prisma.doubt.findMany({
    where: { offeringId, createdAt: { gte: range.from, lte: range.to }, mergedIntoId: null },
    select: { createdAt: true, status: true, voteCount: true, title: true, id: true, topic: { select: { name: true } }, lesson: { select: { title: true } } },
  });
  const week = (d: Date) => { const x = new Date(d); x.setUTCHours(0, 0, 0, 0); x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7)); return x.toISOString().slice(0, 10); };
  const weeks: Record<string, { week: string; posted: number; answered: number }> = {};
  const byTopic: Record<string, { topic: string; open: number; total: number }> = {};
  for (const d of doubts) {
    const w = week(d.createdAt);
    weeks[w] ??= { week: w, posted: 0, answered: 0 };
    weeks[w].posted++;
    if (d.status === 'ANSWERED' || d.status === 'RESOLVED') weeks[w].answered++;
    const t = d.topic?.name ?? d.lesson?.title ?? 'General';
    byTopic[t] ??= { topic: t, open: 0, total: 0 };
    byTopic[t].total++;
    if (d.status === 'OPEN') byTopic[t].open++;
  }
  return {
    weekly: Object.values(weeks).sort((a, b) => a.week.localeCompare(b.week)),
    byTopic: Object.values(byTopic).sort((a, b) => b.open - a.open || b.total - a.total),
    topUnanswered: doubts.filter((d) => d.status === 'OPEN').sort((a, b) => b.voteCount - a.voteCount).slice(0, 5).map((d) => ({ id: d.id, title: d.title, votes: d.voteCount })),
  };
}

/** Evidence-linked suggestions, generated only from metrics with enough data. */
export async function suggestions(offeringId: string, range: Range) {
  const [t, trends] = await Promise.all([topics(offeringId, range), doubtTrends(offeringId, range)]);
  const out: { topicId: string | null; title: string; evidence: Record<string, unknown> }[] = [];
  for (const x of t) {
    if (!x.quizAccuracy.lowData && (x.quizAccuracy.value ?? 100) < 60) {
      out.push({ topicId: x.topicId, title: `Schedule a revision session on "${x.name}"`, evidence: { metric: 'quizAccuracy', value: x.quizAccuracy.value, numerator: x.quizAccuracy.numerator, denominator: x.quizAccuracy.denominator } });
    }
    if (x.doubts >= 3) out.push({ topicId: x.topicId, title: `Address recurring doubts on "${x.name}" in class`, evidence: { metric: 'doubts', value: x.doubts } });
  }
  for (const d of trends.topUnanswered.filter((d) => d.votes >= 3)) {
    out.push({ topicId: null, title: `Answer the highly upvoted doubt: "${d.title}"`, evidence: { metric: 'doubtVotes', value: d.votes, doubtId: d.id } });
  }
  return out;
}

export function parseRange(q: { from?: string; to?: string }): Range {
  const to = q.to ? new Date(q.to) : new Date();
  const from = q.from ? new Date(q.from) : new Date(to.getTime() - 90 * 86400000);
  return { from, to };
}
