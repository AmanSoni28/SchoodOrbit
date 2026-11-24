// Sets one password on every demo account (@northbridge.test) and clears lockouts.
// Run once from the Vercel build with `--build-env RESET_DEMO_PASSWORD=1` (optionally SEED_PASSWORD=...).
// Real users (any other email domain) are never touched.
import argon2 from 'argon2';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const PASSWORD = process.env.SEED_PASSWORD || 'Demo@Pass2026';

async function main() {
  const passwordHash = await argon2.hash(PASSWORD, { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 });
  const demo = { email: { endsWith: '@northbridge.test' } };
  const { count } = await prisma.user.updateMany({ where: demo, data: { passwordHash, failedLoginCount: 0, lockedUntil: null } });
  // Old sessions belonged to the previous password; sign them out.
  await prisma.refreshSession.updateMany({ where: { user: demo, revokedAt: null }, data: { revokedAt: new Date() } });
  console.log(`Demo password set and lockouts cleared for ${count} demo accounts.`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
