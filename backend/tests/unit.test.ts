import { describe, expect, it } from 'vitest';
import { gradeAnswer, validateQuestion } from '../src/modules/quizzes/grading';
import { totp } from '../src/lib/totp';
import { effectiveScore, weightedTotal } from '../src/modules/gradebook/gradebook.service';
import { nextStreak } from '../src/modules/revision/revision.service';
import { addDays, localDate } from '../src/lib/time';
import { validateDraft } from '../src/modules/ai-content/ai-content.service';
import { cgpa, gradeFor, summarise } from '../src/modules/results/results.service';
import { feeState } from '../src/modules/fees/fees.service';
import { levelFor, mastery, topicFeedback, type Answer } from '../src/modules/learning-path/learning-path.service';
import { checkRange, leaveDays } from '../src/modules/leave/leave.service';
import { findClash, overlaps } from '../src/modules/timetable/timetable.service';
import { canUseMessages, contactWhere, pair } from '../src/modules/messages/messages.service';
import { classStats, riskFlags } from '../src/modules/performance/performance.service';
import { insights } from '../src/modules/performance/student.service';

describe('grading', () => {
  const opts = [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }, { id: 'c', text: 'C' }];
  it('grades MCQ, MULTI (order-insensitive), TRUE_FALSE', () => {
    expect(gradeAnswer('MCQ', { options: opts, correctAnswer: 'b', points: 2 }, 'b')).toEqual({ isCorrect: true, points: 2 });
    expect(gradeAnswer('MCQ', { options: opts, correctAnswer: 'b', points: 2 }, 'a')).toEqual({ isCorrect: false, points: 0 });
    expect(gradeAnswer('MULTI', { options: opts, correctAnswer: ['a', 'c'], points: 1 }, ['c', 'a', 'c'])!.isCorrect).toBe(true);
    expect(gradeAnswer('MULTI', { options: opts, correctAnswer: ['a', 'c'], points: 1 }, ['a'])!.isCorrect).toBe(false);
    expect(gradeAnswer('TRUE_FALSE', { options: [], correctAnswer: 'true', points: 1 }, 'true')!.isCorrect).toBe(true);
  });
  it('short answers: normalised match, or null for manual review', () => {
    expect(gradeAnswer('SHORT', { options: [], correctAnswer: ['Primary Key'], points: 1 }, '  primary   key ')!.isCorrect).toBe(true);
    expect(gradeAnswer('SHORT', { options: [], correctAnswer: [], points: 3 }, 'essay')).toBeNull();
  });
  it('rejects invalid answer keys', () => {
    expect(() => validateQuestion('MCQ', { options: opts, correctAnswer: 'z' })).toThrow();
    expect(() => validateQuestion('MCQ', { options: [opts[0]], correctAnswer: 'a' })).toThrow();
    expect(validateQuestion('MULTI', { options: opts, correctAnswer: ['c', 'a'] }).correctAnswer).toEqual(['a', 'c']);
  });
});

describe('totp (RFC 6238 SHA-1 vector)', () => {
  it('matches the RFC test vector at T=59s', () => {
    // Secret "12345678901234567890" in base32; RFC 6238 expects 94287082 → last 6 digits.
    expect(totp('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ', 59_000)).toBe('287082');
  });
});

describe('gradebook maths', () => {
  it('applies late penalty and renormalises weights for missing categories', () => {
    expect(effectiveScore(10, true, 10)).toBe(9);
    expect(effectiveScore(10, false, 10)).toBe(10);
    const t = weightedTotal([{ kind: 'assignment', cell: { earned: 8, max: 10 } }, { kind: 'quiz', cell: null }], { assignments: 40, quizzes: 60 });
    expect(t).toEqual({ assignmentsPct: 80, quizzesPct: null, totalPct: 80 });
    const t2 = weightedTotal([{ kind: 'assignment', cell: { earned: 5, max: 10 } }, { kind: 'quiz', cell: { earned: 10, max: 10 } }], { assignments: 40, quizzes: 60 });
    expect(t2.totalPct).toBe(80);
  });
});

