import { Link } from 'react-router-dom';
import { BookOpen, CalendarDays, Users } from 'lucide-react';
import { PALETTE } from '../../components/charts';
import { useGet } from '../../lib/hooks';
import { useAuth } from '../../lib/auth';
import { EmptyState, PageHeader, QueryView, StatusBadge } from '../../components/ui';

export default function MyCourses() {
  const { role } = useAuth();
  const q = useGet<any[]>('/offerings');
  return (
    <>
      <PageHeader title="My courses" subtitle={role === 'FACULTY' ? 'Course offerings you are assigned to teach.' : 'Courses you are enrolled in this semester.'} />
      <QueryView q={q} empty={<EmptyState icon={<BookOpen className="size-6" />} title="No courses yet" body={role === 'FACULTY' ? 'Your college admin will assign you to course offerings.' : 'Your college admin will enroll you in courses.'} />}>
        {(rows) => (
          <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {rows.map((o, n) => {
              const c = PALETTE[n % PALETTE.length];
              return (
                <li key={o.id}>
                  <Link to={`/offerings/${o.id}`} className="group flex h-full flex-col overflow-hidden rounded-2xl border border-line/80 bg-white shadow-[0_1px_3px_rgba(16,27,58,0.05)] transition hover:-translate-y-1 hover:shadow-lg">
                    <div className="relative h-24 overflow-hidden p-5" style={{ background: `linear-gradient(135deg, ${c}, color-mix(in srgb, ${c} 55%, #101b3a))` }}>
                      <div className="absolute -right-6 -top-8 size-28 rounded-full bg-white/15" aria-hidden />
                      <div className="absolute -bottom-10 right-10 size-20 rounded-full bg-white/10" aria-hidden />
                      <div className="relative flex items-start justify-between gap-2">
                        <span className="rounded-lg bg-white/20 px-2.5 py-1 text-xs font-bold text-white backdrop-blur">{o.course.code}</span>
                        {role === 'FACULTY' && <span className="rounded-full bg-white px-0.5"><StatusBadge status={o.status} /></span>}
                      </div>
                    </div>
                    <div className="flex flex-1 flex-col p-5">
                      <h2 className="text-lg font-semibold text-navy group-hover:text-primary">{o.course.title}</h2>
                      <p className="mt-1 line-clamp-2 flex-1 text-sm text-muted">{o.course.description ?? ''}</p>
                      <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5 border-t border-line/70 pt-3 text-xs text-muted">
                        <span className="inline-flex items-center gap-1"><CalendarDays className="size-3.5" aria-hidden />{o.semester.name} · {o.semester.academicYear.label}{o.section ? ` · ${o.section.batch.program.code} ${o.section.name}` : ''}</span>
                        <span className="inline-flex items-center gap-1"><Users className="size-3.5" aria-hidden />{o._count.enrollments} students</span>
                      </div>
                      <div className="mt-3 flex items-center gap-2">
                        <span className="flex -space-x-2" aria-hidden>{o.instructors.slice(0, 3).map((i: any) => <span key={i.faculty.id ?? i.faculty.firstName} className="grid size-7 place-items-center rounded-full text-[10px] font-semibold text-white ring-2 ring-white" style={{ background: c }}>{i.faculty.firstName[0]}{i.faculty.lastName[0]}</span>)}</span>
                        <span className="truncate text-xs text-muted">{o.instructors.map((i: any) => `${i.faculty.firstName} ${i.faculty.lastName}`).join(', ') || 'No instructor yet'}</span>
                      </div>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </QueryView>
    </>
  );
}
