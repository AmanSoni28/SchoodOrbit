import { lazy, Suspense, type ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth, type Role } from './lib/auth';
import { AppShell } from './components/AppShell';
import { LoadingBlock, EmptyState, Button } from './components/ui';
import Login from './pages/auth/Login';
import { ForgotPassword, ResetPassword } from './pages/auth/Password';
import VerifyCertificate from './pages/auth/VerifyCertificate';
import Dashboard from './pages/Dashboard';

const MyCourses = lazy(() => import('./pages/courses/MyCourses'));
const OfferingPage = lazy(() => import('./pages/courses/OfferingPage'));
const LessonPage = lazy(() => import('./pages/learning/LessonPage'));
const AssignmentPage = lazy(() => import('./pages/learning/AssignmentPage'));
const QuizPage = lazy(() => import('./pages/learning/QuizPage'));
const AttemptPage = lazy(() => import('./pages/learning/AttemptPage'));
const DoubtPage = lazy(() => import('./pages/learning/DoubtPage'));
const ThreadPage = lazy(() => import('./pages/learning/ThreadPage'));
const Revision = lazy(() => import('./pages/student/Revision'));
const RevisionQuiz = lazy(() => import('./pages/student/RevisionQuiz'));
const AIHelper = lazy(() => import('./pages/student/AIHelper'));
const Certificates = lazy(() => import('./pages/student/Certificates'));
const Privacy = lazy(() => import('./pages/student/Privacy'));
const AIJobPage = lazy(() => import('./pages/faculty/AIJobPage'));
const Notifications = lazy(() => import('./pages/common/Notifications'));
const Announcements = lazy(() => import('./pages/common/Announcements'));
const Account = lazy(() => import('./pages/common/Account'));
const Users = lazy(() => import('./pages/admin/Users'));
const Academics = lazy(() => import('./pages/admin/Academics'));
const Courses = lazy(() => import('./pages/admin/Courses'));
const Offerings = lazy(() => import('./pages/admin/Offerings'));
const ParentLinks = lazy(() => import('./pages/admin/ParentLinks'));
const Reports = lazy(() => import('./pages/admin/Reports'));
const Audit = lazy(() => import('./pages/admin/Audit'));
const Settings = lazy(() => import('./pages/admin/Settings'));
const ParentSettings = lazy(() => import('./pages/parent/ParentSettings'));
const Fees = lazy(() => import('./pages/admin/Fees'));
const ResultsAdmin = lazy(() => import('./pages/admin/Results'));
const StudentFees = lazy(() => import('./pages/student/Fees'));
const StudentResults = lazy(() => import('./pages/student/Results'));

function RequireAuth({ children }: { children: ReactNode }) {
  const { me, loading } = useAuth();
  const loc = useLocation();
  if (loading) return <div className="p-10"><LoadingBlock /></div>;
  if (!me) return <Navigate to="/login" replace state={{ from: loc.pathname }} />;
  return <>{children}</>;
}

// UX guard only — the API enforces every permission server-side.
function RoleGate({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { role } = useAuth();
  if (!role || !roles.includes(role)) return <Forbidden />;
  return <>{children}</>;
}

function Forbidden() {
  return <EmptyState title="You don't have access to this page" body="Switch workspace from the menu if you have another role, or contact your administrator." action={<Button onClick={() => history.back()} variant="secondary">Go back</Button>} />;
}
function NotFound() {
  return <EmptyState title="Page not found" body="The page you are looking for does not exist or has moved." action={<a href="/" className="text-sm font-medium text-primary">Go to dashboard</a>} />;
}

const ADMIN: Role[] = ['COLLEGE_ADMIN'];
const ANY_ADMIN: Role[] = ['COLLEGE_ADMIN', 'SUPER_ADMIN'];

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/verify/:code" element={<VerifyCertificate />} />
      <Route element={<RequireAuth><AppShell /></RequireAuth>}>
        <Route index element={<Dashboard />} />
        <Route path="*" element={<Suspense fallback={<LoadingBlock rows={4} />}><Inner /></Suspense>} />
      </Route>
    </Routes>
  );
}

function Inner() {
  return (
    <Routes>
      <Route path="courses" element={<RoleGate roles={['FACULTY', 'STUDENT']}><MyCourses /></RoleGate>} />
      <Route path="offerings/:id" element={<OfferingPage />} />
      <Route path="lessons/:id" element={<LessonPage />} />
      <Route path="assignments/:id" element={<AssignmentPage />} />
      <Route path="quizzes/:id" element={<QuizPage />} />
      <Route path="attempts/:id" element={<AttemptPage />} />
      <Route path="doubts/:id" element={<DoubtPage />} />
      <Route path="threads/:id" element={<ThreadPage />} />
      <Route path="revision" element={<RoleGate roles={['STUDENT']}><Revision /></RoleGate>} />
      <Route path="revision/:id" element={<RoleGate roles={['STUDENT']}><RevisionQuiz /></RoleGate>} />
      <Route path="ai-helper" element={<RoleGate roles={['STUDENT']}><AIHelper /></RoleGate>} />
      <Route path="ai-helper/:id" element={<RoleGate roles={['STUDENT']}><AIHelper /></RoleGate>} />
      <Route path="certificates" element={<RoleGate roles={['STUDENT']}><Certificates /></RoleGate>} />
      <Route path="privacy" element={<RoleGate roles={['STUDENT']}><Privacy /></RoleGate>} />
      <Route path="ai-content/jobs/:id" element={<RoleGate roles={['FACULTY']}><AIJobPage /></RoleGate>} />
      <Route path="notifications" element={<Notifications />} />
      <Route path="announcements" element={<Announcements />} />
      <Route path="account" element={<Account />} />
      <Route path="admin/users" element={<RoleGate roles={ANY_ADMIN}><Users /></RoleGate>} />
      <Route path="admin/academics" element={<RoleGate roles={ADMIN}><Academics /></RoleGate>} />
      <Route path="admin/courses" element={<RoleGate roles={ADMIN}><Courses /></RoleGate>} />
      <Route path="admin/offerings" element={<RoleGate roles={ADMIN}><Offerings /></RoleGate>} />
      <Route path="admin/parent-links" element={<RoleGate roles={ADMIN}><ParentLinks /></RoleGate>} />
      <Route path="admin/reports" element={<RoleGate roles={ADMIN}><Reports /></RoleGate>} />
      <Route path="admin/audit" element={<RoleGate roles={ANY_ADMIN}><Audit /></RoleGate>} />
      <Route path="admin/fees" element={<RoleGate roles={ADMIN}><Fees /></RoleGate>} />
      <Route path="admin/results" element={<RoleGate roles={ADMIN}><ResultsAdmin /></RoleGate>} />
      <Route path="fees" element={<RoleGate roles={['STUDENT']}><StudentFees /></RoleGate>} />
      <Route path="results" element={<RoleGate roles={['STUDENT']}><StudentResults /></RoleGate>} />
      <Route path="admin/settings" element={<RoleGate roles={['SUPER_ADMIN']}><Settings /></RoleGate>} />
      <Route path="parent/settings" element={<RoleGate roles={['PARENT']}><ParentSettings /></RoleGate>} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
