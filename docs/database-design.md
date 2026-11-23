# Database design

PostgreSQL 16, database `college_lms`, managed via Prisma migrations (`backend/prisma`). 66 models; see `schema.prisma` for every field.

## Groups (PDF §13)
- **Identity:** User, UserRole (enum RoleName), RefreshSession (hashed token, familyId for reuse detection), PasswordResetToken, AuditLog
- **Settings:** CollegeSettings (singleton `default`), FeatureFlag
- **Academic:** Department, Program, Batch, Section, AcademicYear, Semester
- **Course:** Course (definition) vs CourseOffering (course × semester × section), InstructorAssignment, Enrollment
- **Content:** CourseModule, Lesson, LessonResource, FileAsset, LessonProgress, Topic, LessonTopic
- **Assessment:** Assignment, Submission (one row per attempt), SubmissionFile, Question, QuestionVersion (immutable), Quiz, QuizQuestion (pins a version), QuizAttempt, AttemptAnswer
- **Engagement:** ClassSession, AttendanceRecord, Announcement, DiscussionThread, DiscussionPost, Notification, Certificate
- **Doubt board:** Doubt (private authorId), DoubtVote, DoubtReply, DoubtReport, DoubtModerationLog
- **AI:** AICoursePolicy, AIUsageRecord, AIStudySession/Message/Attachment/Feedback, AIContentJob/Source/Draft/Approval
- **Insights:** LearningEvent, InsightRecommendation
- **Revision:** RevisionPolicy, RevisionQuiz, RevisionQuizQuestion, RevisionAttempt, RevisionAnswer, RevisionStreak
- **Parent:** ParentStudentLink, ParentAccessConsent (scope array, expiry, revocation), ParentNotificationPreference

## Rules applied
- UUID keys; email unique and stored lower-case.
- Key uniques: Enrollment(studentId, offeringId); InstructorAssignment(facultyId, offeringId); DoubtVote(doubtId, studentId); RevisionQuiz(studentId, offeringId, scheduledLocalDate); ParentStudentLink(parentId, studentId); Submission(assignmentId, studentId, attemptNo); QuizAttempt(quizId, studentId, attemptNo); QuestionVersion(questionId, version).
- Historical integrity: question edits create new versions; quizzes and revision sets reference versions; academic records use `onDelete: Restrict`; lessons are archived, not deleted.
- Grade history: every grade entry or change writes an AuditLog row with old and new values.
- Transactions: final quiz submission (row lock), enrollment batches, attendance saves, revision submit and streak, parent link and consent changes.

## Migrations
`20261123092630_init` — initial schema, applied after a `pg_dump` backup (`backups/`, git-ignored). Workflow: edit schema → `npx prisma migrate dev --name x` → review SQL → run tests → back up → `migrate deploy` on staging, then production. Never create LMS tables by hand in pgAdmin.
