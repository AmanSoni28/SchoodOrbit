import { z } from 'zod';
import type { QuestionType } from '@prisma/client';

export type Option = { id: string; text: string };
export type VersionLike = { options: unknown; correctAnswer: unknown; points: number };

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');

/** Validates prompt/options/answer key shape for a question type. Returns normalised fields. */
export function validateQuestion(type: QuestionType, input: { options?: Option[]; correctAnswer: unknown }) {
  if (type === 'TRUE_FALSE') {
    const ans = z.enum(['true', 'false']).parse(String(input.correctAnswer));
    return { options: [{ id: 'true', text: 'True' }, { id: 'false', text: 'False' }], correctAnswer: ans };
  }
  if (type === 'SHORT') {
    // Empty list = descriptive answer, graded manually by faculty.
    const accepted = z.array(z.string().min(1).max(200)).max(20).parse(input.correctAnswer ?? []);
    return { options: [], correctAnswer: accepted };
  }
  const options = z.array(z.object({ id: z.string().min(1).max(20), text: z.string().min(1).max(1000) })).min(2).max(8).parse(input.options);
  if (new Set(options.map((o) => o.id)).size !== options.length) throw new z.ZodError([{ code: 'custom', path: ['options'], message: 'Option ids must be unique', input: options }]);
  const ids = options.map((o) => o.id);
  if (type === 'MCQ') {
    const ans = z.string().refine((a) => ids.includes(a), 'Correct answer must be one of the options').parse(input.correctAnswer);
    return { options, correctAnswer: ans };
  }
  const ans = z.array(z.string().refine((a) => ids.includes(a), 'Correct answers must be options')).min(1).parse(input.correctAnswer);
  return { options, correctAnswer: [...new Set(ans)].sort() };
}

/**
 * Auto-grades one answer. Returns null when the question needs manual review
 * (descriptive SHORT answer with no accepted answers).
 */
export function gradeAnswer(type: QuestionType, v: VersionLike, answer: unknown): { isCorrect: boolean; points: number } | null {
  const key = v.correctAnswer;
  let correct: boolean;
  if (type === 'MCQ' || type === 'TRUE_FALSE') correct = typeof answer === 'string' && answer === key;
  else if (type === 'MULTI') {
    const given = Array.isArray(answer) ? [...new Set(answer.map(String))].sort() : [];
    const expected = (key as string[]) ?? [];
    correct = given.length === expected.length && given.every((g, i) => g === expected[i]);
  } else {
    const accepted = (key as string[]) ?? [];
    if (!accepted.length) return null;
    correct = typeof answer === 'string' && accepted.some((a) => norm(a) === norm(answer));
  }
  return { isCorrect: correct, points: correct ? v.points : 0 };
}

/** Removes the answer key before sending a question to a student. */
export const publicVersion = (v: { id: string; prompt: string; options: unknown; points: number }, type: QuestionType) => ({
  id: v.id, prompt: v.prompt, options: v.options, points: v.points, type,
});
