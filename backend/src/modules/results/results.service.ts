import { prisma } from '../../lib/prisma';
import { computeGradebook } from '../gradebook/gradebook.service';

/** 10-point grading scale (min % inclusive). shortcut: fixed scale; move to CollegeSettings.academicPolicies if colleges need their own. */
export const GRADE_SCALE = [
  { min: 90, grade: 'O', points: 10 },
  { min: 80, grade: 'A+', points: 9 },
  { min: 70, grade: 'A', points: 8 },
  { min: 60, grade: 'B+', points: 7 },
  { min: 50, grade: 'B', points: 6 },
  { min: 40, grade: 'C', points: 5 },
  { min: 0, grade: 'F', points: 0 },
] as const;
export const PASS_PCT = 40;

export function gradeFor(pct: number | null) {
  if (pct === null) return { grade: null, points: null };
  const g = GRADE_SCALE.find((s) => pct >= s.min)!;
  return { grade: g.grade, points: g.points };
}

export type CourseResult = { offeringId: string; code: string; title: string; credits: number; pct: number | null; grade: string | null; points: number | null };

/**
 * SGPA = Σ(points × credits) / Σ credits over courses that have a total.
 * FAIL if any graded course is F; INCOMPLETE if any course has no published marks yet.
 */
export function summarise(courses: CourseResult[]) {
  const graded = courses.filter((c) => c.points !== null);
  const credits = graded.reduce((s, c) => s + c.credits, 0);
  const sgpa = credits ? Math.round((graded.reduce((s, c) => s + c.points! * c.credits, 0) / credits) * 100) / 100 : null;
  const status = graded.some((c) => c.grade === 'F') ? 'FAIL' : courses.some((c) => c.pct === null) ? 'INCOMPLETE' : courses.length ? 'PASS' : 'INCOMPLETE';
  const earned = graded.filter((c) => c.grade !== 'F').reduce((s, c) => s + c.credits, 0);
  return { sgpa, status: status as 'PASS' | 'FAIL' | 'INCOMPLETE', credits, creditsEarned: earned };
}

/** CGPA = credit-weighted mean across semesters (uses each semester's graded credits). */
export function cgpa(semesters: { sgpa: number | null; credits: number }[]) {
  const xs = semesters.filter((s) => s.sgpa !== null && s.credits > 0);
  const c = xs.reduce((a, s) => a + s.credits, 0);
  return c ? Math.round((xs.reduce((a, s) => a + s.sgpa! * s.credits, 0) / c) * 100) / 100 : null;
}

/** Results for a semester from published marks only (results are official records). */
export async function semesterResults(semesterId: string, onlyStudentIds?: string[]) {
  const offerings = await prisma.courseOffering.findMany({
    where: { semesterId, status: { not: 'DRAFT' } },
    include: { course: { select: { code: true, title: true, credits: true } } },
    orderBy: { course: { code: 'asc' } },
  });
  const byStudent = new Map<string, CourseResult[]>();
  for (const o of offerings) {
    const enr = await prisma.enrollment.findMany({ where: { offeringId: o.id, status: { not: 'DROPPED' }, ...(onlyStudentIds ? { studentId: { in: onlyStudentIds } } : {}) }, select: { studentId: true } });
    if (enr.length === 0) continue;
    const book = await computeGradebook(o.id, enr.map((e) => e.studentId), true);
    for (const row of book.rows) {
      const pct = row.totalPct === null ? null : Math.round(row.totalPct * 100) / 100;
      const list = byStudent.get(row.studentId) ?? [];
      list.push({ offeringId: o.id, code: o.course.code, title: o.course.title, credits: o.course.credits, pct, ...gradeFor(pct) });
      byStudent.set(row.studentId, list);
    }
  }
  return {
    courses: offerings.map((o) => ({ offeringId: o.id, code: o.course.code, title: o.course.title, credits: o.course.credits })),
    students: [...byStudent.entries()].map(([studentId, courses]) => ({ studentId, courses, ...summarise(courses) })),
  };
}

/** A student's published results across semesters, oldest first, with CGPA. */
export async function studentTranscript(studentId: string) {
  const pubs = await prisma.resultPublication.findMany({
    where: { semester: { offerings: { some: { enrollments: { some: { studentId, status: { not: 'DROPPED' } } } } } } },
    include: { semester: { include: { academicYear: { select: { label: true } } } } },
    orderBy: { semester: { startDate: 'asc' } },
  });
  const semesters = [];
  for (const p of pubs) {
    const r = await semesterResults(p.semesterId, [studentId]);
    const mine = r.students[0];
    if (!mine) continue;
    semesters.push({ semesterId: p.semesterId, name: p.semester.name, year: p.semester.academicYear.label, publishedAt: p.publishedAt, courses: mine.courses, sgpa: mine.sgpa, status: mine.status, credits: mine.credits, creditsEarned: mine.creditsEarned });
  }
  return { semesters, cgpa: cgpa(semesters), scale: GRADE_SCALE };
}
