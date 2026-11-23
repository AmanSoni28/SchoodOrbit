import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import type { RoleName } from '@prisma/client';
import { env } from '../config/env';
import { prisma } from '../lib/prisma';
import { AppError, forbidden, unauthorized } from '../lib/errors';
import { getSettings, featureEnabled, FEATURES } from '../lib/settings';

export type AuthUser = { id: string; email: string; firstName: string; lastName: string; roles: RoleName[]; mfaEnabled: boolean };

declare global {
  namespace Express {
    interface Request { user?: AuthUser }
  }
}

export const PRIVILEGED: RoleName[] = ['SUPER_ADMIN', 'COLLEGE_ADMIN'];

export function readAccessToken(req: Request) {
  const h = req.headers.authorization;
  if (h?.startsWith('Bearer ')) return h.slice(7);
  return req.cookies?.access_token as string | undefined;
}

// Verifies the JWT, then re-reads the user from the database so suspension and role changes apply immediately.
export async function authenticate(req: Request, _res: Response, next: NextFunction) {
  const token = readAccessToken(req);
  if (!token) throw unauthorized();
  let sub: string;
  try {
    sub = (jwt.verify(token, env.JWT_ACCESS_SECRET, { algorithms: ['HS256'] }) as jwt.JwtPayload).sub as string;
  } catch {
    throw new AppError(401, 'TOKEN_EXPIRED', 'Session expired');
  }
  const user = await prisma.user.findUnique({ where: { id: sub }, include: { roles: true } });
  if (!user || user.status !== 'ACTIVE') throw unauthorized('Account is not active');
  req.user = {
    id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName,
    roles: user.roles.map((r) => r.role), mfaEnabled: user.mfaEnabled,
  };

  // College policy: privileged accounts must enrol MFA before using anything except /auth.
  const { settings } = await getSettings();
  if (settings.requireMfaForAdmins && !user.mfaEnabled && req.user.roles.some((r) => PRIVILEGED.includes(r)) && !req.originalUrl.startsWith('/api/v1/auth')) {
    throw new AppError(403, 'MFA_SETUP_REQUIRED', 'Set up two-factor authentication to continue');
  }
  next();
}

export const hasRole = (user: AuthUser | undefined, ...roles: RoleName[]) => !!user && user.roles.some((r) => roles.includes(r));

export const requireRole = (...roles: RoleName[]) => (req: Request, _res: Response, next: NextFunction) => {
  if (!hasRole(req.user, ...roles)) throw forbidden();
  next();
};

export const requireFeature = (key: (typeof FEATURES)[number]) => async (_req: Request, _res: Response, next: NextFunction) => {
  if (!(await featureEnabled(key))) throw new AppError(403, 'FEATURE_DISABLED', 'This feature is turned off for your college');
  next();
};
