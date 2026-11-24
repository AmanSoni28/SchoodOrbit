// One student's performance — the same report for the student and (scope-limited) for their parents.
// Marks are PUBLISHED marks only, so nobody sees a grade before the teacher releases it.
import { prisma } from '../../lib/prisma';
import { computeGradebook } from '../gradebook/gradebook.service';
import { attendanceSummary } from '../attendance/attendance.routes';
import { lessonCompletion } from '../content/content.routes';
import { LOW_DATA } from '../analytics/analytics.service';
import { learningPath } from '../learning-path/learning-path.service';
import { gradeFor } from '../results/results.service';
import { ATTENDANCE_MIN, riskFlags } from './performance.service';

export type Scopes = { grades: boolean; attendance: boolean; progress: boolean };
export const ALL_SCOPES: Scopes = { grades: true, attendance: true, progress: true };

const r1 = (n: number) => Math.round(n * 10) / 10;
const mean = (xs: number[]) => (xs.length ? r1(xs.reduce((a, b) => a + b, 0) / xs.length) : null);

type Course = {
  offeringId: string; status: string; course: { code: string; title: string; credits: number }; semester: { id: string; name: string; startDate: Date }; instructors: string[];
  marks?: { totalPct: number | null; grade: string | null; assignmentsPct: number | null; quizzesPct: number | null; classAverage: number | null;
    items: { id: string; kind: 'assignment' | 'quiz'; title: string; date: Date | null; earned: number; max: number; pct: number; classAvg: number | null; late: boolean }[] };
  attendance?: { percent: number | null; attended: number; marked: number; sessions: number; recent: { date: Date; status: string }[] };
  progress?: { completionPct: number | null; completed: number; required: number; missing: number; upcoming: { id: string; title: string; dueAt: Date; submitted: boolean }[] };
  topics?: { name: string; accuracy: number | null; level: string; total: number }[];
  risks: string[]; atRisk: boolean;
};

/** Plain-language highlights, strongest signal first. Only uses sections the viewer may see. */
export function insights(courses: Course[]) {
  const out: { tone: 'good' | 'warn' | 'bad'; text: string }[] = [];
  const live = courses.filter((c) => c.status === 'PUBLISHED');
  for (const c of live) {
    if (c.attendance?.percent != null && c.attendance.percent < ATTENDANCE_MIN) out.push({ tone: 'bad', text: `${c.course.code} attendance is ${c.attendance.percent}% — below the ${ATTENDANCE_MIN}% requirement.` });
  }
  const overdue = live.filter((c) => c.progress?.missing);
  const nOverdue = overdue.reduce((s, c) => s + c.progress!.missing, 0);
  if (nOverdue) out.push({ tone: 'bad', text: `${nOverdue} overdue assignment${nOverdue > 1 ? 's' : ''} not submitted (${overdue.map((c) => c.course.code).join(', ')}).` });
  const marked = live.filter((c) => c.marks?.totalPct != null);
  if (marked.length) {
    const best = [...marked].sort((a, b) => b.marks!.totalPct! - a.marks!.totalPct!)[0];
    out.push({ tone: 'good', text: `Strongest course: ${best.course.code} ${best.course.title} at ${best.marks!.totalPct}%.` });
    const weak = marked.filter((c) => c.marks!.totalPct! < 50 && c !== best);
    for (const c of weak) out.push({ tone: 'warn', text: `${c.course.code} is at ${c.marks!.totalPct}% — worth extra revision.` });
    const above = marked.filter((c) => c.marks!.classAverage != null && c.marks!.totalPct! >= c.marks!.classAverage!).length;
    const compared = marked.filter((c) => c.marks!.classAverage != null).length;
    if (compared) out.push(above === 0
      ? { tone: 'warn', text: `Below the class average in ${compared === 1 ? 'this course' : `all ${compared} courses`} so far.` }
      : { tone: above >= compared / 2 ? 'good' : 'warn', text: `At or above the class average in ${above} of ${compared} course${compared > 1 ? 's' : ''}.` });
  }
  const weakTopics = live.flatMap((c) => (c.topics ?? []).filter((t) => t.level === 'NEEDS_WORK').map((t) => `${t.name} (${c.course.code})`));
  if (weakTopics.length) out.push({ tone: 'warn', text: `Topics to revise: ${weakTopics.slice(0, 4).join(', ')}${weakTopics.length > 4 ? '…' : ''}.` });
  const att = live.map((c) => c.attendance).filter((a) => a && a.marked);
  const attAll = att.length ? Math.round((att.reduce((s, a) => s + a!.attended, 0) / att.reduce((s, a) => s + a!.marked, 0)) * 100) : null;
  if (attAll !== null && attAll >= 90) out.push({ tone: 'good', text: `Excellent attendance: ${attAll}% across current courses.` });
  const order = { bad: 0, warn: 1, good: 2 };
  return out.sort((a, b) => order[a.tone] - order[b.tone]);
}

