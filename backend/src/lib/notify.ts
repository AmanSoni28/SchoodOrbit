import { prisma } from './prisma';

export async function notify(userIds: string[], n: { type: string; title: string; body?: string; link?: string }) {
  if (!userIds.length) return;
  await prisma.notification.createMany({ data: [...new Set(userIds)].map((userId) => ({ userId, ...n })) });
}