describe('revision streak & dates', () => {
  it('continues, holds, and resets streaks on local dates', () => {
    expect(nextStreak(null, '2026-11-23')).toEqual({ lastCompletedDate: '2026-11-23', currentStreak: 1, longestStreak: 1 });
    expect(nextStreak({ lastCompletedDate: '2026-11-22', currentStreak: 4, longestStreak: 4 }, '2026-11-23').currentStreak).toBe(5);
    expect(nextStreak({ lastCompletedDate: '2026-11-20', currentStreak: 4, longestStreak: 9 }, '2026-11-23')).toEqual({ lastCompletedDate: '2026-11-23', currentStreak: 1, longestStreak: 9 });
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });
  it('uses the college time zone for the daily reset', () => {
    const at = new Date('2026-11-23T20:00:00Z'); // 01:30 next day in India
    expect(localDate('Asia/Kolkata', at)).toBe('2026-11-24');
    expect(localDate('America/New_York', at)).toBe('2026-11-23');
  });
});

describe('AI draft validation', () => {
  it('rejects MCQ drafts with an out-of-range answer', () => {
    expect(() => validateDraft('MCQ', { questions: [{ prompt: 'p', options: ['a', 'b'], correctIndex: 3, explanation: 'e', difficulty: 'EASY' }], sourceGaps: [] })).toThrow();
    expect(validateDraft('FLASHCARDS', { cards: [{ front: 'f', back: 'b' }], sourceGaps: [] }).cards).toHaveLength(1);
  });
});

describe('results', () => {
  it('maps percentages to the 10-point scale', () => {
    expect(gradeFor(95)).toEqual({ grade: 'O', points: 10 });
    expect(gradeFor(80)).toEqual({ grade: 'A+', points: 9 });
    expect(gradeFor(39.99)).toEqual({ grade: 'F', points: 0 });
    expect(gradeFor(null)).toEqual({ grade: null, points: null });
  });
  it('computes credit-weighted SGPA, status and CGPA', () => {
    const c = (pct: number | null, credits: number) => ({ offeringId: 'x', code: 'X', title: 'X', credits, pct, ...gradeFor(pct) });
    expect(summarise([c(92, 4), c(72, 2)])).toMatchObject({ sgpa: 9.33, status: 'PASS', credits: 6, creditsEarned: 6 });
    expect(summarise([c(92, 4), c(30, 2)])).toMatchObject({ status: 'FAIL', creditsEarned: 4 });
    expect(summarise([c(92, 4), c(null, 2)])).toMatchObject({ sgpa: 10, status: 'INCOMPLETE', credits: 4 });
    expect(cgpa([{ sgpa: 8, credits: 20 }, { sgpa: 9, credits: 20 }, { sgpa: null, credits: 0 }])).toBe(8.5);
  });
});

describe('fees', () => {
  const today = new Date('2026-06-15T10:00:00Z');
  const f = (amount: number, discount: number, due: string, paid: number[]) => feeState({ amount, discount, dueDate: new Date(due), payments: paid.map((amount) => ({ amount })) }, today);
  it('derives status and balance from payments', () => {
    expect(f(1000, 0, '2026-07-01', [])).toEqual({ net: 1000, paid: 0, balance: 1000, status: 'PENDING' });
    expect(f(1000, 100, '2026-07-01', [400])).toMatchObject({ net: 900, balance: 500, status: 'PARTIAL' });
    expect(f(1000, 0, '2026-06-01', [400])).toMatchObject({ status: 'OVERDUE', balance: 600 });
    expect(f(1000, 0, '2026-06-15', [])).toMatchObject({ status: 'PENDING' }); // due today is not overdue
    expect(f(1000, 0, '2026-06-01', [600, 400])).toMatchObject({ status: 'PAID', balance: 0 });
    expect(f(1000, 1000, '2026-06-01', [])).toMatchObject({ status: 'WAIVED', balance: 0 });
    expect(f(0.3, 0, '2026-07-01', [0.1, 0.2])).toMatchObject({ status: 'PAID' }); // float-safe
  });
});

