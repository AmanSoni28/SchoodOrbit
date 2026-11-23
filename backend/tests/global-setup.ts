import 'dotenv/config';
import { execSync } from 'child_process';
import { PrismaClient } from '@prisma/client';

// Resets ONLY the dedicated *_test database: migrate, truncate, then load the fictional seed.
export default async function setup() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url || !/\/[^/]+_test(\?|$)/.test(url)) throw new Error('TEST_DATABASE_URL must point to a database whose name ends in _test');
  const env = { ...process.env, DATABASE_URL: url, NODE_ENV: 'test' };
  execSync('npx prisma migrate deploy', { env, stdio: 'pipe' });
  const prisma = new PrismaClient({ datasourceUrl: url });
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  await prisma.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(', ')} CASCADE`);
  await prisma.$disconnect();
  execSync('npx tsx prisma/seed.ts', { env, stdio: 'pipe' });
}
