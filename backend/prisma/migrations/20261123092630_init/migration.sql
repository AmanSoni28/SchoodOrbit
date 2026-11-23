-- CreateEnum
CREATE TYPE "RoleName" AS ENUM ('SUPER_ADMIN', 'COLLEGE_ADMIN', 'FACULTY', 'STUDENT', 'PARENT');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "CourseStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "OfferingStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "EnrollmentStatus" AS ENUM ('ACTIVE', 'DROPPED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "LessonStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ResourceType" AS ENUM ('FILE', 'LINK');

-- CreateEnum
CREATE TYPE "AssignmentStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'CLOSED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "SubmissionStatus" AS ENUM ('SUBMITTED', 'GRADED');

-- CreateEnum
CREATE TYPE "QuestionType" AS ENUM ('MCQ', 'MULTI', 'TRUE_FALSE', 'SHORT');

-- CreateEnum
CREATE TYPE "Difficulty" AS ENUM ('EASY', 'MEDIUM', 'HARD');

-- CreateEnum
CREATE TYPE "QuestionStatus" AS ENUM ('DRAFT', 'APPROVED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "QuestionSource" AS ENUM ('MANUAL', 'AI');

-- CreateEnum
CREATE TYPE "QuizStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'CLOSED');

-- CreateEnum
CREATE TYPE "AttemptStatus" AS ENUM ('IN_PROGRESS', 'SUBMITTED', 'GRADED');

-- CreateEnum
CREATE TYPE "AttendanceStatus" AS ENUM ('PRESENT', 'ABSENT', 'LATE', 'EXCUSED');

-- CreateEnum
CREATE TYPE "DoubtStatus" AS ENUM ('OPEN', 'ANSWERED', 'RESOLVED', 'HIDDEN');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('OPEN', 'RESOLVED');

-- CreateEnum
CREATE TYPE "AIFeature" AS ENUM ('HOMEWORK', 'CONTENT');

-- CreateEnum
CREATE TYPE "ChatRole" AS ENUM ('USER', 'ASSISTANT');

-- CreateEnum
CREATE TYPE "AIJobStatus" AS ENUM ('QUEUED', 'PROCESSING', 'DRAFT_READY', 'FAILED');

-- CreateEnum
CREATE TYPE "DraftReviewStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'PUBLISHED');

-- CreateEnum
CREATE TYPE "RevisionStatus" AS ENUM ('READY', 'COMPLETED', 'NO_CONTENT');

-- CreateEnum
CREATE TYPE "LinkStatus" AS ENUM ('PENDING', 'ACTIVE', 'REVOKED');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "mfaSecret" TEXT,
    "mfaEnabled" BOOLEAN NOT NULL DEFAULT false,
    "failedLoginCount" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserRole" (
    "userId" UUID NOT NULL,
    "role" "RoleName" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserRole_pkey" PRIMARY KEY ("userId","role")
);

-- CreateTable
CREATE TABLE "RefreshSession" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "familyId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "rotatedAt" TIMESTAMP(3),
    "userAgent" TEXT,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RefreshSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PasswordResetToken" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" UUID NOT NULL,
    "actorId" UUID,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "metadata" JSONB,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CollegeSettings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "name" TEXT NOT NULL,
    "shortName" TEXT NOT NULL,
    "logoUrl" TEXT,
    "primaryColor" TEXT NOT NULL DEFAULT '#4163F5',
    "accentColor" TEXT NOT NULL DEFAULT '#0EAA9E',
    "timeZone" TEXT NOT NULL DEFAULT 'Asia/Kolkata',
    "locale" TEXT NOT NULL DEFAULT 'en-IN',
    "emailFromName" TEXT,
    "supportEmail" TEXT,
    "requireMfaForAdmins" BOOLEAN NOT NULL DEFAULT false,
    "academicPolicies" JSONB NOT NULL DEFAULT '{}',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CollegeSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeatureFlag" (
    "key" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeatureFlag_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "Department" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Department_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Program" (
    "id" UUID NOT NULL,
    "departmentId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "durationSemesters" INTEGER NOT NULL DEFAULT 8,

    CONSTRAINT "Program_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AcademicYear" (
    "id" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,

    CONSTRAINT "AcademicYear_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Semester" (
    "id" UUID NOT NULL,
    "academicYearId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,

    CONSTRAINT "Semester_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Batch" (
    "id" UUID NOT NULL,
    "programId" UUID NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Batch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Section" (
    "id" UUID NOT NULL,
    "batchId" UUID NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Section_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Course" (
    "id" UUID NOT NULL,
    "departmentId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "credits" INTEGER NOT NULL DEFAULT 3,
    "status" "CourseStatus" NOT NULL DEFAULT 'ACTIVE',

    CONSTRAINT "Course_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CourseOffering" (
    "id" UUID NOT NULL,
    "courseId" UUID NOT NULL,
    "semesterId" UUID NOT NULL,
    "sectionId" UUID,
    "status" "OfferingStatus" NOT NULL DEFAULT 'DRAFT',
    "meetingUrl" TEXT,
    "gradingWeights" JSONB NOT NULL DEFAULT '{"assignments":40,"quizzes":60}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CourseOffering_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InstructorAssignment" (
    "offeringId" UUID NOT NULL,
    "facultyId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InstructorAssignment_pkey" PRIMARY KEY ("facultyId","offeringId")
);

-- CreateTable
CREATE TABLE "Enrollment" (
    "id" UUID NOT NULL,
    "offeringId" UUID NOT NULL,
    "studentId" UUID NOT NULL,
    "status" "EnrollmentStatus" NOT NULL DEFAULT 'ACTIVE',
    "enrolledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Enrollment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CourseModule" (
    "id" UUID NOT NULL,
    "offeringId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "CourseModule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lesson" (
    "id" UUID NOT NULL,
    "moduleId" UUID NOT NULL,
    "offeringId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL DEFAULT '',
    "videoUrl" TEXT,
    "learningOutcomes" TEXT,
    "status" "LessonStatus" NOT NULL DEFAULT 'DRAFT',
    "publishAt" TIMESTAMP(3),
    "position" INTEGER NOT NULL DEFAULT 0,
    "isRequired" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Lesson_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FileAsset" (
    "id" UUID NOT NULL,
    "ownerId" UUID NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FileAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LessonResource" (
    "id" UUID NOT NULL,
    "lessonId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "type" "ResourceType" NOT NULL,
    "fileAssetId" UUID,
    "url" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LessonResource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LessonProgress" (
    "lessonId" UUID NOT NULL,
    "studentId" UUID NOT NULL,
    "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LessonProgress_pkey" PRIMARY KEY ("lessonId","studentId")
);

-- CreateTable
CREATE TABLE "Topic" (
    "id" UUID NOT NULL,
    "offeringId" UUID NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Topic_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LessonTopic" (
    "lessonId" UUID NOT NULL,
    "topicId" UUID NOT NULL,

    CONSTRAINT "LessonTopic_pkey" PRIMARY KEY ("lessonId","topicId")
);

-- CreateTable
CREATE TABLE "Assignment" (
    "id" UUID NOT NULL,
    "offeringId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "instructions" TEXT NOT NULL,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "maxPoints" INTEGER NOT NULL DEFAULT 100,
    "allowLate" BOOLEAN NOT NULL DEFAULT false,
    "latePenaltyPct" INTEGER NOT NULL DEFAULT 0,
    "allowResubmission" BOOLEAN NOT NULL DEFAULT false,
    "rubric" JSONB,
    "status" "AssignmentStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Assignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Submission" (
    "id" UUID NOT NULL,
    "assignmentId" UUID NOT NULL,
    "studentId" UUID NOT NULL,
    "attemptNo" INTEGER NOT NULL DEFAULT 1,
    "content" TEXT NOT NULL DEFAULT '',
    "status" "SubmissionStatus" NOT NULL DEFAULT 'SUBMITTED',
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isLate" BOOLEAN NOT NULL DEFAULT false,
    "score" DECIMAL(7,2),
    "feedback" TEXT,
    "gradedById" UUID,
    "gradedAt" TIMESTAMP(3),
    "gradePublishedAt" TIMESTAMP(3),

    CONSTRAINT "Submission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubmissionFile" (
    "submissionId" UUID NOT NULL,
    "fileAssetId" UUID NOT NULL,

    CONSTRAINT "SubmissionFile_pkey" PRIMARY KEY ("submissionId","fileAssetId")
);

-- CreateTable
CREATE TABLE "Question" (
    "id" UUID NOT NULL,
    "offeringId" UUID NOT NULL,
    "topicId" UUID,
    "createdById" UUID NOT NULL,
    "type" "QuestionType" NOT NULL,
    "difficulty" "Difficulty" NOT NULL DEFAULT 'MEDIUM',
    "status" "QuestionStatus" NOT NULL DEFAULT 'DRAFT',
    "source" "QuestionSource" NOT NULL DEFAULT 'MANUAL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Question_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuestionVersion" (
    "id" UUID NOT NULL,
    "questionId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "prompt" TEXT NOT NULL,
    "options" JSONB NOT NULL DEFAULT '[]',
    "correctAnswer" JSONB NOT NULL,
    "explanation" TEXT,
    "points" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuestionVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Quiz" (
    "id" UUID NOT NULL,
    "offeringId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "QuizStatus" NOT NULL DEFAULT 'DRAFT',
    "timeLimitMinutes" INTEGER,
    "maxAttempts" INTEGER NOT NULL DEFAULT 1,
    "opensAt" TIMESTAMP(3),
    "closesAt" TIMESTAMP(3),
    "resultsPublished" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Quiz_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuizQuestion" (
    "quizId" UUID NOT NULL,
    "questionVersionId" UUID NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "QuizQuestion_pkey" PRIMARY KEY ("quizId","questionVersionId")
);

-- CreateTable
CREATE TABLE "QuizAttempt" (
    "id" UUID NOT NULL,
    "quizId" UUID NOT NULL,
    "studentId" UUID NOT NULL,
    "attemptNo" INTEGER NOT NULL,
    "status" "AttemptStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deadlineAt" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3),
    "score" DECIMAL(7,2),
    "maxScore" DECIMAL(7,2),

    CONSTRAINT "QuizAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttemptAnswer" (
    "attemptId" UUID NOT NULL,
    "questionVersionId" UUID NOT NULL,
    "answer" JSONB NOT NULL,
    "isCorrect" BOOLEAN,
    "pointsAwarded" DECIMAL(7,2),
    "feedback" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AttemptAnswer_pkey" PRIMARY KEY ("attemptId","questionVersionId")
);

-- CreateTable
CREATE TABLE "ClassSession" (
    "id" UUID NOT NULL,
    "offeringId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "meetingUrl" TEXT,

    CONSTRAINT "ClassSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttendanceRecord" (
    "sessionId" UUID NOT NULL,
    "studentId" UUID NOT NULL,
    "status" "AttendanceStatus" NOT NULL,
    "markedById" UUID NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AttendanceRecord_pkey" PRIMARY KEY ("sessionId","studentId")
);

-- CreateTable
CREATE TABLE "Announcement" (
    "id" UUID NOT NULL,
    "offeringId" UUID,
    "authorId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Announcement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiscussionThread" (
    "id" UUID NOT NULL,
    "offeringId" UUID NOT NULL,
    "authorId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "isHidden" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DiscussionThread_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiscussionPost" (
    "id" UUID NOT NULL,
    "threadId" UUID NOT NULL,
    "authorId" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "isHidden" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DiscussionPost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "link" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Certificate" (
    "id" UUID NOT NULL,
    "offeringId" UUID NOT NULL,
    "studentId" UUID NOT NULL,
    "verificationCode" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Certificate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Doubt" (
    "id" UUID NOT NULL,
    "offeringId" UUID NOT NULL,
    "lessonId" UUID,
    "topicId" UUID,
    "authorId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" "DoubtStatus" NOT NULL DEFAULT 'OPEN',
    "isPinned" BOOLEAN NOT NULL DEFAULT false,
    "voteCount" INTEGER NOT NULL DEFAULT 0,
    "mergedIntoId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Doubt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DoubtVote" (
    "doubtId" UUID NOT NULL,
    "studentId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DoubtVote_pkey" PRIMARY KEY ("doubtId","studentId")
);

-- CreateTable
CREATE TABLE "DoubtReply" (
    "id" UUID NOT NULL,
    "doubtId" UUID NOT NULL,
    "authorId" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "isFaculty" BOOLEAN NOT NULL DEFAULT false,
    "isUseful" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DoubtReply_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DoubtReport" (
    "id" UUID NOT NULL,
    "doubtId" UUID NOT NULL,
    "reporterId" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "ReportStatus" NOT NULL DEFAULT 'OPEN',
    "resolution" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DoubtReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DoubtModerationLog" (
    "id" UUID NOT NULL,
    "doubtId" UUID NOT NULL,
    "moderatorId" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DoubtModerationLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AICoursePolicy" (
    "offeringId" UUID NOT NULL,
    "homeworkEnabled" BOOLEAN NOT NULL DEFAULT true,
    "blockDuringQuizzes" BOOLEAN NOT NULL DEFAULT true,
    "dailyMessageLimit" INTEGER NOT NULL DEFAULT 30,
    "contentGenEnabled" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "AICoursePolicy_pkey" PRIMARY KEY ("offeringId")
);

-- CreateTable
CREATE TABLE "AIUsageRecord" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "feature" "AIFeature" NOT NULL,
    "model" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL,
    "outputTokens" INTEGER NOT NULL,
    "estimatedCostUsd" DECIMAL(10,6) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AIUsageRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIStudySession" (
    "id" UUID NOT NULL,
    "studentId" UUID NOT NULL,
    "offeringId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'HINT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AIStudySession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIStudyMessage" (
    "id" UUID NOT NULL,
    "sessionId" UUID NOT NULL,
    "role" "ChatRole" NOT NULL,
    "content" TEXT NOT NULL,
    "mode" TEXT,
    "modelMetadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AIStudyMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIStudyAttachment" (
    "id" UUID NOT NULL,
    "sessionId" UUID NOT NULL,
    "messageId" UUID,
    "fileAssetId" UUID NOT NULL,

    CONSTRAINT "AIStudyAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIStudyFeedback" (
    "messageId" UUID NOT NULL,
    "rating" TEXT NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AIStudyFeedback_pkey" PRIMARY KEY ("messageId")
);

-- CreateTable
CREATE TABLE "AIContentJob" (
    "id" UUID NOT NULL,
    "facultyId" UUID NOT NULL,
    "offeringId" UUID NOT NULL,
    "lessonId" UUID,
    "type" TEXT NOT NULL,
    "status" "AIJobStatus" NOT NULL DEFAULT 'QUEUED',
    "settings" JSONB NOT NULL DEFAULT '{}',
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AIContentJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIContentSource" (
    "id" UUID NOT NULL,
    "jobId" UUID NOT NULL,
    "fileAssetId" UUID,
    "metadata" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "AIContentSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIContentDraft" (
    "id" UUID NOT NULL,
    "jobId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "structuredContent" JSONB NOT NULL,
    "reviewStatus" "DraftReviewStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AIContentDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIContentApproval" (
    "id" UUID NOT NULL,
    "draftId" UUID NOT NULL,
    "reviewerId" UUID NOT NULL,
    "decision" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AIContentApproval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LearningEvent" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "offeringId" UUID NOT NULL,
    "resourceType" TEXT NOT NULL,
    "resourceId" TEXT,
    "type" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LearningEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InsightRecommendation" (
    "id" UUID NOT NULL,
    "offeringId" UUID NOT NULL,
    "topicId" UUID,
    "title" TEXT NOT NULL,
    "evidence" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InsightRecommendation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RevisionPolicy" (
    "offeringId" UUID NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "questionsPerDay" INTEGER NOT NULL DEFAULT 5,
    "topicWindowDays" INTEGER NOT NULL DEFAULT 30,
    "showExplanations" TEXT NOT NULL DEFAULT 'AFTER_EACH',
    "difficultyConfig" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "RevisionPolicy_pkey" PRIMARY KEY ("offeringId")
);

-- CreateTable
CREATE TABLE "RevisionQuiz" (
    "id" UUID NOT NULL,
    "studentId" UUID NOT NULL,
    "offeringId" UUID NOT NULL,
    "scheduledLocalDate" TEXT NOT NULL,
    "status" "RevisionStatus" NOT NULL DEFAULT 'READY',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RevisionQuiz_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RevisionQuizQuestion" (
    "revisionQuizId" UUID NOT NULL,
    "questionVersionId" UUID NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "RevisionQuizQuestion_pkey" PRIMARY KEY ("revisionQuizId","questionVersionId")
);

-- CreateTable
CREATE TABLE "RevisionAttempt" (
    "id" UUID NOT NULL,
    "revisionQuizId" UUID NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submittedAt" TIMESTAMP(3),
    "score" INTEGER,
    "maxScore" INTEGER,

    CONSTRAINT "RevisionAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RevisionAnswer" (
    "attemptId" UUID NOT NULL,
    "questionVersionId" UUID NOT NULL,
    "selectedAnswer" JSONB NOT NULL,
    "correct" BOOLEAN NOT NULL,

    CONSTRAINT "RevisionAnswer_pkey" PRIMARY KEY ("attemptId","questionVersionId")
);

-- CreateTable
CREATE TABLE "RevisionStreak" (
    "studentId" UUID NOT NULL,
    "lastCompletedDate" TEXT,
    "currentStreak" INTEGER NOT NULL DEFAULT 0,
    "longestStreak" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "RevisionStreak_pkey" PRIMARY KEY ("studentId")
);

-- CreateTable
CREATE TABLE "ParentStudentLink" (
    "id" UUID NOT NULL,
    "parentId" UUID NOT NULL,
    "studentId" UUID NOT NULL,
    "relationship" TEXT NOT NULL DEFAULT 'Guardian',
    "status" "LinkStatus" NOT NULL DEFAULT 'PENDING',
    "verifiedAt" TIMESTAMP(3),
    "verifiedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ParentStudentLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ParentAccessConsent" (
    "id" UUID NOT NULL,
    "linkId" UUID NOT NULL,
    "scope" TEXT[],
    "grantedById" UUID NOT NULL,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "ParentAccessConsent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ParentNotificationPreference" (
    "parentId" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ParentNotificationPreference_pkey" PRIMARY KEY ("parentId","type")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "UserRole_role_idx" ON "UserRole"("role");

-- CreateIndex
CREATE UNIQUE INDEX "RefreshSession_tokenHash_key" ON "RefreshSession"("tokenHash");

-- CreateIndex
CREATE INDEX "RefreshSession_userId_idx" ON "RefreshSession"("userId");

-- CreateIndex
CREATE INDEX "RefreshSession_familyId_idx" ON "RefreshSession"("familyId");

-- CreateIndex
CREATE UNIQUE INDEX "PasswordResetToken_tokenHash_key" ON "PasswordResetToken"("tokenHash");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_actorId_idx" ON "AuditLog"("actorId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Department_code_key" ON "Department"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Program_code_key" ON "Program"("code");

-- CreateIndex
CREATE UNIQUE INDEX "AcademicYear_label_key" ON "AcademicYear"("label");

-- CreateIndex
CREATE UNIQUE INDEX "Semester_academicYearId_name_key" ON "Semester"("academicYearId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Batch_programId_name_key" ON "Batch"("programId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Section_batchId_name_key" ON "Section"("batchId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Course_code_key" ON "Course"("code");

-- CreateIndex
CREATE INDEX "CourseOffering_semesterId_idx" ON "CourseOffering"("semesterId");

-- CreateIndex
CREATE UNIQUE INDEX "CourseOffering_courseId_semesterId_sectionId_key" ON "CourseOffering"("courseId", "semesterId", "sectionId");

-- CreateIndex
CREATE INDEX "InstructorAssignment_offeringId_idx" ON "InstructorAssignment"("offeringId");

-- CreateIndex
CREATE INDEX "Enrollment_offeringId_idx" ON "Enrollment"("offeringId");

-- CreateIndex
CREATE UNIQUE INDEX "Enrollment_studentId_offeringId_key" ON "Enrollment"("studentId", "offeringId");

-- CreateIndex
CREATE INDEX "CourseModule_offeringId_idx" ON "CourseModule"("offeringId");

-- CreateIndex
CREATE INDEX "Lesson_offeringId_status_idx" ON "Lesson"("offeringId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "FileAsset_storageKey_key" ON "FileAsset"("storageKey");

-- CreateIndex
CREATE INDEX "LessonResource_lessonId_idx" ON "LessonResource"("lessonId");

-- CreateIndex
CREATE INDEX "LessonProgress_studentId_idx" ON "LessonProgress"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "Topic_offeringId_name_key" ON "Topic"("offeringId", "name");

-- CreateIndex
CREATE INDEX "Assignment_offeringId_status_idx" ON "Assignment"("offeringId", "status");

-- CreateIndex
CREATE INDEX "Submission_studentId_idx" ON "Submission"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "Submission_assignmentId_studentId_attemptNo_key" ON "Submission"("assignmentId", "studentId", "attemptNo");

-- CreateIndex
CREATE INDEX "Question_offeringId_status_idx" ON "Question"("offeringId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "QuestionVersion_questionId_version_key" ON "QuestionVersion"("questionId", "version");

-- CreateIndex
CREATE INDEX "Quiz_offeringId_status_idx" ON "Quiz"("offeringId", "status");

-- CreateIndex
CREATE INDEX "QuizAttempt_studentId_idx" ON "QuizAttempt"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "QuizAttempt_quizId_studentId_attemptNo_key" ON "QuizAttempt"("quizId", "studentId", "attemptNo");

-- CreateIndex
CREATE INDEX "ClassSession_offeringId_startsAt_idx" ON "ClassSession"("offeringId", "startsAt");

-- CreateIndex
CREATE INDEX "Announcement_offeringId_createdAt_idx" ON "Announcement"("offeringId", "createdAt");

-- CreateIndex
CREATE INDEX "DiscussionThread_offeringId_createdAt_idx" ON "DiscussionThread"("offeringId", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_userId_readAt_idx" ON "Notification"("userId", "readAt");

-- CreateIndex
CREATE UNIQUE INDEX "Certificate_verificationCode_key" ON "Certificate"("verificationCode");

-- CreateIndex
CREATE UNIQUE INDEX "Certificate_offeringId_studentId_key" ON "Certificate"("offeringId", "studentId");

-- CreateIndex
CREATE INDEX "Doubt_offeringId_status_idx" ON "Doubt"("offeringId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "DoubtReport_doubtId_reporterId_key" ON "DoubtReport"("doubtId", "reporterId");

-- CreateIndex
CREATE INDEX "AIUsageRecord_userId_feature_createdAt_idx" ON "AIUsageRecord"("userId", "feature", "createdAt");

-- CreateIndex
CREATE INDEX "AIStudySession_studentId_updatedAt_idx" ON "AIStudySession"("studentId", "updatedAt");

-- CreateIndex
CREATE INDEX "AIStudyMessage_sessionId_createdAt_idx" ON "AIStudyMessage"("sessionId", "createdAt");

-- CreateIndex
CREATE INDEX "AIContentJob_offeringId_createdAt_idx" ON "AIContentJob"("offeringId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AIContentDraft_jobId_version_key" ON "AIContentDraft"("jobId", "version");

-- CreateIndex
CREATE INDEX "LearningEvent_offeringId_occurredAt_idx" ON "LearningEvent"("offeringId", "occurredAt");

-- CreateIndex
CREATE INDEX "LearningEvent_userId_occurredAt_idx" ON "LearningEvent"("userId", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "RevisionQuiz_studentId_offeringId_scheduledLocalDate_key" ON "RevisionQuiz"("studentId", "offeringId", "scheduledLocalDate");

-- CreateIndex
CREATE INDEX "ParentStudentLink_studentId_idx" ON "ParentStudentLink"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "ParentStudentLink_parentId_studentId_key" ON "ParentStudentLink"("parentId", "studentId");

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefreshSession" ADD CONSTRAINT "RefreshSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Program" ADD CONSTRAINT "Program_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Semester" ADD CONSTRAINT "Semester_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "AcademicYear"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Batch" ADD CONSTRAINT "Batch_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Section" ADD CONSTRAINT "Section_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "Batch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Course" ADD CONSTRAINT "Course_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseOffering" ADD CONSTRAINT "CourseOffering_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseOffering" ADD CONSTRAINT "CourseOffering_semesterId_fkey" FOREIGN KEY ("semesterId") REFERENCES "Semester"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseOffering" ADD CONSTRAINT "CourseOffering_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "Section"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstructorAssignment" ADD CONSTRAINT "InstructorAssignment_offeringId_fkey" FOREIGN KEY ("offeringId") REFERENCES "CourseOffering"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstructorAssignment" ADD CONSTRAINT "InstructorAssignment_facultyId_fkey" FOREIGN KEY ("facultyId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_offeringId_fkey" FOREIGN KEY ("offeringId") REFERENCES "CourseOffering"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseModule" ADD CONSTRAINT "CourseModule_offeringId_fkey" FOREIGN KEY ("offeringId") REFERENCES "CourseOffering"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lesson" ADD CONSTRAINT "Lesson_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "CourseModule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lesson" ADD CONSTRAINT "Lesson_offeringId_fkey" FOREIGN KEY ("offeringId") REFERENCES "CourseOffering"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FileAsset" ADD CONSTRAINT "FileAsset_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LessonResource" ADD CONSTRAINT "LessonResource_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LessonResource" ADD CONSTRAINT "LessonResource_fileAssetId_fkey" FOREIGN KEY ("fileAssetId") REFERENCES "FileAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LessonProgress" ADD CONSTRAINT "LessonProgress_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LessonProgress" ADD CONSTRAINT "LessonProgress_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Topic" ADD CONSTRAINT "Topic_offeringId_fkey" FOREIGN KEY ("offeringId") REFERENCES "CourseOffering"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LessonTopic" ADD CONSTRAINT "LessonTopic_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LessonTopic" ADD CONSTRAINT "LessonTopic_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_offeringId_fkey" FOREIGN KEY ("offeringId") REFERENCES "CourseOffering"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Submission" ADD CONSTRAINT "Submission_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "Assignment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Submission" ADD CONSTRAINT "Submission_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Submission" ADD CONSTRAINT "Submission_gradedById_fkey" FOREIGN KEY ("gradedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubmissionFile" ADD CONSTRAINT "SubmissionFile_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "Submission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubmissionFile" ADD CONSTRAINT "SubmissionFile_fileAssetId_fkey" FOREIGN KEY ("fileAssetId") REFERENCES "FileAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Question" ADD CONSTRAINT "Question_offeringId_fkey" FOREIGN KEY ("offeringId") REFERENCES "CourseOffering"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Question" ADD CONSTRAINT "Question_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Question" ADD CONSTRAINT "Question_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionVersion" ADD CONSTRAINT "QuestionVersion_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quiz" ADD CONSTRAINT "Quiz_offeringId_fkey" FOREIGN KEY ("offeringId") REFERENCES "CourseOffering"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuizQuestion" ADD CONSTRAINT "QuizQuestion_quizId_fkey" FOREIGN KEY ("quizId") REFERENCES "Quiz"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuizQuestion" ADD CONSTRAINT "QuizQuestion_questionVersionId_fkey" FOREIGN KEY ("questionVersionId") REFERENCES "QuestionVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuizAttempt" ADD CONSTRAINT "QuizAttempt_quizId_fkey" FOREIGN KEY ("quizId") REFERENCES "Quiz"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuizAttempt" ADD CONSTRAINT "QuizAttempt_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttemptAnswer" ADD CONSTRAINT "AttemptAnswer_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "QuizAttempt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttemptAnswer" ADD CONSTRAINT "AttemptAnswer_questionVersionId_fkey" FOREIGN KEY ("questionVersionId") REFERENCES "QuestionVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassSession" ADD CONSTRAINT "ClassSession_offeringId_fkey" FOREIGN KEY ("offeringId") REFERENCES "CourseOffering"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceRecord" ADD CONSTRAINT "AttendanceRecord_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ClassSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceRecord" ADD CONSTRAINT "AttendanceRecord_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Announcement" ADD CONSTRAINT "Announcement_offeringId_fkey" FOREIGN KEY ("offeringId") REFERENCES "CourseOffering"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Announcement" ADD CONSTRAINT "Announcement_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscussionThread" ADD CONSTRAINT "DiscussionThread_offeringId_fkey" FOREIGN KEY ("offeringId") REFERENCES "CourseOffering"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscussionThread" ADD CONSTRAINT "DiscussionThread_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscussionPost" ADD CONSTRAINT "DiscussionPost_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "DiscussionThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscussionPost" ADD CONSTRAINT "DiscussionPost_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Certificate" ADD CONSTRAINT "Certificate_offeringId_fkey" FOREIGN KEY ("offeringId") REFERENCES "CourseOffering"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Certificate" ADD CONSTRAINT "Certificate_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Doubt" ADD CONSTRAINT "Doubt_offeringId_fkey" FOREIGN KEY ("offeringId") REFERENCES "CourseOffering"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Doubt" ADD CONSTRAINT "Doubt_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Doubt" ADD CONSTRAINT "Doubt_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Doubt" ADD CONSTRAINT "Doubt_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DoubtVote" ADD CONSTRAINT "DoubtVote_doubtId_fkey" FOREIGN KEY ("doubtId") REFERENCES "Doubt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DoubtVote" ADD CONSTRAINT "DoubtVote_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DoubtReply" ADD CONSTRAINT "DoubtReply_doubtId_fkey" FOREIGN KEY ("doubtId") REFERENCES "Doubt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DoubtReply" ADD CONSTRAINT "DoubtReply_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DoubtReport" ADD CONSTRAINT "DoubtReport_doubtId_fkey" FOREIGN KEY ("doubtId") REFERENCES "Doubt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DoubtReport" ADD CONSTRAINT "DoubtReport_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DoubtModerationLog" ADD CONSTRAINT "DoubtModerationLog_doubtId_fkey" FOREIGN KEY ("doubtId") REFERENCES "Doubt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DoubtModerationLog" ADD CONSTRAINT "DoubtModerationLog_moderatorId_fkey" FOREIGN KEY ("moderatorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AICoursePolicy" ADD CONSTRAINT "AICoursePolicy_offeringId_fkey" FOREIGN KEY ("offeringId") REFERENCES "CourseOffering"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIUsageRecord" ADD CONSTRAINT "AIUsageRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIStudySession" ADD CONSTRAINT "AIStudySession_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIStudySession" ADD CONSTRAINT "AIStudySession_offeringId_fkey" FOREIGN KEY ("offeringId") REFERENCES "CourseOffering"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIStudyMessage" ADD CONSTRAINT "AIStudyMessage_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "AIStudySession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIStudyAttachment" ADD CONSTRAINT "AIStudyAttachment_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "AIStudySession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIStudyAttachment" ADD CONSTRAINT "AIStudyAttachment_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "AIStudyMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIStudyAttachment" ADD CONSTRAINT "AIStudyAttachment_fileAssetId_fkey" FOREIGN KEY ("fileAssetId") REFERENCES "FileAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIStudyFeedback" ADD CONSTRAINT "AIStudyFeedback_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "AIStudyMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIContentJob" ADD CONSTRAINT "AIContentJob_facultyId_fkey" FOREIGN KEY ("facultyId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIContentJob" ADD CONSTRAINT "AIContentJob_offeringId_fkey" FOREIGN KEY ("offeringId") REFERENCES "CourseOffering"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIContentJob" ADD CONSTRAINT "AIContentJob_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIContentSource" ADD CONSTRAINT "AIContentSource_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "AIContentJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIContentSource" ADD CONSTRAINT "AIContentSource_fileAssetId_fkey" FOREIGN KEY ("fileAssetId") REFERENCES "FileAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIContentDraft" ADD CONSTRAINT "AIContentDraft_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "AIContentJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIContentApproval" ADD CONSTRAINT "AIContentApproval_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "AIContentDraft"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearningEvent" ADD CONSTRAINT "LearningEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearningEvent" ADD CONSTRAINT "LearningEvent_offeringId_fkey" FOREIGN KEY ("offeringId") REFERENCES "CourseOffering"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InsightRecommendation" ADD CONSTRAINT "InsightRecommendation_offeringId_fkey" FOREIGN KEY ("offeringId") REFERENCES "CourseOffering"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InsightRecommendation" ADD CONSTRAINT "InsightRecommendation_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RevisionPolicy" ADD CONSTRAINT "RevisionPolicy_offeringId_fkey" FOREIGN KEY ("offeringId") REFERENCES "CourseOffering"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RevisionQuiz" ADD CONSTRAINT "RevisionQuiz_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RevisionQuiz" ADD CONSTRAINT "RevisionQuiz_offeringId_fkey" FOREIGN KEY ("offeringId") REFERENCES "CourseOffering"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RevisionQuizQuestion" ADD CONSTRAINT "RevisionQuizQuestion_revisionQuizId_fkey" FOREIGN KEY ("revisionQuizId") REFERENCES "RevisionQuiz"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RevisionQuizQuestion" ADD CONSTRAINT "RevisionQuizQuestion_questionVersionId_fkey" FOREIGN KEY ("questionVersionId") REFERENCES "QuestionVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RevisionAttempt" ADD CONSTRAINT "RevisionAttempt_revisionQuizId_fkey" FOREIGN KEY ("revisionQuizId") REFERENCES "RevisionQuiz"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RevisionAnswer" ADD CONSTRAINT "RevisionAnswer_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "RevisionAttempt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RevisionAnswer" ADD CONSTRAINT "RevisionAnswer_questionVersionId_fkey" FOREIGN KEY ("questionVersionId") REFERENCES "QuestionVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RevisionStreak" ADD CONSTRAINT "RevisionStreak_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParentStudentLink" ADD CONSTRAINT "ParentStudentLink_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParentStudentLink" ADD CONSTRAINT "ParentStudentLink_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParentAccessConsent" ADD CONSTRAINT "ParentAccessConsent_linkId_fkey" FOREIGN KEY ("linkId") REFERENCES "ParentStudentLink"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParentNotificationPreference" ADD CONSTRAINT "ParentNotificationPreference_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