describe('learning path mastery', () => {
  const now = new Date('2026-11-24T12:00:00Z');
  const ans = (correct: boolean, daysAgo: number): Answer => ({ topicId: 't', offeringId: 'o', correct, at: new Date(now.getTime() - daysAgo * 86400000), source: 'QUIZ' });
  it('classifies by accuracy and needs enough answers', () => {
    expect(levelFor(90, 2)).toBe('NOT_ENOUGH_DATA');
    expect(levelFor(50, 5)).toBe('NEEDS_WORK');
    expect(levelFor(60, 5)).toBe('DEVELOPING');
    expect(levelFor(75, 5)).toBe('STRONG');
  });
  it('detects improvement: wrong earlier, right recently', () => {
    const m = mastery([ans(false, 30), ans(false, 20), ans(true, 3), ans(true, 1)], now);
    expect(m).toMatchObject({ total: 4, correct: 2, accuracy: 50, level: 'NEEDS_WORK', trend: 100 });
    expect(topicFeedback(m, [], 'o').summary).toMatch(/Improving — up 100 points/);
  });
  it('suggests unfinished lessons first, and no actions when strong', () => {
    const weak = mastery([ans(false, 1), ans(false, 1), ans(true, 1)], now);
    const f = topicFeedback(weak, [{ id: 'L1', title: 'Joins', section: 'Unit 2', done: false }, { id: 'L2', title: 'Keys', section: 'Unit 1', done: true }], 'o');
    expect(f.actions[0]).toEqual({ text: 'Complete the lesson "Joins" (Unit 2)', to: '/lessons/L1' });
    expect(f.actions.some((a) => a.to === '/lessons/L2')).toBe(true);
    expect(topicFeedback(mastery([ans(true, 1), ans(true, 1), ans(true, 1)], now), [], 'o').actions).toEqual([]);
  });
});

describe('leave', () => {
  it('counts inclusive calendar days across months', () => {
    expect(leaveDays('2026-11-24', '2026-11-24')).toBe(1);
    expect(leaveDays('2026-11-29', '2026-12-02')).toBe(4);
  });
  it('validates ranges against today', () => {
    const today = '2026-11-24';
    expect(checkRange('2026-11-25', '2026-11-27', today)).toBeNull();
    expect(checkRange('2026-11-20', '2026-11-21', today)).toBeNull(); // backdated sick leave is allowed
    expect(checkRange('2026-11-27', '2026-11-25', today)).toMatch(/before/);
    expect(checkRange('2026-12-01', '2027-01-15', today)).toMatch(/at most 30/);
    expect(checkRange('2026-10-01', '2026-10-02', today)).toMatch(/after it started/);
    expect(checkRange('2027-08-01', '2027-08-02', today)).toMatch(/in advance/);
  });
});

describe('timetable clashes', () => {
  const base = { sectionId: 's1', semesterId: 'sem', facultyIds: ['f1'], room: 'CR-201', label: 'CS301', dayOfWeek: 1, startTime: '09:00', endTime: '10:00' };
  it('treats touching slots as free and overlapping ones as clashing', () => {
    expect(overlaps(base, { ...base, startTime: '10:00', endTime: '11:00' })).toBe(false);
    expect(overlaps(base, { ...base, startTime: '09:30', endTime: '10:30' })).toBe(true);
    expect(overlaps(base, { ...base, dayOfWeek: 2 })).toBe(false);
  });
  it('reports section, instructor and room clashes', () => {
    const other = { ...base, id: 'x', facultyIds: ['f2'], room: 'CR-305', label: 'CS303' };
    expect(findClash(base, [other])).toMatch(/section already has CS303/);
    expect(findClash(base, [{ ...other, sectionId: 's2', facultyIds: ['f1'] }])).toMatch(/instructor/);
    expect(findClash(base, [{ ...other, sectionId: 's2', room: 'cr-201 ' }])).toMatch(/Room/);
    expect(findClash(base, [{ ...other, sectionId: 's2' }])).toBeNull();
    expect(findClash({ ...base, id: 'x' }, [other])).toBeNull(); // editing a slot never clashes with itself
  });
});

