import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import argon2 from 'argon2';
import { prisma } from '../../lib/prisma';
import { AppError, badRequest, notFound } from '../../lib/errors';
import { authenticate, PRIVILEGED } from '../../middleware/auth';
import { issueCsrf } from '../../middleware/csrf';
import { audit } from '../../lib/audit';
import { decrypt, encrypt, randomToken, sha256 } from '../../lib/crypto';
import { generateSecret, otpauthUri, verifyTotp } from '../../lib/totp';
import { sendMail } from '../../lib/mailer';
import { env } from '../../config/env';
import { getSettings } from '../../lib/settings';
import { clearCookies, hashPassword, mePayload, revokeCurrent, rotate, startSession, verifyCredentials } from './auth.service';

export const passwordSchema = z.string().min(10, 'Use at least 10 characters').max(128);

const limiter = (max: number) =>
  rateLimit({ windowMs: 15 * 60 * 1000, limit: max, standardHeaders: true, legacyHeaders: false, skip: () => env.NODE_ENV === 'test',
    handler: (_req, res) => res.status(429).json({ error: { code: 'RATE_LIMITED', message: 'Too many attempts. Please wait and try again.' } }) });

const r = Router();

r.get('/csrf', (_req, res) => res.json({ data: { csrfToken: issueCsrf(res) } }));

r.post('/login', limiter(20), async (req, res) => {
  const body = z.object({ email: z.string().email(), password: z.string().min(1).max(200), mfaCode: z.string().optional() }).parse(req.body);
  const user = await verifyCredentials(req, body.email, body.password);
  if (user.mfaEnabled) {
    if (!body.mfaCode) throw new AppError(401, 'MFA_REQUIRED', 'Enter the 6-digit code from your authenticator app');
    if (!verifyTotp(decrypt(user.mfaSecret!), body.mfaCode)) {
      await audit(req, 'MFA_FAILED', 'User', user.id);
      throw new AppError(401, 'MFA_INVALID', 'That code is not valid');
    }
  }
  await prisma.user.update({ where: { id: user.id }, data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() } });
  await startSession(req, res, user.id);
  await prisma.auditLog.create({ data: { actorId: user.id, action: 'LOGIN', entityType: 'User', entityId: user.id, ip: req.ip } });
  const me = await mePayload(user.id);
  const { settings } = await getSettings();
  res.json({ data: { user: me, mfaSetupRequired: settings.requireMfaForAdmins && !me.mfaEnabled && me.roles.some((x) => PRIVILEGED.includes(x)) } });
});

r.post('/refresh', limiter(300), async (req, res) => {
  await rotate(req, res);
  res.json({ data: { ok: true } });
});

r.post('/logout', async (req, res) => {
  await revokeCurrent(req);
  clearCookies(res);
  res.json({ data: { ok: true } });
});

r.post('/password/forgot', limiter(10), async (req, res) => {
  const { email } = z.object({ email: z.string().email() }).parse(req.body);
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } });
  if (user && user.status === 'ACTIVE') {
    const token = randomToken();
    await prisma.passwordResetToken.create({ data: { userId: user.id, tokenHash: sha256(token), expiresAt: new Date(Date.now() + 30 * 60 * 1000) } });
    await sendMail(user.email, 'Reset your password', `Reset link (valid 30 minutes): ${env.APP_URL}/reset-password?token=${token}`);
    await audit(req, 'PASSWORD_RESET_REQUESTED', 'User', user.id);
  }
  // Same response whether or not the account exists.
  res.json({ data: { ok: true } });
});

