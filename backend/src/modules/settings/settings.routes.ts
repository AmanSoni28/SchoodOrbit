import { Router, type RequestHandler } from 'express';
import os from 'os';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { requireRole } from '../../middleware/auth';
import { getSettings, invalidateSettings, FEATURES } from '../../lib/settings';
import { audit } from '../../lib/audit';
import { paging, meta } from '../../lib/http';
import { badRequest } from '../../lib/errors';
import { env } from '../../config/env';
import { aiConfigured } from '../../lib/ai';

const r = Router();
const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Use a hex colour like #4163F5');

// WCAG relative-luminance contrast against white text (buttons use white labels on the primary colour).
function contrastWithWhite(color: string) {
  const ch = [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  const L = 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
  return 1.05 / (L + 0.05);
}

// Public branding for the login page — no sensitive fields. Mounted before authentication in routes.ts.
export const publicSettings: RequestHandler = async (_req, res) => {
  const { settings, flags } = await getSettings();
  const { name, shortName, logoUrl, primaryColor, accentColor, timeZone, locale, supportEmail } = settings;
  res.json({ data: { name, shortName, logoUrl, primaryColor, accentColor, timeZone, locale, supportEmail, features: Object.fromEntries(FEATURES.map((f) => [f, flags[f] ?? true])) } });
};

r.get('/settings', requireRole('SUPER_ADMIN', 'COLLEGE_ADMIN'), async (_req, res) => {
  const { settings, flags } = await getSettings();
  res.json({ data: { ...settings, features: Object.fromEntries(FEATURES.map((f) => [f, flags[f] ?? true])) } });
});

r.patch('/settings', requireRole('SUPER_ADMIN'), async (req, res) => {
  const body = z.object({
    name: z.string().min(2).max(120), shortName: z.string().min(1).max(20), logoUrl: z.string().url().nullable(),
    primaryColor: hex, accentColor: hex, timeZone: z.string(), locale: z.string(), emailFromName: z.string().max(80).nullable(),
    supportEmail: z.string().email().nullable(), requireMfaForAdmins: z.boolean(),
  }).partial().parse(req.body);
  if (body.timeZone) {
    try { new Intl.DateTimeFormat('en', { timeZone: body.timeZone }); } catch { throw badRequest('Unknown time zone'); }
  }
  if (body.primaryColor && contrastWithWhite(body.primaryColor) < 4.5) {
    throw badRequest(`Primary colour contrast with white text is ${contrastWithWhite(body.primaryColor).toFixed(2)}:1; WCAG AA needs 4.5:1. Choose a darker colour.`);
  }
  const updated = await prisma.collegeSettings.update({ where: { id: 'default' }, data: body });
  invalidateSettings();
  await audit(req, 'SETTINGS_UPDATED', 'CollegeSettings', 'default', body);
  res.json({ data: updated });
});

r.put('/settings/features/:key', requireRole('SUPER_ADMIN'), async (req, res) => {
  const key = z.enum(FEATURES).parse(req.params.key);
  const { enabled } = z.object({ enabled: z.boolean() }).parse(req.body);
  await prisma.featureFlag.upsert({ where: { key }, create: { key, enabled }, update: { enabled } });
  invalidateSettings();
  await audit(req, 'FEATURE_TOGGLED', 'FeatureFlag', key, { enabled });
  res.json({ data: { key, enabled } });
});

r.get('/system/health', requireRole('SUPER_ADMIN'), async (_req, res) => {
  const started = Date.now();
  await prisma.$queryRaw`SELECT 1`;
  const dbMs = Date.now() - started;
  const [users, offerings, migrations, aiCost] = await Promise.all([
    prisma.user.count(), prisma.courseOffering.count(),
    prisma.$queryRaw<{ migration_name: string; finished_at: Date }[]>`SELECT migration_name, finished_at FROM _prisma_migrations ORDER BY finished_at DESC LIMIT 5`,
    prisma.aIUsageRecord.aggregate({ _sum: { estimatedCostUsd: true, inputTokens: true, outputTokens: true }, where: { createdAt: { gte: new Date(Date.now() - 30 * 86400000) } } }),
  ]);
  res.json({
    data: {
      status: 'ok', dbLatencyMs: dbMs, uptimeSec: Math.round(process.uptime()), node: process.version, env: env.NODE_ENV,
      memoryMb: Math.round(process.memoryUsage().rss / 1e6), loadAvg: os.loadavg()[0], counts: { users, offerings },
      aiConfigured: aiConfigured(), aiModel: env.AI_MODEL, aiUsage30d: aiCost._sum, migrations,
    },
  });
});

r.get('/audit-logs', requireRole('SUPER_ADMIN', 'COLLEGE_ADMIN'), async (req, res) => {
  const p = paging(req.query);
  const q = z.object({ action: z.string().optional(), entityType: z.string().optional() }).parse(req.query);
  const where = { action: q.action || undefined, entityType: q.entityType || undefined };
  const [rows, total] = await Promise.all([
    prisma.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, skip: p.skip, take: p.take, include: { actor: { select: { email: true, firstName: true, lastName: true } } } }),
    prisma.auditLog.count({ where }),
  ]);
  res.json({ data: rows, meta: meta(p, total) });
});

export default r;
