// Performance analysis: one place that joins marks, attendance, engagement and topic mastery for a course.
// Built on the existing gradebook, attendance and class-insights calculations so every number matches those pages.
import { prisma } from '../../lib/prisma';
import { computeGradebook } from '../gradebook/gradebook.service';
import { attendanceSummary } from '../attendance/attendance.routes';
import { overview, studentsTable, topics, wrongAnswers, type Range } from '../analytics/analytics.service';
import { GRADE_SCALE, PASS_PCT, gradeFor } from '../results/results.service';

export const ATTENDANCE_MIN = 75; // college attendance requirement (see academic calendar: shortage list)
const ALL_TIME = (): Range => ({ from: new Date(0), to: new Date() });
const r1 = (n: number) => Math.round(n * 10) / 10;

export type StudentRow = {
  student: { id: string; firstName: string; lastName: string; email: string };
  totalPct: number | null; assignmentsPct: number | null; quizzesPct: number | null; grade: string | null;
  attendancePct: number | null; completionPct: number | null; missing: number; lastActivity: Date | null;
  risks: string[]; atRisk: boolean;
};

/** Class-level statistics over students' weighted totals. Students with no graded work are excluded, not counted as zero. */
export function classStats(rows: Pick<StudentRow, 'totalPct' | 'attendancePct' | 'atRisk'>[]) {
  const totals = rows.map((r) => r.totalPct).filter((x): x is number => x !== null).sort((a, b) => a - b);
  const att = rows.map((r) => r.attendancePct).filter((x): x is number => x !== null);
  const mid = totals.length >> 1;
  const distribution = GRADE_SCALE.map((g) => ({ grade: g.grade, n: totals.filter((t) => gradeFor(t).grade === g.grade).length }));
  return {
    students: rows.length, graded: totals.length,
    average: totals.length ? r1(totals.reduce((a, b) => a + b, 0) / totals.length) : null,
    median: totals.length ? r1(totals.length % 2 ? totals[mid] : (totals[mid - 1] + totals[mid]) / 2) : null,
    highest: totals.at(-1) ?? null, lowest: totals[0] ?? null,
    passRate: totals.length ? r1((totals.filter((t) => t >= PASS_PCT).length / totals.length) * 100) : null,
    attendance: att.length ? r1(att.reduce((a, b) => a + b, 0) / att.length) : null,
    belowAttendance: att.filter((a) => a < ATTENDANCE_MIN).length,
    atRisk: rows.filter((r) => r.atRisk).length,
    distribution: [...distribution, { grade: 'No marks', n: rows.length - totals.length }],
  };
}

/** Explainable risk flags: the existing class-insights rules plus failing marks and the attendance requirement. */
export function riskFlags(r: { totalPct: number | null; attendancePct: number | null; insightReasons: string[]; insightAtRisk: boolean }) {
  const risks = [...r.insightReasons];
  if (r.totalPct !== null && r.totalPct < PASS_PCT) risks.unshift(`Overall ${r.totalPct}% (below pass mark ${PASS_PCT}%)`);
  if (r.attendancePct !== null && r.attendancePct < ATTENDANCE_MIN) risks.unshift(`Attendance ${r.attendancePct}% (below ${ATTENDANCE_MIN}%)`);
  const atRisk = r.insightAtRisk || (r.totalPct !== null && r.totalPct < PASS_PCT) || (r.attendancePct !== null && r.attendancePct < ATTENDANCE_MIN);
  return { risks, atRisk };
}

export async function studentRows(offeringId: string) { return (await build(offeringId)).rows; }

async function build(offeringId: string) {
  const insight = await studentsTable(offeringId, ALL_TIME()); // active enrollments, sorted by surname
  const ids = insight.map((s) => s.student.id);
  const [book, att] = await Promise.all([computeGradebook(offeringId, ids, false), attendanceSummary(offeringId, ids)]);
  const rows: StudentRow[] = insight.map((s) => {
    const g = book.rows.find((x) => x.studentId === s.student.id)!;
    const a = att.find((x) => x.studentId === s.student.id);
    const attendancePct = a?.percent ?? null;
    return {
      student: s.student, totalPct: g.totalPct, assignmentsPct: g.assignmentsPct, quizzesPct: g.quizzesPct, grade: gradeFor(g.totalPct).grade,
      attendancePct, completionPct: s.completionPct, missing: s.missing, lastActivity: s.lastActivity,
      ...riskFlags({ totalPct: g.totalPct, attendancePct, insightReasons: s.reasons, insightAtRisk: s.needsAttention }),
    };
  });
  return { rows, book };
}

/** Per assessment: how the class did. Percentages use each student's counted (best / latest graded) score. */
function assessments(book: Awaited<ReturnType<typeof computeGradebook>>, students: number) {
  return book.columns.map((c) => {
    const pcts = book.rows.map((r) => r.cells[c.id]).filter((x) => x && x.max > 0).map((x) => (x!.earned / x!.max) * 100);
    return {
      id: c.id, kind: c.kind, title: c.title, dueAt: c.dueAt, graded: pcts.length, students,
      average: pcts.length ? r1(pcts.reduce((a, b) => a + b, 0) / pcts.length) : null,
      highest: pcts.length ? r1(Math.max(...pcts)) : null, lowest: pcts.length ? r1(Math.min(...pcts)) : null,
      belowPass: pcts.filter((p) => p < PASS_PCT).length,
    };
  });
}

async function attendanceTrend(offeringId: string) {
  const sessions = await prisma.classSession.findMany({
    where: { offeringId, startsAt: { lte: new Date() }, records: { some: {} } }, orderBy: { startsAt: 'asc' },
    select: { id: true, title: true, startsAt: true, records: { select: { status: true } } },
  });
  return sessions.map((s) => {
    const marked = s.records.filter((r) => r.status !== 'EXCUSED');
    const present = marked.filter((r) => r.status === 'PRESENT' || r.status === 'LATE').length;
    return { id: s.id, title: s.title, date: s.startsAt, present, marked: marked.length, pct: marked.length ? Math.round((present / marked.length) * 100) : null };
  });
}

/** Full report for one course offering. */
export async function offeringReport(offeringId: string) {
  const offering = await prisma.courseOffering.findUniqueOrThrow({
    where: { id: offeringId },
    select: { id: true, status: true, gradingWeights: true, course: { select: { code: true, title: true, credits: true } }, semester: { select: { name: true } }, section: { select: { name: true, batch: { select: { program: { select: { code: true } } } } } } },
  });
  const { rows, book } = await build(offeringId);
  const [trend, topicRows, missed, ov] = await Promise.all([
    attendanceTrend(offeringId), topics(offeringId, ALL_TIME()), wrongAnswers(offeringId, ALL_TIME()), overview(offeringId, ALL_TIME()),
  ]);
  return {
    offering, generatedAt: new Date(), rules: { passPct: PASS_PCT, attendanceMin: ATTENDANCE_MIN, gradeScale: GRADE_SCALE },
    stats: { ...classStats(rows), submissionRate: ov.submissionRate.value, lessonCompletion: ov.lessonCompletion.value, quizAccuracy: ov.quizAccuracy.value },
    students: rows, assessments: assessments(book, rows.length), attendanceTrend: trend, topics: topicRows, missedQuestions: missed.slice(0, 8),
  };
}
