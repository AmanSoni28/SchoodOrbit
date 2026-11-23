import type { Request } from 'express';
import { prisma } from './prisma';

export function audit(req: Request | null, action: string, entityType: string, entityId?: string | null, metadata?: object) {
  return prisma.auditLog.create({
    data: { actorId: req?.user?.id ?? null, action, entityType, entityId: entityId ?? null, metadata: metadata as any, ip: req?.ip ?? null },
  });
}
