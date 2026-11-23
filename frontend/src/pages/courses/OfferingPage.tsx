import { lazy, Suspense } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ChevronLeft, Video } from 'lucide-react';
import { useGet } from '../../lib/hooks';
import { useBranding, featureOn } from '../../lib/branding';
import { ErrorState, LoadingBlock, StatusBadge, Tabs } from '../../components/ui';

const T = {
  content: lazy(() => import('./tabs/ContentTab')),
  assignments: lazy(() => import('./tabs/AssignmentsTab')),
  quizzes: lazy(() => import('./tabs/QuizzesTab')),
  questions: lazy(() => import('./tabs/QuestionBankTab')),
  grades: lazy(() => import('./tabs/GradesTab')),
  attendance: lazy(() => import('./tabs/AttendanceTab')),
  doubts: lazy(() => import('./tabs/DoubtsTab')),
  discussions: lazy(() => import('./tabs/DiscussionsTab')),
  announcements: lazy(() => import('./tabs/AnnouncementsTab')),
  people: lazy(() => import('./tabs/PeopleTab')),
  insights: lazy(() => import('./tabs/InsightsTab')),
  ai: lazy(() => import('./tabs/AIGeneratorTab')),
  settings: lazy(() => import('./tabs/SettingsTab')),
};
type TabId = keyof typeof T;
export type Access = { isInstructor: boolean; isStudent: boolean; isAdmin: boolean };
export type TabProps = { offeringId: string; access: Access; offering: any };

export default function OfferingPage() {
  const { id } = useParams() as { id: string };
  const [params, setParams] = useSearchParams();
  const b = useBranding();
  const q = useGet<any>(`/offerings/${id}`);
  if (q.isLoading) return <LoadingBlock rows={5} />;
  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const o = q.data;
  const a: Access = o.access;
  const staff = a.isInstructor || a.isAdmin;
  const tabs: { id: TabId; label: string; show: boolean }[] = [
    { id: 'content', label: 'Lessons', show: true },
    { id: 'assignments', label: 'Assignments', show: true },
    { id: 'quizzes', label: 'Quizzes', show: true },
    { id: 'questions', label: 'Question bank', show: staff },
    { id: 'grades', label: staff ? 'Gradebook' : 'My grades', show: true },
    { id: 'attendance', label: 'Attendance', show: true },
    { id: 'doubts', label: 'Doubt board', show: featureOn(b, 'doubtBoard') },
    { id: 'discussions', label: 'Discussions', show: featureOn(b, 'discussions') },
    { id: 'announcements', label: 'Announcements', show: true },
    { id: 'people', label: 'People', show: staff },
    { id: 'insights', label: 'Class insights', show: staff && featureOn(b, 'classInsights') },
    { id: 'ai', label: 'AI generator', show: a.isInstructor && featureOn(b, 'aiContent') },
    { id: 'settings', label: 'Settings', show: staff },
  ];
  const visible = tabs.filter((t) => t.show);
  const tab = (visible.find((t) => t.id === params.get('tab'))?.id ?? 'content') as TabId;
  const Tab = T[tab];
  return (
    <>
      <Link to={a.isAdmin && !a.isInstructor ? '/admin/offerings' : '/courses'} className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-ink"><ChevronLeft className="size-4" aria-hidden />Back</Link>
      <div className="mb-5 rounded-2xl bg-navy p-6 text-white">
        <div className="flex flex-wrap items-center gap-2 text-sm text-white/70">
          <span className="rounded-md bg-white/10 px-2 py-0.5 font-bold text-white">{o.course.code}</span>
          <span>{o.semester.name} · {o.semester.academicYear.label}</span>
          {o.section && <span>· {o.section.batch.program.code} Section {o.section.name}</span>}
          {staff && <StatusBadge status={o.status} />}
        </div>
        <h1 className="mt-2 text-2xl font-bold">{o.course.title}</h1>
        <p className="mt-1 text-sm text-white/70">{o.instructors.map((i: any) => `${i.faculty.firstName} ${i.faculty.lastName}`).join(', ') || 'No instructor assigned'} · {o._count.enrollments} students</p>
        {o.meetingUrl && <a href={o.meetingUrl} target="_blank" rel="noreferrer noopener" className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white"><Video className="size-4" aria-hidden />Live class link</a>}
      </div>
      <Tabs tabs={visible.map((t) => ({ id: t.id, label: t.label }))} value={tab} onChange={(t) => setParams({ tab: t }, { replace: true })} />
      <Suspense fallback={<LoadingBlock />}>
        <Tab offeringId={id} access={a} offering={o} />
      </Suspense>
    </>
  );
}
