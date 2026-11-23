# Test plan

Run: `npm test` (backend). It uses `TEST_DATABASE_URL`; global setup refuses any database whose name doesn't end in `_test`, migrates it, truncates it, and loads the fictional seed.

## Implemented (29 tests, all passing)
**Unit** (`tests/unit.test.ts`): MCQ/MULTI/TF/SHORT grading and answer-key validation; TOTP against the RFC 6238 vector; late penalty and weight renormalisation; revision streak continue/hold/reset; time-zone-aware local date; AI draft validation.

**API integration** (`tests/api.test.ts`):
- Auth: all five roles sign in; 401 without a session; CSRF enforced; identical errors for unknown email and wrong password; lockout after 5 failures; refresh rotation and reuse revokes the family; suspension blocks a still-valid JWT.
- Authorization: student → /users 403; non-enrolled offering 403; unassigned faculty 403; admin cannot grant Super Admin.
- PDF §01 criteria: create offering → assign → enroll (idempotent); draft lesson hidden → published → completed (idempotent); submit, no double submit, grade over max rejected, hidden until published, grade change audited; quiz resume, key hidden in progress, idempotent submit, score in gradebook, late answer rejected.
- Doubts: no `authorId` anywhere in responses; vote counted once; no self-vote; faculty reply sets ANSWERED; other offering 403; identity reveal admin-only and audited.
- Revision: one quiz per day; persisted answer and streak; NO_CONTENT instead of invented questions.
- AI: 503 not-configured with nothing persisted; sessions private from other students, faculty and Super Admin; students blocked from generator.
- Insights: quiz accuracy numerator and denominator equal a direct count of source rows.
- Parent: only the linked student; unlinked returns 404; AI sessions 403; student revocation removes access.

## Verified manually this session
Full login → dashboard → insights through the Vite proxy (curl). The frontend typecheck and production build pass.

## Not yet done (release gates still open)
Playwright E2E · accessibility audit (axe and screen reader) · live AI calls · attendance, communication and certificate API tests · load test of concurrent quiz attempts · backup restore drill · security review against OWASP ASVS.
