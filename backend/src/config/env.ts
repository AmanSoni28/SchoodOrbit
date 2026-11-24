import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().min(1),
  JWT_ACCESS_SECRET: z.string().min(32),
  CORS_ORIGINS: z.string().default('http://localhost:5173'),
  APP_URL: z.string().default('http://localhost:5173'),
  STORAGE_DIR: z.string().default('./storage'),
  BLOB_READ_WRITE_TOKEN: z.string().optional(), // set on Vercel: uploads go to private Vercel Blob
  ANTHROPIC_API_KEY: z.string().optional(),
  AI_MODEL: z.string().default('claude-opus-5-5'),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  // Field names only — never values (they may be secrets).
  console.error('Invalid environment:', parsed.error.issues.map((i) => i.path.join('.')).join(', '));
  process.exit(1);
}
export const env = parsed.data;
export const isProd = env.NODE_ENV === 'production';
