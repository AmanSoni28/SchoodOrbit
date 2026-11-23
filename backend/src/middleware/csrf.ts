import crypto from 'crypto';
import type { NextFunction, Request, Response } from 'express';
import { isProd } from '../config/env';
import { AppError } from '../lib/errors';

const SAFE = new Set(['GET', 'HEAD', 'OPTIONS']);

export const CSRF_COOKIE = 'csrf_token';

export function issueCsrf(res: Response) {
  const token = crypto.randomBytes(24).toString('base64url');
  res.cookie(CSRF_COOKIE, token, { httpOnly: false, sameSite: 'lax', secure: isProd, path: '/' });
  return token;
}

// Double-submit cookie. Bearer-token clients don't use cookies, so they are not CSRF-exposed.
export function csrf(req: Request, res: Response, next: NextFunction) {
  const cookie = req.cookies?.[CSRF_COOKIE];
  if (!cookie) issueCsrf(res);
  if (SAFE.has(req.method) || req.headers.authorization?.startsWith('Bearer ')) return next();
  const header = req.get('x-csrf-token');
  if (!cookie || !header || cookie.length !== header.length || !crypto.timingSafeEqual(Buffer.from(cookie), Buffer.from(header))) {
    throw new AppError(403, 'CSRF', 'Security token missing or invalid. Refresh the page and try again.');
  }
  next();
}
