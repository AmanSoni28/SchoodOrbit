import { prisma } from './prisma';

let cache: { at: number; value: Awaited<ReturnType<typeof load>> } | null = null;

async function load() {
  const [settings, flags] = await Promise.all([
    prisma.collegeSettings.upsert({ where: { id: 'default' }, create: { id: 'default', name: 'College LMS', shortName: 'LMS' }, update: {} }),
    prisma.featureFlag.findMany(),
  ]);
  return { settings, flags: Object.fromEntries(flags.map((f) => [f.key, f.enabled])) as Record<string, boolean> };
}

// 30 s cache; settings change rarely and invalidate() is called on update.
export async function getSettings() {
  if (!cache || Date.now() - cache.at > 30_000) cache = { at: Date.now(), value: await load() };
  return cache.value;
}
export const invalidateSettings = () => { cache = null; };

export const FEATURES = ['doubtBoard', 'aiHomework', 'aiContent', 'classInsights', 'dailyRevision', 'parentPortal', 'discussions'] as const;

export async function featureEnabled(key: (typeof FEATURES)[number]) {
  return (await getSettings()).flags[key] ?? true;
}
