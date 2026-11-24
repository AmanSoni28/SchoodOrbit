import { Router } from 'express';
import { authenticate } from './middleware/auth';
import auth from './modules/auth/auth.routes';
import settings, { publicSettings } from './modules/settings/settings.routes';
import users from './modules/users/users.routes';
import academics from './modules/academics/academics.routes';
import courses from './modules/courses/courses.routes';
import content from './modules/content/content.routes';
import files from './modules/files/files.routes';
import assignments from './modules/assignments/assignments.routes';
import quizzes from './modules/quizzes/quizzes.routes';
import gradebook from './modules/gradebook/gradebook.routes';
import attendance from './modules/attendance/attendance.routes';
import communication, { verifyCertificate } from './modules/communication/communication.routes';
import doubts from './modules/doubts/doubts.routes';
import revision from './modules/revision/revision.routes';
import aiHomework from './modules/ai-homework/ai-homework.routes';
import aiContent from './modules/ai-content/ai-content.routes';
import analytics from './modules/analytics/analytics.routes';
import parent from './modules/parent/parent.routes';
import dashboard from './modules/dashboard/dashboard.routes';
import fees from './modules/fees/fees.routes';
import results from './modules/results/results.routes';
import learningPath from './modules/learning-path/learning-path.routes';
import leave from './modules/leave/leave.routes';
import timetable from './modules/timetable/timetable.routes';
import calendar from './modules/calendar/calendar.routes';
import messages from './modules/messages/messages.routes';
import performance from './modules/performance/performance.routes';

const routes = Router();

// ── Public ──
routes.get('/health', (_req, res) => res.json({ data: { status: 'ok' } }));
routes.get('/settings/public', publicSettings);
routes.get('/certificates/verify/:code', verifyCertificate);
routes.use('/auth', auth); // manages its own authentication for /me, /mfa, …

// ── Everything below requires a valid session ──
// Routers declare full paths; any role/feature middleware inside them is scoped to their own paths.
routes.use(authenticate);
for (const r of [settings, users, academics, courses, content, files, assignments, quizzes, gradebook, attendance, communication, doubts, revision, aiHomework, aiContent, analytics, parent, dashboard, fees, results, learningPath, leave, timetable, calendar, messages, performance]) {
  routes.use(r);
}

export default routes;
