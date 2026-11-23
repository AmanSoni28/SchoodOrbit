# Requirements coverage matrix

Each PDF requirement → phase, Prisma models, API, frontend page, acceptance test. ✅ built & tested · 🟡 built, partially tested or with a documented limit · ⬜ not built.

| # | Requirement (PDF §) | Phase | Models | API | UI | Tests | Status |
|---|---|---|---|---|---|---|---|
| 1 | JWT + rotating refresh cookies, CSRF, Argon2id (§15) | 2 | User, RefreshSession | `/auth/*` | Login, Account | refresh reuse, CSRF, lockout | ✅ |
| 2 | MFA for privileged roles (§15) | 2 | User.mfaSecret (AES-GCM) | `/auth/mfa/*` | Account | TOTP RFC vector | 🟡 enforcement flag tested manually only |
| 3 | Password reset, lockout, rate limit (§15) | 2 | PasswordResetToken | `/auth/password/*` | Forgot/Reset | lockout | 🟡 dev mailer logs to console |
| 4 | Sessions list / revoke-all (§15) | 2 | RefreshSession | `/auth/sessions`, `/auth/logout-all` | Account | — | ✅ |
| 5 | Immediate suspension (§15) | 2 | User.status | `PATCH /users/:id` | Users | suspension test | ✅ |
| 6 | RBAC + resource policies (§03) | 2 | UserRole, InstructorAssignment, Enrollment | `lib/policies.ts` | RoleGate | boundary tests | ✅ |
| 7 | Branding, feature toggles, contrast check (§02, §16) | 3 | CollegeSettings, FeatureFlag | `/settings*` | Settings | — | ✅ |
| 8 | Academic structure (§05) | 3 | Department…Section, AcademicYear, Semester | `/departments` … `/semesters` | Academics | admin flow | ✅ |
| 9 | Course vs offering, instructors, enrollment (§05, §13) | 3 | Course, CourseOffering, InstructorAssignment, Enrollment | `/courses`, `/offerings*` | Courses, Offerings, People tab | idempotent enroll | ✅ |
| 10 | Modules, lessons, schedule, resources, completion (§05) | 4 | CourseModule, Lesson, LessonResource, FileAsset, LessonProgress, Topic | `/offerings/:id/modules`, `/lessons*` | Lessons tab, LessonPage | publish/complete | ✅ |
| 11 | Private file storage + authorized download (§12) | 4 | FileAsset | `/files` | FileUpload | — | 🟡 local disk driver; S3 driver not written |
| 12 | Assignments, late rules, resubmission, rubric, grading, publish (§04B) | 5 | Assignment, Submission, SubmissionFile | `/assignments*`, `/submissions/:id/grade` | AssignmentPage | submit/grade/publish | ✅ |
| 13 | Versioned question bank (§04C, §13) | 5 | Question, QuestionVersion | `/offerings/:id/questions`, `/questions/:id` | Question bank tab | grading unit tests | ✅ |
| 14 | Server-timed quiz, autosave, idempotent submit, manual grading (§04C) | 5 | Quiz, QuizQuestion, QuizAttempt, AttemptAnswer | `/quizzes*`, `/attempts*` | QuizPage, AttemptPage | quiz flow | ✅ |
| 15 | Weighted gradebook, export, published-only views (§05) | 5 | (derived) + AuditLog for history | `/offerings/:id/gradebook(.csv)`, `/grades/me` | Grades tab | gradebook unit + flow | ✅ |
| 16 | Attendance & live links (§05) | 5 | ClassSession, AttendanceRecord | `/offerings/:id/sessions`, `/sessions/:id/attendance` | Attendance tab | — | 🟡 no automated test |
| 17 | Announcements, discussions, notifications (§05) | 6 | Announcement, DiscussionThread/Post, Notification | `/announcements`, `/threads*`, `/notifications*` | Announcements, Discussions tab, Notifications | — | 🟡 no automated test; email delivery not built |
| 18 | Certificates with public verification (§05) | 6 | Certificate | `/offerings/:id/certificates`, `/certificates/verify/:code` | People tab, Certificates, /verify | — | 🟡 no PDF rendering |
| 19 | **Anonymous Doubt Board** (§06) | 6 | Doubt, DoubtVote, DoubtReply, DoubtReport, DoubtModerationLog | per §06 + `/reveal-identity` | Doubts tab, DoubtPage | anonymity, vote dedupe, isolation, audited reveal | ✅ image attachments not built |
| 20 | **Daily Revision Quiz** (§10) | 6 | RevisionPolicy, RevisionQuiz(+Question), RevisionAttempt, RevisionAnswer, RevisionStreak | per §10 | Revision, RevisionQuiz, Settings tab | no duplicates, no-content, persistence, TZ | ✅ retry policy not built (one attempt/day) |
| 21 | **AI Homework Helper** (§07) | 7 | AIStudySession/Message/Attachment/Feedback, AICoursePolicy, AIUsageRecord | per §07 | AIHelper | privacy, not-configured | 🟡 live model path untested without key |
| 22 | **AI Notes & Quiz Generator** (§08) | 7 | AIContentJob/Source/Draft/Approval | per §08 + `/retry` | AI generator tab, AIJobPage | student blocked, draft validation | 🟡 live model path untested without key |
| 23 | **Smart Class Insights** (§09) | 8 | LearningEvent, InsightRecommendation (+ derived) | `/analytics/offerings/:id/*`, `/analytics/college/overview` | Insights tab, Reports | reconciliation test | ✅ PerformanceSnapshot not needed (computed live) |
| 24 | **Parent portal** with consent scopes (§11) | 8 | ParentStudentLink, ParentAccessConsent, ParentNotificationPreference | `/parent/*`, `/parent-links`, `/me/parent-links` | ParentHome, ParentLinks, Privacy | scope, unlinked 404, revoke | ✅ preferences stored but no email/notify filtering |
| 25 | Super Admin health, audit, AI cost (§11) | 8 | AuditLog, AIUsageRecord | `/system/health`, `/audit-logs` | Dashboard, Audit | — | ✅ |
| 26 | Every screen: loading/empty/error/no-permission (§16) | 1–8 | — | — | `QueryView`, `EmptyState`, `ErrorState`, `RoleGate` | — | ✅ |
| 27 | WCAG 2.2 AA target (§01, §02) | 9 | — | — | labels, focus rings, skip link, non-colour cues | — | 🟡 not audited with axe / screen reader |
| 28 | OpenAPI definition (§12) | 9 | — | — | — | — | ⬜ endpoint list in api-specification.md instead |
| 29 | Playwright E2E, load tests, backup restore drill (§17) | 9 | — | — | — | — | ⬜ |
| 30 | Staging/production deployment (§12) | 9 | — | — | — | — | ⬜ guide only (deployment.md) |