r.post('/password/reset', limiter(10), async (req, res) => {
  const { token, password } = z.object({ token: z.string().min(10), password: passwordSchema }).parse(req.body);
  const row = await prisma.passwordResetToken.findUnique({ where: { tokenHash: sha256(token) } });
  if (!row || row.usedAt || row.expiresAt < new Date()) throw badRequest('This reset link is invalid or has expired');
  await prisma.$transaction([
    prisma.passwordResetToken.update({ where: { id: row.id }, data: { usedAt: new Date() } }),
    prisma.user.update({ where: { id: row.userId }, data: { passwordHash: await hashPassword(password), failedLoginCount: 0, lockedUntil: null } }),
    prisma.refreshSession.updateMany({ where: { userId: row.userId, revokedAt: null }, data: { revokedAt: new Date() } }),
  ]);
  await audit(req, 'PASSWORD_RESET', 'User', row.userId);
  res.json({ data: { ok: true } });
});

// ── Authenticated ──
r.use(authenticate);

r.get('/me', async (req, res) => res.json({ data: await mePayload(req.user!.id) }));

r.post('/password/change', async (req, res) => {
  const { currentPassword, newPassword } = z.object({ currentPassword: z.string(), newPassword: passwordSchema }).parse(req.body);
  const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id } });
  if (!(await argon2.verify(user.passwordHash, currentPassword))) throw badRequest('Current password is incorrect');
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(newPassword) } });
  await audit(req, 'PASSWORD_CHANGED', 'User', user.id);
  res.json({ data: { ok: true } });
});

r.get('/sessions', async (req, res) => {
  const sessions = await prisma.refreshSession.findMany({
    where: { userId: req.user!.id, revokedAt: null, rotatedAt: null, expiresAt: { gt: new Date() } },
    select: { id: true, userAgent: true, ip: true, createdAt: true }, orderBy: { createdAt: 'desc' },
  });
  res.json({ data: sessions });
});

r.delete('/sessions/:id', async (req, res) => {
  const s = await prisma.refreshSession.findFirst({ where: { id: String(req.params.id), userId: req.user!.id } });
  if (!s) throw notFound();
  await prisma.refreshSession.updateMany({ where: { familyId: s.familyId, revokedAt: null }, data: { revokedAt: new Date() } });
  res.json({ data: { ok: true } });
});

r.post('/logout-all', async (req, res) => {
  await prisma.refreshSession.updateMany({ where: { userId: req.user!.id, revokedAt: null }, data: { revokedAt: new Date() } });
  await audit(req, 'LOGOUT_ALL', 'User', req.user!.id);
  clearCookies(res);
  res.json({ data: { ok: true } });
});

r.post('/mfa/setup', async (req, res) => {
  if (req.user!.mfaEnabled) throw badRequest('Two-factor authentication is already on');
  const secret = generateSecret();
  await prisma.user.update({ where: { id: req.user!.id }, data: { mfaSecret: encrypt(secret) } });
  const { settings } = await getSettings();
  res.json({ data: { secret, otpauthUri: otpauthUri(secret, req.user!.email, settings.shortName) } });
});

r.post('/mfa/enable', async (req, res) => {
  const { code } = z.object({ code: z.string() }).parse(req.body);
  const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id } });
  if (!user.mfaSecret || !verifyTotp(decrypt(user.mfaSecret), code)) throw badRequest('That code is not valid');
  await prisma.user.update({ where: { id: user.id }, data: { mfaEnabled: true } });
  await audit(req, 'MFA_ENABLED', 'User', user.id);
  res.json({ data: { ok: true } });
});

r.post('/mfa/disable', async (req, res) => {
  const { code, password } = z.object({ code: z.string(), password: z.string() }).parse(req.body);
  const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id } });
  if (!user.mfaEnabled || !user.mfaSecret) throw badRequest('Two-factor authentication is not on');
  if (!(await argon2.verify(user.passwordHash, password)) || !verifyTotp(decrypt(user.mfaSecret), code)) throw badRequest('Password or code is incorrect');
  const { settings } = await getSettings();
  if (settings.requireMfaForAdmins && req.user!.roles.some((x) => PRIVILEGED.includes(x))) throw badRequest('Your college requires two-factor authentication for administrators');
  await prisma.user.update({ where: { id: user.id }, data: { mfaEnabled: false, mfaSecret: null } });
  await audit(req, 'MFA_DISABLED', 'User', user.id);
  res.json({ data: { ok: true } });
});

export default r;
