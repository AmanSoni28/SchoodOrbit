import { describe, expect, it } from 'vitest';
import { gradeAnswer, validateQuestion } from '../src/modules/quizzes/grading';
import { totp } from '../src/lib/totp';
import { effectiveScore, weightedTotal } from '../src/modules/gradebook/gradebook.service';
import { nextStreak } from '../src/modules/revision/revision.service';
import { addDays, localDate } from '../src/lib/time';
import { validateDraft } from '../src/modules/ai-content/ai-content.service';
import { cgpa, gradeFor, summarise } from '../src/modules/results/results.service';
import { feeState } from '../src/modules/fees/fees.service';

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
