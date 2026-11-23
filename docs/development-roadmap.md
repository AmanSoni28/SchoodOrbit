# Development roadmap

| Phase | Scope | Status (23 Nov 2026) |
|---|---|---|
| 1 Foundation | Repo, docs, design tokens, env config | ✅ |
| 2 Identity | JWT/refresh/CSRF, Argon2id, MFA, lockout, RBAC, policies | ✅ |
| 3 Academics | Settings/branding, structure, courses, offerings, enrollment | ✅ |
| 4 Learning | Modules/lessons, resources, file storage, completion | ✅ (local storage) |
| 5 Assessments | Assignments, question bank, quizzes, gradebook, attendance | ✅ |
| 6 Engagement | Doubt board, daily revision, announcements, discussions, notifications, certificates | ✅ |
| 7 AI | Homework helper, content generator | ✅ code / ⏳ live verification needs `ANTHROPIC_API_KEY` |
| 8 Insights & parent | Class insights, college report, parent portal | ✅ |
| 9 Release hardening | E2E, accessibility audit, OpenAPI, S3, SMTP, deployment, load and backup drills | ⏳ **next** |

## Next phase (9) — task breakdown
1. Add `ANTHROPIC_API_KEY`; run both AI flows end to end; add integration tests with a mocked SDK client.
2. Playwright E2E following the PDF §18 demo script (admin → faculty → student → parent).
3. axe-core scan of every page plus keyboard pass; fix findings.
4. Real mail transport (password reset, notification emails honouring parent preferences).
5. S3-compatible storage driver; signed download URLs.
6. Generate OpenAPI from the Zod schemas.
7. Dockerfiles + compose (API, web, Postgres) for staging; backup and restore rehearsal.
8. Upgrade Prisma to 7.x (clears the `npm audit` advisories in the Prisma CLI toolchain).
9. Smaller gaps: doubt image attachments, revision retry policy, certificate PDF, attendance and communication API tests.
