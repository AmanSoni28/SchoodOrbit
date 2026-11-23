import crypto from 'crypto';
import argon2 from 'argon2';
import jwt from 'jsonwebtoken';
import type { Request, Response } from 'express';
import { env, isProd } from '../../config/env';
import { prisma } from '../../lib/prisma';
import { AppError, unauthorized } from '../../lib/errors';
import { randomToken, sha256 } from '../../lib/crypto';
import { audit } from '../../lib/audit';

export const ACCESS_TTL_SEC = 15 * 60;
const REFRESH_TTL_MS = 7 * 24 * 3600 * 1000;
const MAX_FAILED = 5;
const LOCK_MS = 15 * 60 * 1000;
const REUSE_GRACE_MS = 20_000;

export const hashPassword = (p: string) => argon2.hash(p, { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 });

// Computed once so failed lookups take the same time as real password checks (no user enumeration by timing).
const dummyHash = hashPassword(crypto.randomBytes(16).toString('hex'));

export async function verifyCredentials(req: Request, email: string, password: string) {
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase().trim() }, include: { roles: true } });
  if (!user) {
    await argon2.verify(await dummyHash, password);
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect');
  }
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    throw new AppError(423, 'LOCKED', 'Too many failed attempts. Try again in a few minutes.');
  }
  if (!(await argon2.verify(user.passwordHash, password))) {
    const failed = user.failedLoginCount + 1;
    await prisma.user.update({
      where: { id: user.id },
      data: failed >= MAX_FAILED ? { failedLoginCount: 0, lockedUntil: new Date(Date.now() + LOCK_MS) } : { failedLoginCount: failed },
    });
    await audit(req, failed >= MAX_FAILED ? 'ACCOUNT_LOCKED' : 'LOGIN_FAILED', 'User', user.id);
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect');
  }
  if (user.status !== 'ACTIVE') throw new AppError(403, 'SUSPENDED', 'This account is suspended. Contact your college administrator.');
  return user;
}

const signAccess = (userId: string) => jwt.sign({}, env.JWT_ACCESS_SECRET, { subject: userId, expiresIn: ACCESS_TTL_SEC, algorithm: 'HS256' });

async function createRefresh(req: Request, userId: string, familyId: string) {
  const token = randomToken();
  await prisma.refreshSession.create({
    data: { userId, familyId, tokenHash: sha256(token), expiresAt: new Date(Date.now() + REFRESH_TTL_MS), userAgent: req.get('user-agent')?.slice(0, 200), ip: req.ip },
  });
  return token;
}

function setCookies(res: Response, access: string, refresh: string) {
  const base = { httpOnly: true, secure: isProd, sameSite: 'lax' as const };
  res.cookie('access_token', access, { ...base, path: '/', maxAge: ACCESS_TTL_SEC * 1000 });
  res.cookie('refresh_token', refresh, { ...base, path: '/api/v1/auth', maxAge: REFRESH_TTL_MS });
}

export function clearCookies(res: Response) {
  res.clearCookie('access_token', { path: '/' });
  res.clearCookie('refresh_token', { path: '/api/v1/auth' });
}

export async function startSession(req: Request, res: Response, userId: string) {
  const refresh = await createRefresh(req, userId, crypto.randomUUID());
  const access = signAccess(userId);
  setCookies(res, access, refresh);
  return access;
}

/** Rotates a refresh token. Re-use of an already-rotated token revokes the whole family (theft signal). */
export async function rotate(req: Request, res: Response) {
  const token = req.cookies?.refresh_token as string | undefined;
  if (!token) throw unauthorized();
  const session = await prisma.refreshSession.findUnique({ where: { tokenHash: sha256(token) }, include: { user: true } });
  if (!session) throw unauthorized();
  if (session.revokedAt || session.rotatedAt) {
    // A token rotated seconds ago is almost always a concurrent refresh (two tabs/requests), not theft:
    // refuse it without issuing tokens, but don't kill the session — the caller retries with the new cookie.
    if (!session.revokedAt && session.rotatedAt && Date.now() - session.rotatedAt.getTime() < REUSE_GRACE_MS) {
      throw new AppError(401, 'REFRESH_RACE', 'Session was refreshed by another request');
    }
    await prisma.refreshSession.updateMany({ where: { familyId: session.familyId, revokedAt: null }, data: { revokedAt: new Date() } });
    await audit(req, 'REFRESH_TOKEN_REUSE', 'User', session.userId);
    clearCookies(res);
    throw unauthorized('Session ended for security reasons. Please sign in again.');
  }
  if (session.expiresAt < new Date() || session.user.status !== 'ACTIVE') throw unauthorized();
  // Conditional update guards against two concurrent refreshes both succeeding.
  const marked = await prisma.refreshSession.updateMany({ where: { id: session.id, rotatedAt: null }, data: { rotatedAt: new Date() } });
  if (marked.count === 0) throw unauthorized();
  const refresh = await createRefresh(req, session.userId, session.familyId);
  setCookies(res, signAccess(session.userId), refresh);
}

export async function revokeCurrent(req: Request) {
  const token = req.cookies?.refresh_token as string | undefined;
  if (!token) return;
  const s = await prisma.refreshSession.findUnique({ where: { tokenHash: sha256(token) } });
  if (s) await prisma.refreshSession.updateMany({ where: { familyId: s.familyId, revokedAt: null }, data: { revokedAt: new Date() } });
}

export async function mePayload(userId: string) {
  const u = await prisma.user.findUniqueOrThrow({ where: { id: userId }, include: { roles: true } });
  return { id: u.id, email: u.email, firstName: u.firstName, lastName: u.lastName, roles: u.roles.map((r) => r.role), mfaEnabled: u.mfaEnabled };
}
