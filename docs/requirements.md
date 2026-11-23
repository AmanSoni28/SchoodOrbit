# Requirements

Source: *College LMS — Complete Architecture, Features, UI/UX & Development Blueprint* v1.0 (23 Nov 2026). Section numbers below refer to that PDF.

## Scope (§01, §05)
In scope: identity & settings, academic structure, courses/offerings/enrollment, content delivery, assignments, question banks & quizzes, gradebook, attendance & live links, communication, certificates & reporting, parent portal, five advanced features.
Out of scope (hard exclusion): fees, admissions, payroll/HR, hostel, transport, inventory, ERP workflow. Integrate with an SIS later instead.

## Roles (§03)
SUPER_ADMIN, COLLEGE_ADMIN, FACULTY, STUDENT, PARENT. Users may hold several roles; the UI offers a workspace switcher. Backend checks role **and** resource relationship (instructor assignment, enrollment, parent consent) on every request.

## Release success criteria (§01) — status
| Criterion | Status | Evidence |
|---|---|---|
| All five roles sign in, cannot access unauthorized records | Met | `tests/api.test.ts` › authentication, authorization boundaries |
| Admin creates offering, assigns instructor, enrolls student | Met | › release success criteria |
| Faculty publishes lesson; grades & publishes assignment feedback | Met | › release success criteria |
| Student completes quiz; score persists in gradebook | Met | › release success criteria |
| Five smart modules work with real relationships & permissions | Met (AI needs an API key to run live) | Doubt, Revision, AI, Insights, Parent test blocks |
| Security, accessibility, backup/recovery, E2E gates | Partial | See test-plan.md "Not yet done" |

## Workflow state machines (§04)
Lesson DRAFT→SCHEDULED→PUBLISHED→ARCHIVED · Assignment DRAFT→PUBLISHED→CLOSED→ARCHIVED · Submission SUBMITTED→GRADED (each resubmission is a new row) · Quiz DRAFT→PUBLISHED→CLOSED · Attempt IN_PROGRESS→SUBMITTED→GRADED · AI job QUEUED→PROCESSING→DRAFT_READY/FAILED, draft PENDING→APPROVED/REJECTED→PUBLISHED · Doubt OPEN→ANSWERED→RESOLVED/HIDDEN.

Full per-feature mapping: see [feature-matrix.md](feature-matrix.md).
