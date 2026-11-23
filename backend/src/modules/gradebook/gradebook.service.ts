import { prisma } from '../../lib/prisma';

export type Weights = { assignments: number; quizzes: number };
type Cell = { earned: number; max: number; late?: boolean } | null;

const round = (n: number) => Math.round(n * 100) / 100;

/** Late penalty is applied at read time so the raw mark entered by faculty is preserved. */
export const effectiveScore = (score: number, isLate: boolean, penaltyPct: number) => (isLate ? score * (1 - penaltyPct / 100) : score);

/**
 * Category % = earned / max over graded items in the category.
 * Total = weighted mean of categories that have at least one graded item (weights renormalised).
 * Items without a grade are excluded (shown as "—"), not counted as zero.
 */
export function weightedTotal(cells: { kind: 'assignment' | 'quiz'; cell: Cell }[], w: Weights) {
  const cat = (k: 'assignment' | 'quiz') => {
    const xs = cells.filter((c) => c.kind === k && c.cell).map((c) => c.cell!);
    const max = xs.reduce((s, x) => s + x.max, 0);
    return max ? (xs.reduce((s, x) => s + x.earned, 0) / max) * 100 : null;
  };
  const parts = [
    { pct: cat('assignment'), w: w.assignments },
    { pct: cat('quiz'), w: w.quizzes },
  ].filter((p) => p.pct !== null && p.w > 0);
  const wsum = parts.reduce((s, p) => s + p.w, 0);
  return {
    assignmentsPct: cat('assignment') === null ? null : round(cat('assignment')!),
    quizzesPct: cat('quiz') === null ? null : round(cat('quiz')!),
    totalPct: wsum ? round(parts.reduce((s, p) => s + p.pct! * p.w, 0) / wsum) : null,
  };
}

/** publishedOnly=true is the student/parent view: unpublished marks are invisible. */
export async function computeGradebook(offeringId: string, studentIds: string[], publishedOnly: boolean) {
  const offering = await prisma.courseOffering.findUniqueOrThrow({ where: { id: offeringId }, select: { gradingWeights: true } });
  const weights = offering.gradingWeights as Weights;
  const [assignments, quizzes] = await Promise.all([
    prisma.assignment.findMany({
      where: { offeringId, status: { in: ['PUBLISHED', 'CLOSED'] } }, orderBy: { dueAt: 'asc' },
      include: { submissions: { where: { studentId: { in: studentIds }, status: 'GRADED', ...(publishedOnly ? { gradePublishedAt: { not: null } } : {}) }, orderBy: { attemptNo: 'desc' } } },
    }),
    prisma.quiz.findMany({
      where: { offeringId, status: { in: ['PUBLISHED', 'CLOSED'] }, ...(publishedOnly ? { resultsPublished: true } : {}) }, orderBy: { createdAt: 'asc' },
      include: { attempts: { where: { studentId: { in: studentIds }, status: 'GRADED' } } },
    }),
  ]);
  const columns = [
    ...assignments.map((a) => ({ id: a.id, kind: 'assignment' as const, title: a.title, max: a.maxPoints, dueAt: a.dueAt })),
    ...quizzes.map((q) => ({ id: q.id, kind: 'quiz' as const, title: q.title, max: null as number | null, dueAt: q.closesAt })),
  ];
  const rows = studentIds.map((sid) => {
    const cells: Record<string, Cell> = {};
    const list: { kind: 'assignment' | 'quiz'; cell: Cell }[] = [];
    for (const a of assignments) {
      const s = a.submissions.find((x) => x.studentId === sid); // latest graded attempt
      const cell = s && s.score !== null ? { earned: round(effectiveScore(Number(s.score), s.isLate, a.latePenaltyPct)), max: a.maxPoints, late: s.isLate } : null;
      cells[a.id] = cell; list.push({ kind: 'assignment', cell });
    }
    for (const q of quizzes) {
      // Best graded attempt counts.
      const best = q.attempts.filter((x) => x.studentId === sid && x.maxScore && Number(x.maxScore) > 0)
        .sort((x, y) => Number(y.score) / Number(y.maxScore) - Number(x.score) / Number(x.maxScore))[0];
      const cell = best ? { earned: Number(best.score), max: Number(best.maxScore) } : null;
      cells[q.id] = cell; list.push({ kind: 'quiz', cell });
    }
    return { studentId: sid, cells, ...weightedTotal(list, weights) };
  });
  return { weights, columns, rows };
}
