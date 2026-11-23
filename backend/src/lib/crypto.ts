import crypto from 'crypto';
import { env } from '../config/env';

export const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString('base64url');
export const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest('hex');

// shortcut: field-encryption key is derived from JWT_ACCESS_SECRET; rotating that secret disables existing MFA
// enrolments. Move to a dedicated KMS-held key before production.
const key = Buffer.from(crypto.hkdfSync('sha256', env.JWT_ACCESS_SECRET, 'college-lms', 'field-encryption', 32));

export function encrypt(plain: string) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return [iv, c.getAuthTag(), enc].map((b) => b.toString('base64url')).join('.');
}

export function decrypt(payload: string) {
  const [iv, tag, enc] = payload.split('.').map((s) => Buffer.from(s, 'base64url'));
  const d = crypto.createDecipheriv('aes-256-gcm', key, iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(enc), d.final()]).toString('utf8');
}
