import crypto from 'crypto';

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function generateSecret(bytes = 20) {
  let bits = '', out = '';
  for (const b of crypto.randomBytes(bytes)) bits += b.toString(2).padStart(8, '0');
  for (let i = 0; i + 5 <= bits.length; i += 5) out += B32[parseInt(bits.slice(i, i + 5), 2)];
  return out;
}

function base32Decode(s: string) {
  let bits = '';
  for (const c of s.replace(/=+$/, '').toUpperCase()) bits += B32.indexOf(c).toString(2).padStart(5, '0');
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}

// RFC 6238 TOTP: SHA-1, 6 digits, 30 s step.
export function totp(secret: string, time = Date.now()) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(time / 30000)));
  const h = crypto.createHmac('sha1', base32Decode(secret)).update(counter).digest();
  const o = h[h.length - 1] & 0xf;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000).padStart(6, '0');
}

// Accepts the previous/next step to tolerate clock drift.
export function verifyTotp(secret: string, code: string) {
  if (!/^\d{6}$/.test(code)) return false;
  return [-1, 0, 1].some((w) => crypto.timingSafeEqual(Buffer.from(totp(secret, Date.now() + w * 30000)), Buffer.from(code)));
}

export const otpauthUri = (secret: string, email: string, issuer: string) =>
  `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(email)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}`;