export async function studentReport(studentId: string, scopes: Scopes) {
  const [student, enr] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: studentId }, select: { id: true, firstName: true, lastName: true } }),
    prisma.enrollment.findMany({
      where: { studentId, status: { not: 'DROPPED' }, offering: { status: { in: ['PUBLISHED', 'ARCHIVED'] } } },
      select: { offeringId: true, offering: { select: { status: true, course: { select: { code: true, title: true, credits: true } }, semester: { select: { id: true, name: true, startDate: true } }, instructors: { select: { faculty: { select: { firstName: true, lastName: true } } } } } } },
      orderBy: [{ offering: { semester: { startDate: 'desc' } } }, { offering: { course: { code: 'asc' } } }],
    }),
  ]);
  const path = scopes.grades ? await learningPath(studentId) : null;
  const now = new Date();

  const courses: Course[] = await Promise.all(enr.map(async ({ offeringId: oid, offering: o }) => {
    const c: Course = { offeringId: oid, status: o.status, course: o.course, semester: o.semester, instructors: o.instructors.map((i) => `${i.faculty.firstName} ${i.faculty.lastName}`), risks: [], atRisk: false };

    if (scopes.grades) {
      // The whole class's PUBLISHED marks, for this student's row and anonymous class averages.
      const classIds = (await prisma.enrollment.findMany({ where: { offeringId: oid, status: 'ACTIVE' }, select: { studentId: true } })).map((e) => e.studentId);
      const book = await computeGradebook(oid, [...new Set([...classIds, studentId])], true);
      const mine = book.rows.find((r) => r.studentId === studentId)!;
      const others = book.rows.map((r) => r.totalPct).filter((x): x is number => x !== null);
      c.marks = {
        totalPct: mine.totalPct, grade: gradeFor(mine.totalPct).grade, assignmentsPct: mine.assignmentsPct, quizzesPct: mine.quizzesPct,
        // Class averages only with enough students that no individual mark can be inferred.
        classAverage: others.length >= LOW_DATA ? mean(others) : null,
        items: book.columns.flatMap((col) => {
          const cell = mine.cells[col.id];
          if (!cell || !cell.max) return [];
          const pcts = book.rows.map((r) => r.cells[col.id]).filter((x) => x && x.max).map((x) => (x!.earned / x!.max) * 100);
          return [{ id: col.id, kind: col.kind, title: col.title, date: col.dueAt, earned: cell.earned, max: cell.max, pct: r1((cell.earned / cell.max) * 100), classAvg: pcts.length >= LOW_DATA ? mean(pcts) : null, late: !!cell.late }];
        }),
      };
      const lp = path?.courses.find((x) => x.offeringId === oid);
      if (lp) c.topics = lp.topics.map((t) => ({ name: t.name, accuracy: t.accuracy, level: t.level, total: t.total }));
    }

    if (scopes.attendance) {
      const [a] = await attendanceSummary(oid, [studentId]);
      const recent = await prisma.attendanceRecord.findMany({ where: { studentId, session: { offeringId: oid, startsAt: { lte: now } } }, orderBy: { session: { startsAt: 'desc' } }, take: 10, select: { status: true, session: { select: { startsAt: true } } } });
      c.attendance = { percent: a.percent, attended: a.attended, marked: a.marked, sessions: a.sessions, recent: recent.reverse().map((r) => ({ date: r.session.startsAt, status: r.status })) };
    }

    if (scopes.progress) {
      const [comp, assignments] = await Promise.all([
        lessonCompletion(oid, [studentId]),
        prisma.assignment.findMany({ where: { offeringId: oid, status: { in: ['PUBLISHED', 'CLOSED'] } }, select: { id: true, title: true, dueAt: true, submissions: { where: { studentId }, select: { id: true }, take: 1 } } }),
      ]);
      const done = comp.byStudent[studentId] ?? 0;
      c.progress = {
        completionPct: comp.requiredCount ? Math.round((done / comp.requiredCount) * 100) : null, completed: done, required: comp.requiredCount,
        missing: assignments.filter((x) => x.dueAt <= now && !x.submissions.length).length,
        upcoming: assignments.filter((x) => x.dueAt > now).sort((a, b) => +a.dueAt - +b.dueAt).slice(0, 5).map((x) => ({ id: x.id, title: x.title, dueAt: x.dueAt, submitted: x.submissions.length > 0 })),
      };
    }

    if (o.status === 'PUBLISHED') {
      const reasons: string[] = [];
      if ((c.progress?.missing ?? 0) >= 2) reasons.push(`${c.progress!.missing} overdue assignments not submitted`);
      if (c.progress?.completionPct != null && c.progress.completionPct < 50) reasons.push(`Lesson completion ${c.progress.completionPct}%`);
      Object.assign(c, riskFlags({ totalPct: c.marks?.totalPct ?? null, attendancePct: c.attendance?.percent ?? null, insightReasons: reasons, insightAtRisk: reasons.length >= 2 }));
    }
    return c;
  }));

  const current = courses.filter((c) => c.status === 'PUBLISHED');
  const att = current.map((c) => c.attendance).filter((a) => a && a.marked);
  return {
    student, scopes, generatedAt: now, rules: { attendanceMin: ATTENDANCE_MIN },
    summary: {
      courses: current.length,
      overall: scopes.grades ? mean(current.map((c) => c.marks?.totalPct).filter((x): x is number => x != null)) : undefined,
      classAverage: scopes.grades ? mean(current.map((c) => c.marks?.classAverage).filter((x): x is number => x != null)) : undefined,
      attendance: scopes.attendance ? (att.length ? r1((att.reduce((s, a) => s + a!.attended, 0) / att.reduce((s, a) => s + a!.marked, 0)) * 100) : null) : undefined,
      completion: scopes.progress ? mean(current.map((c) => c.progress?.completionPct).filter((x): x is number => x != null)) : undefined,
      missing: scopes.progress ? current.reduce((s, c) => s + (c.progress?.missing ?? 0), 0) : undefined,
      atRisk: current.filter((c) => c.atRisk).length,
    },
    insights: insights(courses),
    // Every published mark in date order, for the score-trend chart.
    trend: scopes.grades ? courses.filter((c) => c.status === 'PUBLISHED').flatMap((c) => (c.marks?.items ?? []).map((i) => ({ ...i, course: c.course.code }))).filter((i) => i.date).sort((a, b) => +a.date! - +b.date!) : [],
    courses,
  };
}
