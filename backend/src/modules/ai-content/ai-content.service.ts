import { z } from 'zod';
import { waitUntil } from '@vercel/functions';
import type Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { prisma } from '../../lib/prisma';
import { ai, mapAiError, recordUsage } from '../../lib/ai';
import { readStoredFile } from '../../lib/storage';
import { env } from '../../config/env';
import { AppError } from '../../lib/errors';

export const JOB_TYPES = ['NOTES', 'SUMMARY', 'FLASHCARDS', 'MCQ', 'DESCRIPTIVE'] as const;
export type JobType = (typeof JOB_TYPES)[number];

const difficulty = z.enum(['EASY', 'MEDIUM', 'HARD']);
const sourceGaps = z.array(z.string()).describe('Things the requested output needed that the source material does not support. Empty if none.');

// Structured output schemas — the model's response is validated against these before it is stored as a draft.
export const SCHEMAS = {
  NOTES: z.object({ title: z.string(), sections: z.array(z.object({ heading: z.string(), body: z.string() })), keyPoints: z.array(z.string()), sourceGaps }),
  SUMMARY: z.object({ title: z.string(), sections: z.array(z.object({ heading: z.string(), body: z.string() })), keyPoints: z.array(z.string()), sourceGaps }),
  FLASHCARDS: z.object({ cards: z.array(z.object({ front: z.string(), back: z.string() })), sourceGaps }),
  MCQ: z.object({
    questions: z.array(z.object({ prompt: z.string(), options: z.array(z.string()), correctIndex: z.number().int(), explanation: z.string(), difficulty })),
    sourceGaps,
  }),
  DESCRIPTIVE: z.object({
    questions: z.array(z.object({ prompt: z.string(), modelAnswer: z.string(), rubricPoints: z.array(z.string()), difficulty })),
    sourceGaps,
  }),
} satisfies Record<JobType, z.ZodType>;

/** Stricter checks than the model schema (applied to AI output and to faculty edits). */
export function validateDraft(type: JobType, content: unknown) {
  const parsed = SCHEMAS[type].parse(content) as any;
  if (type === 'MCQ') {
    for (const [i, q] of parsed.questions.entries()) {
      if (q.options.length < 2 || q.options.length > 6) throw new AppError(422, 'VALIDATION', `Question ${i + 1}: needs 2–6 options`);
      if (q.correctIndex < 0 || q.correctIndex >= q.options.length) throw new AppError(422, 'VALIDATION', `Question ${i + 1}: correct option is out of range`);
    }
  }
  return parsed;
}

const INSTRUCTIONS: Record<JobType, (n: number, d: string) => string> = {
  NOTES: () => 'Write well-structured study notes covering the material, with sections and key points.',
  SUMMARY: () => 'Write a concise summary (about one page) with the most important ideas and key points.',
  FLASHCARDS: (n) => `Create ${n} flashcards (front: term or question, back: concise answer).`,
  MCQ: (n, d) => `Write ${n} multiple-choice questions (4 options each, exactly one correct) at ${d} difficulty, with an explanation for each.`,
  DESCRIPTIVE: (n, d) => `Write ${n} descriptive (written-answer) questions at ${d} difficulty, each with a model answer and rubric points.`,
};

// shortcut: in-process queue (one job at a time); move to BullMQ/Redis when concurrent volume needs it.
const queue: string[] = [];
let running = false;

export function enqueue(jobId: string) {
  queue.push(jobId);
  // On serverless hosts the function is frozen after the response; waitUntil keeps it alive until the job ends.
  if (!running) waitUntil(drain());
}

async function drain() {
  running = true;
  while (queue.length) {
    const id = queue.shift()!;
    try { await runJob(id); } catch (e) { console.error('[ai-content] job crashed', id, e); }
  }
  running = false;
}

/** Jobs left PROCESSING by a server restart are marked FAILED so faculty can retry them. */
export async function recoverStuckJobs() {
  await prisma.aIContentJob.updateMany({ where: { status: { in: ['QUEUED', 'PROCESSING'] } }, data: { status: 'FAILED', error: 'Interrupted by a server restart. Please retry.' } });
}

async function runJob(jobId: string) {
  const job = await prisma.aIContentJob.findUnique({ where: { id: jobId }, include: { sources: { include: { fileAsset: true } }, lesson: true, offering: { include: { course: true } } } });
  if (!job || job.status !== 'QUEUED') return;
  await prisma.aIContentJob.update({ where: { id: job.id }, data: { status: 'PROCESSING', error: null } });
  const type = job.type as JobType;
  const settings = job.settings as { count?: number; difficulty?: string; instructions?: string; useLessonContent?: boolean };

  try {
    const content: Anthropic.Beta.BetaContentBlockParam[] = [];
    for (const s of job.sources) {
      if (!s.fileAsset) continue;
      const buf = await readStoredFile(s.fileAsset.storageKey);
      content.push(s.fileAsset.mimeType === 'application/pdf'
        ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: buf.toString('base64') }, title: s.fileAsset.originalName }
        : { type: 'document', source: { type: 'text', media_type: 'text/plain', data: buf.toString('utf8') }, title: s.fileAsset.originalName });
    }
    if (settings.useLessonContent && job.lesson?.content.trim()) {
      content.push({ type: 'document', source: { type: 'text', media_type: 'text/plain', data: job.lesson.content }, title: `Lesson: ${job.lesson.title}` });
    }
    if (!content.length) throw new AppError(422, 'NO_SOURCE', 'No source material was provided.');
    content.push({
      type: 'text',
      text: [
        `Course: ${job.offering.course.code} ${job.offering.course.title}.`,
        INSTRUCTIONS[type](settings.count ?? 5, (settings.difficulty ?? 'MEDIUM').toLowerCase()),
        'Use ONLY the attached source documents. Do not invent references, citations or facts not supported by the sources; list any gaps in sourceGaps.',
        settings.instructions ? `Faculty notes (follow when consistent with the sources): ${settings.instructions}` : '',
      ].filter(Boolean).join('\n'),
    });

    let res;
    try {
      res = await ai().beta.messages.parse({
        model: env.AI_MODEL,
        max_tokens: 32000,
        system: 'You help college faculty prepare draft teaching material from their own course documents. Your output is a draft that faculty will review before any student sees it.',
        messages: [{ role: 'user', content }],
        output_config: { format: betaZodOutputFormat(SCHEMAS[type] as any), effort: 'medium' },
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
      });
    } catch (e) { mapAiError(e); }
    if (res!.stop_reason === 'refusal') throw new AppError(422, 'AI_DECLINED', 'The AI declined to generate content from this material.');
    if (res!.stop_reason === 'max_tokens') throw new AppError(422, 'AI_TRUNCATED', 'The output was too long. Reduce the number of items and retry.');
    await recordUsage(job.facultyId, 'CONTENT', res!.usage, res!.model);
    const structured = validateDraft(type, res!.parsed_output);
    const version = (await prisma.aIContentDraft.count({ where: { jobId: job.id } })) + 1;
    await prisma.$transaction([
      prisma.aIContentDraft.create({ data: { jobId: job.id, version, structuredContent: structured } }),
      prisma.aIContentJob.update({ where: { id: job.id }, data: { status: 'DRAFT_READY' } }),
    ]);
  } catch (e: any) {
    const message = e instanceof AppError ? e.message : 'Generation failed. Please retry.';
    if (!(e instanceof AppError)) console.error('[ai-content]', e);
    await prisma.aIContentJob.update({ where: { id: job.id }, data: { status: 'FAILED', error: message } });
  }
}
