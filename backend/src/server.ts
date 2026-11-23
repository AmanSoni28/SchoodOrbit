import { env } from './config/env';
import { createApp } from './app';
import { prisma } from './lib/prisma';
import { recoverStuckJobs } from './modules/ai-content/ai-content.service';

async function main() {
  await prisma.$queryRaw`SELECT 1`;
  await recoverStuckJobs();
  createApp().listen(env.PORT, () => console.log(`API listening on http://localhost:${env.PORT}/api/v1`));
}

main().catch((e) => {
  console.error('Failed to start:', e.message);
  process.exit(1);
});