describe('messaging rules', () => {
  it('stores each pair once regardless of who starts', () => {
    expect(pair('b', 'a')).toEqual(pair('a', 'b'));
    expect(pair('a', 'b')).toEqual({ userAId: 'a', userBId: 'b' });
  });
  it('limits messaging to the four campus roles', () => {
    expect(canUseMessages(['SUPER_ADMIN'])).toBe(false);
    expect(canUseMessages(['PARENT'])).toBe(true);
  });
  it('never lets a student reach students at large, and drops parent rules when the portal is off', () => {
    const s = JSON.stringify(contactWhere({ id: 'me', roles: ['STUDENT'] }, true));
    expect(s).not.toContain('"in":["COLLEGE_ADMIN","FACULTY","STUDENT","PARENT"]');
    expect(s).toContain('"studentId":"me"');
    expect(JSON.stringify(contactWhere({ id: 'me', roles: ['STUDENT'] }, false))).not.toContain('PARENT');
    expect(contactWhere({ id: 'me', roles: ['PARENT'] }, false).OR).toHaveLength(1); // admin only
  });
});

describe('performance analysis', () => {
  it('computes class statistics, ignoring students without marks', () => {
    const s = classStats([
      { totalPct: 92, attendancePct: 90, atRisk: false }, { totalPct: 35, attendancePct: 60, atRisk: true },
      { totalPct: 71, attendancePct: 80, atRisk: false }, { totalPct: null, attendancePct: null, atRisk: false },
    ]);
    expect(s).toMatchObject({ students: 4, graded: 3, average: 66, median: 71, highest: 92, lowest: 35, passRate: 66.7, attendance: 76.7, belowAttendance: 1, atRisk: 1 });
    expect(s.distribution.find((d) => d.grade === 'O')!.n).toBe(1);
    expect(s.distribution.find((d) => d.grade === 'F')!.n).toBe(1);
    expect(s.distribution.at(-1)).toEqual({ grade: 'No marks', n: 1 });
    expect(classStats([]).average).toBeNull();
  });
  it('flags failing marks and low attendance with a reason each', () => {
    const f = riskFlags({ totalPct: 32, attendancePct: 70, insightReasons: [], insightAtRisk: false });
    expect(f.atRisk).toBe(true);
    expect(f.risks).toHaveLength(2);
    expect(riskFlags({ totalPct: 80, attendancePct: 90, insightReasons: [], insightAtRisk: false })).toEqual({ risks: [], atRisk: false });
  });
});

describe('student performance insights', () => {
  const course = (code: string, extra: object) => ({ offeringId: code, status: 'PUBLISHED', course: { code, title: code, credits: 4 }, semester: { id: 's', name: 'S', startDate: new Date() }, instructors: [], risks: [], atRisk: false, ...extra });
  it('puts problems first, groups overdue work and only uses visible sections', () => {
    const out = insights([
      course('A', { marks: { totalPct: 82, classAverage: 70, items: [] }, attendance: { percent: 70, attended: 7, marked: 10 }, progress: { missing: 1 } }),
      course('B', { marks: { totalPct: 45, classAverage: 60, items: [] }, attendance: { percent: 95, attended: 19, marked: 20 }, progress: { missing: 2 } }),
    ] as any);
    expect(out[0].tone).toBe('bad');
    expect(out.filter((i) => i.text.includes('overdue'))).toEqual([{ tone: 'bad', text: '3 overdue assignments not submitted (A, B).' }]);
    expect(out.some((i) => i.text.startsWith('Strongest course: A'))).toBe(true);
    expect(out.some((i) => i.text.startsWith('B is at 45%'))).toBe(true);
    // Attendance-only view (parent without grade consent): nothing about marks.
    const att = insights([course('A', { attendance: { percent: 60, attended: 6, marked: 10 } })] as any);
    expect(att.map((i) => i.text).join(' ')).not.toMatch(/Strongest|average|%\s—\sworth/);
  });
});
