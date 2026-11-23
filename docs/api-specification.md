# API specification

Base `/api/v1`. JSON. Success `{ data, meta? }`; error `{ error: { code, message, details?, requestId } }`.
Status codes: 401 unauthenticated / expired, 403 forbidden or CSRF, 404 not found (also used to hide existence), 409 conflict, 422 validation (`details[]` = `{path, message}`), 423 locked, 429 rate limit or quota, 503 AI not configured or unavailable (`details.retryable`).
Non-GET requests need `x-csrf-token` matching the `csrf_token` cookie (not needed for Bearer clients). Lists take `page` and `pageSize` (max 100).

## Public
`GET /health` · `GET /settings/public` · `GET /certificates/verify/:code` · `GET /auth/csrf` · `POST /auth/login {email,password,mfaCode?}` · `POST /auth/refresh` · `POST /auth/logout` · `POST /auth/password/forgot|reset`

## Auth (signed in)
`GET /auth/me` · `POST /auth/password/change` · `GET /auth/sessions` · `DELETE /auth/sessions/:id` · `POST /auth/logout-all` · `POST /auth/mfa/setup|enable|disable`

## Admin
`GET|PATCH /settings` · `PUT /settings/features/:key` · `GET /system/health` · `GET /audit-logs` · `GET|POST /users` · `GET|PATCH /users/:id` · `GET|POST /parent-links` · `POST /parent-links/:id/revoke`
`GET|POST /departments` (`PATCH|DELETE /departments/:id`) · `GET|POST /programs` · `POST /batches` · `GET|POST /sections` · `GET|POST /academic-years` · `GET|POST /semesters`
`GET|POST /courses` · `PATCH /courses/:id` · `GET /offerings?scope=mine|all&semesterId` · `POST /offerings` · `GET|PATCH /offerings/:id` · `POST /offerings/:id/instructors` · `DELETE /offerings/:id/instructors/:facultyId` · `GET|POST /offerings/:id/enrollments {studentIds|emails}` · `PATCH /offerings/:id/enrollments/:studentId`

## Learning
`GET|POST /offerings/:id/topics` · `GET|POST /offerings/:id/modules` · `PATCH|DELETE /modules/:id` · `POST /modules/:id/lessons` · `GET|PATCH|DELETE /lessons/:id` · `POST /lessons/:id/resources` · `DELETE /resources/:id` · `POST /lessons/:id/complete` · `GET /offerings/:id/progress` · `POST /files` (multipart `file`) · `GET /files/:id/download`

## Assessment
`GET|POST /offerings/:id/assignments` · `GET|PATCH /assignments/:id` · `POST /assignments/:id/submissions {content,fileAssetIds}` · `GET /assignments/:id/submissions` · `PATCH /submissions/:id/grade {score,feedback,publish}` · `POST /assignments/:id/publish-grades`
`GET|POST /offerings/:id/questions` · `PATCH /questions/:id` · `GET /questions/:id/versions` · `GET|POST /offerings/:id/quizzes` · `GET|PATCH /quizzes/:id` · `POST /quizzes/:id/attempts` (start/resume) · `GET /quizzes/:id/attempts` · `GET /attempts/:id` · `PUT /attempts/:id/answers/:questionVersionId` · `POST /attempts/:id/submit` · `PATCH /attempts/:id/answers/:questionVersionId/grade`
`GET /offerings/:id/gradebook` · `GET /offerings/:id/gradebook.csv` · `GET /offerings/:id/grades/me`

## Attendance & communication
`GET|POST /offerings/:id/sessions` · `GET|PUT /sessions/:id/attendance` · `GET /offerings/:id/attendance/me|report` · `GET|POST /announcements` · `GET|POST /offerings/:id/announcements` · `GET|POST /offerings/:id/threads` · `GET /threads/:id` · `POST /threads/:id/posts` · `PATCH /threads/:id/hide` · `PATCH /posts/:id/hide` · `GET /notifications` · `POST /notifications/:id/read` · `POST /notifications/read-all` · `POST /offerings/:id/certificates` · `GET /certificates/me`

## Smart features
- Doubts: `GET|POST /offerings/:id/doubts?sort&status&lessonId&topicId&search` · `GET /doubts/:id` · `POST|DELETE /doubts/:id/votes` · `POST /doubts/:id/replies` · `PATCH /doubts/:id/status` · `POST /doubts/:id/reports` · `PATCH /doubt-reports/:id` · `POST /doubt-replies/:id/useful` · `POST /doubts/:id/reveal-identity {reason}`
- Revision: `GET /revision/today` · `POST /revision/offerings/:id/generate` · `GET /revision/quizzes/:id` · `POST /revision/quizzes/:id/attempts` · `PUT /revision/attempts/:id/answers/:questionVersionId` · `POST /revision/attempts/:id/submit` · `GET /revision/history` · `GET|PUT /offerings/:id/revision-policy` · `GET /offerings/:id/revision/stats`
- AI homework: `GET /ai/homework/status` · `GET|POST /ai/homework/sessions` · `GET|DELETE /ai/homework/sessions/:id` · `POST /ai/homework/sessions/:id/messages` (multipart `content`, `mode`, `files[]`) · `POST /ai/homework/messages/:id/feedback` · `GET|PUT /offerings/:id/ai-policy`
- AI content: `POST /ai/content/jobs` · `GET /ai/content/jobs?offeringId` · `GET /ai/content/jobs/:id` · `POST /ai/content/jobs/:id/retry` · `GET|PATCH /ai/content/drafts/:id` · `POST /ai/content/drafts/:id/approve|publish|add-to-question-bank`
- Insights: `GET /analytics/offerings/:id/overview|topics|wrong-answers|students|doubt-trends|recommendations|export?from&to` · `POST /analytics/offerings/:id/recommendations` · `PATCH /analytics/recommendations/:id` · `GET /analytics/college/overview`
- Parent: `GET /parent/students` · `GET /parent/students/:id/progress|grades|attendance|calendar` · `GET|PATCH /parent/notification-preferences` · `GET /me/parent-links` · `POST /me/parent-links/:id/revoke`
- Dashboards: `GET /dashboard/student|faculty|admin`

A generated OpenAPI document is not produced yet (see feature-matrix #28).
