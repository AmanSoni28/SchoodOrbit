# Architecture

Modular monolith (PDF §12). One deployment per college; same codebase, separate DB/storage/domain/branding.

```
frontend/  React 19 · Vite · Tailwind 4 · React Router · TanStack Query
  src/lib/        api client (CSRF + silent refresh), auth, branding, hooks
  src/components/ UI kit (ui.tsx), AppShell, Markdown, FileUpload
  src/pages/      auth, admin, courses (+ tabs), learning, student, faculty, parent, common
backend/   Express 5 · TypeScript · Prisma 6 · Zod
  src/lib/        prisma, errors, policies (authorization), audit, storage, ai, settings, totp, crypto
  src/middleware/ auth (JWT + DB re-check), csrf (double-submit)
  src/modules/    auth, settings, users, academics, courses, content, files, assignments, quizzes,
                  gradebook, attendance, communication, doubts, revision, ai-homework, ai-content,
                  analytics, parent, dashboard
  prisma/         schema.prisma, migrations/, seed.ts
  tests/          unit + API integration (real PostgreSQL test DB)
```

## Key decisions
| Decision | Why |
|---|---|
| Express 5 (no existing backend to preserve) | Least boilerplate; native async error handling. |
| Prisma 6, not 7/8 | 7 changes config/driver model; 6 is stable. Upgrade later as a planned migration. |
| Authorization in `lib/policies.ts` | One place for instructor/enrollment/consent checks; routes call `assertInstructor/assertStaff/assertMember/assertStudent/assertParentScope`. |
| Global `authenticate` in `routes.ts`, path-scoped role/feature gates | Router-level blanket middleware would leak across routers. |
| Cookies + same-origin proxy | HttpOnly tokens unreadable by JS; SameSite=Lax + double-submit CSRF. |
| Analytics computed live from source rows | Figures reconcile exactly (PDF §17); add snapshots only if slow. |
| In-process AI job queue | No Redis until volume needs it (PDF §12). Jobs interrupted by restart are marked FAILED and retryable. |
| Local-disk storage driver | Same `saveFile/readStoredFile` API; swap for S3 in production. |
| Claude API (`claude-opus-5-5`) with server-side refusal fallback; structured outputs + Zod for generated drafts | Keys stay on the server; drafts are schema-validated before storage. |
| House UI kit instead of shadcn/ui | Fewer dependencies; tokens drive white-label theming. |

## Request flow
Browser → Vite proxy `/api` → `requestId` → helmet/CORS → JSON/cookies → CSRF → public routes → `authenticate` (JWT verify + user/roles/status from DB + MFA-policy gate) → module router → Zod validation → policy check → Prisma → `{ data }` / `{ error: { code, message, details, requestId } }`.
