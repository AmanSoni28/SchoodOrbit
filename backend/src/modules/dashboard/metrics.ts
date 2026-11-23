// Aggregate queries shared by the role dashboards. All return plain numbers/arrays — no personal data.
import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';

const DAY = 86400000;
/** UTC midnight `n` days ago. */
export const daysAgo = (n: number) => { const d = new Date(Date.now() - n * DAY); d.setUTCHours(0, 0, 0, 0); return d; };
const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Zero-filled daily series from {day, n} rows. shortcut: UTC day buckets; switch to college timezone if exact local days matter. */
export function fillDays(rows: { day: Date; n: number }[], days: number) {
  const since = daysAgo(days - 1);
  const m = new Map(rows.map((r) => [iso(r.day), r.n]));
  return Array.from({ length: days }, (_, i) => { const day = iso(new Date(since.getTime() + i * DAY)); return { day, n: m.get(day) ?? 0 }; });
}

/** Learning events per day for the last `days` days, optionally scoped to users and/or offerings. */
export async function learningHeat(days: number, scope: { userId?: string; offeringIds?: string[] } = {}) {
  const since = daysAgo(days - 1);
  const rows = await prisma.$queryRaw<{ day: Date; n: number }[]>`
    SELECT date_trunc('day', "occurredAt") AS day, COUNT(*)::int AS n FROM "LearningEvent"
    WHERE "occurredAt" >= ${since}
      ${scope.userId ? Prisma.sql`AND "userId" = ${scope.userId}::uuid` : Prisma.empty}
      ${scope.offeringIds ? Prisma.sql`AND "offeringId" = ANY(${scope.offeringIds}::uuid[])` : Prisma.empty}
    GROUP BY 1`;
  return fillDays(rows, days);
}

/** Histogram of graded scores (assignments + quizzes) in 10 % buckets. */
export async function scoreBuckets(offeringIds?: string[]) {
  const rows = await prisma.$queryRaw<{ b: number; n: number }[]>`
    SELECT LEAST(GREATEST(FLOOR(p / 10), 0), 9)::int AS b, COUNT(*)::int AS n FROM (
      SELECT s.score / NULLIF(a."maxPoints", 0) * 100 AS p, a."offeringId" AS o
        FROM "Submission" s JOIN "Assignment" a ON a.id = s."assignmentId" WHERE s.score IS NOT NULL
      UNION ALL
      SELECT qa.score / NULLIF(qa."maxScore", 0) * 100, q."offeringId"
        FROM "QuizAttempt" qa JOIN "Quiz" q ON q.id = qa."quizId" WHERE qa.score IS NOT NULL AND qa.status <> 'IN_PROGRESS'
    ) x WHERE p IS NOT NULL ${offeringIds ? Prisma.sql`AND o = ANY(${offeringIds}::uuid[])` : Prisma.empty}
    GROUP BY 1`;
  const m = new Map(rows.map((r) => [r.b, r.n]));
  return Array.from({ length: 10 }, (_, b) => ({ range: `${b * 10}–${b * 10 + 10}`, n: m.get(b) ?? 0 }));
}

/** Per-offering teaching metrics: submission rate, average score and attendance. */
export async function offeringMetrics(ids: string[]) {
  if (ids.length === 0) return {};
  const [assign, subs, scores, att] = await Promise.all([
    prisma.assignment.groupBy({ by: ['offeringId'], where: { offeringId: { in: ids }, status: 'PUBLISHED', dueAt: { lte: new Date() } }, _count: true }),
    prisma.$queryRaw<{ o: string; n: number }[]>`
      SELECT a."offeringId" AS o, COUNT(DISTINCT (s."assignmentId", s."studentId"))::int AS n
      FROM "Submission" s JOIN "Assignment" a ON a.id = s."assignmentId"
      WHERE a."offeringId" = ANY(${ids}::uuid[]) AND a.status = 'PUBLISHED' AND a."dueAt" <= now() GROUP BY 1`,
    prisma.$queryRaw<{ o: string; avg: number | null }[]>`
      SELECT o, ROUND(AVG(p))::int AS avg FROM (
        SELECT s.score / NULLIF(a."maxPoints", 0) * 100 AS p, a."offeringId" AS o FROM "Submission" s JOIN "Assignment" a ON a.id = s."assignmentId" WHERE s.score IS NOT NULL
        UNION ALL
        SELECT qa.score / NULLIF(qa."maxScore", 0) * 100, q."offeringId" FROM "QuizAttempt" qa JOIN "Quiz" q ON q.id = qa."quizId" WHERE qa.score IS NOT NULL AND qa.status <> 'IN_PROGRESS'
      ) x WHERE o = ANY(${ids}::uuid[]) GROUP BY o`,
    prisma.$queryRaw<{ o: string; att: number; marked: number }[]>`
      SELECT cs."offeringId" AS o,
             COUNT(*) FILTER (WHERE ar.status IN ('PRESENT', 'LATE'))::int AS att,
             COUNT(*) FILTER (WHERE ar.status <> 'EXCUSED')::int AS marked
      FROM "AttendanceRecord" ar JOIN "ClassSession" cs ON cs.id = ar."sessionId"
      WHERE cs."offeringId" = ANY(${ids}::uuid[]) GROUP BY 1`,
  ]);
  const students = await prisma.enrollment.groupBy({ by: ['offeringId'], where: { offeringId: { in: ids }, status: 'ACTIVE' }, _count: true });
  const out: Record<string, { submissionRate: number | null; avgScore: number | null; attendance: number | null }> = {};
  for (const id of ids) {
    const expected = (assign.find((a) => a.offeringId === id)?._count ?? 0) * (students.find((s) => s.offeringId === id)?._count ?? 0);
    const got = subs.find((s) => s.o === id)?.n ?? 0;
    const a = att.find((x) => x.o === id);
    out[id] = {
      submissionRate: expected ? Math.min(100, Math.round((got / expected) * 100)) : null,
      avgScore: scores.find((s) => s.o === id)?.avg ?? null,
      attendance: a?.marked ? Math.round((a.att / a.marked) * 100) : null,
    };
  }
  return out;
}

/** {STATUS: count} from a Prisma groupBy result. */
export const byKey = <K extends string>(rows: ({ _count: number } & Record<K, string>)[], key: K) => Object.fromEntries(rows.map((r) => [r[key], r._count]));
