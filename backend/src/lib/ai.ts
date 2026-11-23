import Anthropic from '@anthropic-ai/sdk';
import type { AIFeature } from '@prisma/client';
import { env } from '../config/env';
import { prisma } from './prisma';
import { AppError } from './errors';

// USD per million tokens — used only for the cost estimate shown to admins. Update if the model changes.
const PRICE: Record<string, { in: number; out: number }> = {
  'claude-opus-5-5': { in: 4, out: 20 },
  'claude-sonnet-5-5': { in: 2, out: 10 },
  'claude-haiku-5-5': { in: 0.1, out: 0.5 },
};

let client: Anthropic | null = null;
export const aiConfigured = () => !!env.ANTHROPIC_API_KEY;

export function ai() {
  if (!aiConfigured()) throw new AppError(503, 'AI_NOT_CONFIGURED', 'AI features are not configured by the administrator yet.');
  return (client ??= new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, maxRetries: 2, timeout: 120_000 }));
}

export async function recordUsage(userId: string, feature: AIFeature, usage: { input_tokens: number; output_tokens: number }, model = env.AI_MODEL) {
  const p = PRICE[model] ?? PRICE['claude-opus-5-5'];
  await prisma.aIUsageRecord.create({
    data: {
      userId, feature, model, inputTokens: usage.input_tokens, outputTokens: usage.output_tokens,
      estimatedCostUsd: (usage.input_tokens * p.in + usage.output_tokens * p.out) / 1e6,
    },
  });
}

/** Maps SDK errors to user-safe, retryable app errors (no provider details leak to the client). */
export function mapAiError(e: unknown): never {
  if (e instanceof AppError) throw e;
  if (e instanceof Anthropic.RateLimitError) throw new AppError(503, 'AI_BUSY', 'The AI service is busy. Please try again in a minute.', { retryable: true });
  if (e instanceof Anthropic.AuthenticationError) throw new AppError(503, 'AI_NOT_CONFIGURED', 'AI credentials are invalid. Contact your administrator.');
  if (e instanceof Anthropic.BadRequestError) { console.error('[ai] bad request:', e.message); throw new AppError(502, 'AI_REQUEST_REJECTED', 'The AI service could not process this request.'); }
  if (e instanceof Anthropic.APIError || e instanceof Anthropic.APIConnectionError) throw new AppError(503, 'AI_UNAVAILABLE', 'The AI service is temporarily unavailable. Please try again.', { retryable: true });
  throw e;
}

/** Plain-text chat call with refusal handling and server-side fallback. */
export async function chat(params: { system: string; messages: Anthropic.Beta.BetaMessageParam[]; maxTokens?: number; effort?: 'low' | 'medium' | 'high' }) {
  try {
    const res = await ai().beta.messages.create({
      model: env.AI_MODEL,
      max_tokens: params.maxTokens ?? 16000,
      system: params.system,
      messages: params.messages,
      output_config: { effort: params.effort ?? 'medium' },
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
    });
    if (res.stop_reason === 'refusal') throw new AppError(422, 'AI_DECLINED', 'The AI assistant could not help with this request. Try rephrasing it as a study question.');
    const text = res.content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('\n').trim();
    return { text, usage: res.usage, model: res.model, stopReason: res.stop_reason };
  } catch (e) {
    mapAiError(e);
  }
}
