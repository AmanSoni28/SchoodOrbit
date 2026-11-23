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

## Required environment
`DATABASE_URL`, `JWT_ACCESS_SECRET` (≥32 random bytes; it also derives the MFA field-encryption key, so rotating it resets MFA enrolment), `CORS_ORIGINS`, `APP_URL`, `STORAGE_DIR` (until the S3 driver exists), `ANTHROPIC_API_KEY` (optional), `AI_MODEL`.

## Security checklist before go-live
- Use a dedicated least-privilege database role, not `postgres`.
- Configure a real mail transport (the dev mailer refuses to run in production).
- Put the storage directory or bucket outside the web root; downloads only through `/files/:id/download`.
- Set up automated encrypted backups and test a restore.
- Review DPDP Act obligations with counsel (PDF §15), especially for minors and parent access.
