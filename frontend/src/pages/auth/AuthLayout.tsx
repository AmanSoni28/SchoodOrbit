import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, Brain, CalendarDays, MessageSquare, Sparkles, type LucideIcon } from 'lucide-react';
import { useBranding } from '../../lib/branding';

const FEATURES: { icon: LucideIcon; title: string; body: string }[] = [
  { icon: BookOpen, title: 'Courses & quizzes', body: 'Lessons, assignments and grades in one place' },
  { icon: Sparkles, title: 'Guided AI help', body: 'Study support with faculty oversight' },
  { icon: CalendarDays, title: 'Timetable & calendar', body: 'Classes, exams and holidays at a glance' },
  { icon: MessageSquare, title: 'Direct messages', body: 'Students, parents and faculty, connected' },
];

/** Shared by sign-in, password reset and certificate verification. */
export function AuthLayout({ title, subtitle, badge, children }: { title: string; subtitle?: string; badge?: ReactNode; children: ReactNode }) {
  const b = useBranding();
  const logo = (size: string) => b.logoUrl
    ? <img src={b.logoUrl} alt="" className={`${size} shrink-0 rounded-xl bg-white object-contain p-1`} />
    : <span className={`${size} grid shrink-0 place-items-center rounded-xl bg-gradient-to-br from-accent to-primary text-white shadow-lg shadow-accent/20`}><Brain className="size-1/2" aria-hidden /></span>;

  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      {/* ── Brand panel (large screens) ── */}
      <aside className="relative hidden overflow-hidden bg-gradient-to-br from-navy via-navy-2 to-[#2a3f9e] px-12 py-10 text-white lg:flex lg:flex-col xl:px-16">
        <div className="absolute -right-24 -top-24 size-[28rem] rounded-full bg-accent/25 blur-3xl" aria-hidden />
        <div className="absolute -bottom-40 -left-10 size-[26rem] rounded-full bg-primary/40 blur-3xl" aria-hidden />
        <div className="absolute inset-0 opacity-[.07] [background-image:radial-gradient(white_1px,transparent_1px)] [background-size:22px_22px]" aria-hidden />

        <Link to="/" className="relative flex w-fit items-center gap-3">
          {logo('size-11')}
          <span><span className="block text-lg font-semibold leading-tight">{b.name}</span><span className="block text-sm text-white/60">Learning Management System</span></span>
        </Link>

        <div className="relative my-auto max-w-xl py-12">
          <div className="mb-6 h-1.5 w-16 rounded-full bg-accent" />
          <h2 className="text-4xl font-bold leading-[1.15] tracking-tight xl:text-5xl">
            Learn, teach and track progress — <span className="bg-gradient-to-r from-accent to-[#8fb3ff] bg-clip-text text-transparent">in one calm place.</span>
          </h2>
          <p className="mt-5 max-w-md text-base text-white/65">Everything students, faculty, parents and the college office need — organised around your courses.</p>
          <ul className="mt-10 grid gap-3 sm:grid-cols-2">
            {FEATURES.map(({ icon: Icon, title, body }) => (
              <li key={title} className="rounded-2xl bg-white/[.06] p-4 ring-1 ring-white/10 backdrop-blur transition hover:bg-white/[.09]">
                <span className="grid size-9 place-items-center rounded-lg bg-accent/15 text-accent"><Icon className="size-[18px]" aria-hidden /></span>
                <span className="mt-3 block text-sm font-semibold">{title}</span>
                <span className="mt-0.5 block text-[13px] leading-snug text-white/55">{body}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="relative flex items-center justify-between gap-4 border-t border-white/10 pt-6 text-xs text-white/45">
          <span className="flex items-center gap-2">Powered by <img src="/classorbit-logo-dark.png" alt="ClassOrbit" width={438} height={138} className="h-6 w-auto opacity-90" /></span>
          {b.supportEmail && <a href={`mailto:${b.supportEmail}`} className="hover:text-white">Need help? {b.supportEmail}</a>}
        </div>
      </aside>

      {/* ── Form panel ── */}
      <div className="relative flex flex-col bg-cloud">
        <div className="absolute inset-0 opacity-[.35] [background-image:radial-gradient(rgba(16,27,58,0.12)_1px,transparent_1px)] [background-size:24px_24px] [mask-image:radial-gradient(ellipse_at_center,black,transparent_70%)]" aria-hidden />
        {/* Brand header for small screens, where the panel is hidden. */}
        <Link to="/" className="relative flex items-center gap-3 px-6 pt-6 lg:hidden">
          {logo('size-10')}
          <span className="font-semibold text-navy">{b.name}</span>
        </Link>
        <div className="relative flex flex-1 items-center justify-center px-5 py-10 sm:px-10">
          <main className="w-full max-w-[440px] rounded-3xl border border-line/70 bg-white p-7 shadow-[0_24px_70px_-28px_rgba(16,27,58,0.3)] sm:p-10">
            {badge}
            <h1 className="text-[28px] font-bold tracking-tight text-navy">{title}</h1>
            {subtitle && <p className="mt-1.5 text-sm text-muted">{subtitle}</p>}
            <div className="mt-8">{children}</div>
          </main>
        </div>
        <p className="relative pb-6 text-center text-xs text-muted">© {new Date().getFullYear()} {b.name}</p>
      </div>
    </div>
  );
}
