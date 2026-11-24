# Deployment

One deployment per college: its own database, storage, domain, `.env` and branding (PDF §12). No multi-tenancy.

## Environments
| Env | Database | Notes |
|---|---|---|
| Local | `college_lms` + `college_lms_test` on PostgreSQL 16 | `.env` in `backend/` (git-ignored); fictional seed |
| Staging | separate managed Postgres | production-like; rehearse migrations with a backup |
| Production | separate managed Postgres, secret manager | HTTPS only; `NODE_ENV=production` (secure cookies, mailer must be configured) |

## Steps
1. `npm ci && npm run build` (backend → `backend/dist`, frontend → `frontend/dist`).
2. Back up first: `pg_dump -Fc -f backup.dump <db>`. Then `cd backend && npx prisma migrate deploy`.
3. Start the API: `node backend/dist/server.js` (systemd, PM2 or a container).
4. Serve `frontend/dist` from the same origin and reverse-proxy `/api` to the API (cookies are first-party; SameSite=Lax).
5. Set `CORS_ORIGINS` and `APP_URL` to the public origin.
6. Create the first Super Admin through a one-off script or the seed adapted with real details, then turn on "Require MFA for administrators".

## Vercel (one project: frontend + API)
The React build is served as static files and the whole Express API runs as one serverless function (`api/index.ts`); `vercel.json` rewrites `/api/*` to it, so everything stays on one origin and cookies keep working.

1. **Database** — Vercel dashboard → Storage → create a **Neon** Postgres database and connect it to the project. Use the *pooled* URL for `DATABASE_URL` and append `?pgbouncer=true&connection_limit=1` (serverless functions each open their own connection).
2. **File storage** — Storage → create a **Blob** store (private) and connect it. This sets `BLOB_READ_WRITE_TOKEN`; uploads then go to Blob instead of the (read-only) disk. Vercel limits request bodies to 4.5 MB, so uploads are capped at 4 MB there.
3. **Environment variables** (Production): `JWT_ACCESS_SECRET` (`node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`), `APP_URL` and `CORS_ORIGINS` = `https://<your-project>.vercel.app`, optionally `ANTHROPIC_API_KEY` and `AI_MODEL`. `NODE_ENV` is set to `production` by Vercel.
4. **Migrate and seed from your machine**, pointing at Neon's *direct* (non-pooled) URL — PowerShell:
   ```powershell
   cd backend
   $env:DATABASE_URL = "<neon direct url>"
   npx prisma migrate deploy
   npm run db:seed; npm run db:demo; npm run db:topics; npm run db:activity   # demo data only — skip for a real college
   Remove-Item Env:DATABASE_URL
   ```
5. **Deploy** — either `npx vercel --prod` from the repo root (uploads the working folder; `.vercelignore` keeps `.env` out), or push to GitHub and import the repo in Vercel (root directory = repo root; settings come from `vercel.json`).

Limits on Vercel: email is not sent until a mail transport is added (`lib/mailer.ts`); AI content jobs run inside the request's function via `waitUntil` (max 300 s); a job interrupted by a crash stays "Processing" — retry it.

## Required environment
`DATABASE_URL`, `JWT_ACCESS_SECRET` (≥32 random bytes; it also derives the MFA field-encryption key, so rotating it resets MFA enrolment), `CORS_ORIGINS`, `APP_URL`, `STORAGE_DIR` (local disk) or `BLOB_READ_WRITE_TOKEN` (Vercel Blob), `ANTHROPIC_API_KEY` (optional), `AI_MODEL`.

## Security checklist before go-live
- Use a dedicated least-privilege database role, not `postgres`.
- Configure a real mail transport (the dev mailer refuses to run in production).
- Put the storage directory or bucket outside the web root; downloads only through `/files/:id/download`.
- Set up automated encrypted backups and test a restore.
- Review DPDP Act obligations with counsel (PDF §15), especially for minors and parent access.
