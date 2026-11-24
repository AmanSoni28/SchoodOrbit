import { Link } from 'react-router-dom';
import { ArrowRight, BarChart3, BookOpen, CalendarCheck, GraduationCap, HeartHandshake, MessagesSquare, ShieldCheck, Sparkles, Users, type LucideIcon } from 'lucide-react';
import { useBranding } from '../../lib/branding';
import type { Role } from '../../lib/auth';

const PRODUCT = 'ClassOrbit';

const ROLES:{ role: Role; title: string; blurb: string; icon: LucideIcon; tint: string }[] = [
  { role: 'STUDENT', title: 'Student', blurb: 'Lessons, assignments, quizzes, daily revision and AI study help.', icon: GraduationCap, tint: 'from-primary to-[#7a94ff]' },
  { role: 'FACULTY', title: 'Faculty', blurb: 'Build courses, grade work, answer doubts and track attendance.', icon: BookOpen, tint: 'from-accent to-[#5fd6cb]' },
  { role: 'PARENT', title: 'Parent', blurb: "Follow your child's attendance, results and fee status.", icon: HeartHandshake, tint: 'from-gold to-[#f7d08a]' },
  { role: 'COLLEGE_ADMIN', title: 'College Admin', blurb: 'Manage users, offerings, fees, results and reports.', icon: Users, tint: 'from-navy-2 to-[#4a5f9e]' },
  { role: 'SUPER_ADMIN', title: 'Super Admin', blurb: 'Platform settings, branding, security and audit logs.', icon: ShieldCheck, tint: 'from-[#8b5cf6] to-[#c4b5fd]' },
];

const FEATURES: { icon: LucideIcon; title: string; body: string }[] = [
  { icon: BookOpen, title: 'Structured courses', body: 'Lessons, files and assignments organised by offering and term.' },
  { icon: Sparkles, title: 'Guided AI help', body: 'Study support and content drafts with faculty oversight.' },
  { icon: MessagesSquare, title: 'Anonymous doubts', body: 'Students ask freely; faculty answer once for the whole class.' },
  { icon: CalendarCheck, title: 'Attendance & revision', body: 'Daily revision quizzes and streaks keep learning on track.' },
  { icon: BarChart3, title: 'Results & analytics', body: 'Weighted gradebooks, at-risk alerts and clear reports.' },
  { icon: ShieldCheck, title: 'Secure by design', body: 'Role-based access, two-factor sign-in and a full audit trail.' },
];

export default function Landing() {
  const b = useBranding();

  return (
    <div className="min-h-full bg-cloud">
      {/* Hero */}
      <header className="relative overflow-hidden bg-gradient-to-br from-navy via-navy-2 to-[#2a3f9e] text-white">
        <div className="absolute -right-32 -top-32 size-[32rem] rounded-full bg-accent/25 blur-3xl" aria-hidden />
        <div className="absolute -bottom-48 -left-16 size-[30rem] rounded-full bg-primary/40 blur-3xl" aria-hidden />
        <div className="absolute inset-0 opacity-[.07] [background-image:radial-gradient(white_1px,transparent_1px)] [background-size:22px_22px]" aria-hidden />

        <nav className="relative flex w-full items-center justify-between px-6 py-5 sm:px-10 lg:px-16">
          {/* Product brand; the college's own name and logo stay on the sign-in pages. */}
          {/* Dark-background variant (navy parts in white); /classorbit-logo.png is the one for light surfaces. */}
          <a href="/" className="shrink-0">
            <img src="/classorbit-logo-dark.png" alt={PRODUCT} width={438} height={138} className="h-11 w-auto sm:h-12" />
          </a>
          <Link to="/login" className="rounded-xl bg-white/10 px-4 py-2 text-sm font-semibold ring-1 ring-white/20 backdrop-blur transition hover:bg-white/20">Sign in</Link>
        </nav>

        <div className="relative w-full px-6 pb-32 pt-16 sm:px-10 lg:px-16 text-center sm:pt-24">
          <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-white/80 ring-1 ring-white/15"><Sparkles className="size-3.5 text-accent" aria-hidden />Learning Management System</span>
          <h1 className="mx-auto mt-6 max-w-5xl text-4xl font-bold leading-tight tracking-tight sm:text-6xl">
            Learn, teach and track progress — <span className="bg-gradient-to-r from-accent to-[#8fb3ff] bg-clip-text text-transparent">in one calm place.</span>
          </h1>
          <p className="mx-auto mt-6 max-w-3xl text-lg text-white/70">One home for students, faculty, parents and administrators of {b.name}. Choose your role below to sign in.</p>
          <a href="#roles" className="mt-10 inline-flex items-center gap-2 rounded-xl bg-accent px-6 py-3 font-semibold text-white shadow-lg shadow-accent/30 transition hover:brightness-110">Get started <ArrowRight className="size-4" aria-hidden /></a>
        </div>
      </header>

      {/* Role sign-in cards */}
      <main>
        <section id="roles" aria-labelledby="roles-h" className="relative -mt-20 w-full scroll-mt-6 px-6 sm:px-10 lg:px-16">
          <h2 id="roles-h" className="sr-only">Sign in by role</h2>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-5">
            {ROLES.map(({ role, title, blurb, icon: Icon, tint }) => (
              <Link key={role} to={`/login?role=${role}`}
                className="group flex flex-col rounded-2xl border border-line/70 bg-white p-6 shadow-[0_20px_50px_-28px_rgba(16,27,58,0.35)] transition hover:-translate-y-1 hover:border-primary/40 hover:shadow-[0_24px_60px_-24px_rgba(16,27,58,0.4)]">
                <span className={`grid size-12 place-items-center rounded-xl bg-gradient-to-br ${tint} text-white shadow-md`}><Icon className="size-6" aria-hidden /></span>
                <h3 className="mt-4 text-lg font-semibold text-navy">{title}</h3>
                <p className="mt-1.5 flex-1 text-sm text-muted">{blurb}</p>
                <span className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-primary">Sign in as {title}<ArrowRight className="size-4 transition group-hover:translate-x-1" aria-hidden /></span>
              </Link>
            ))}
          </div>
        </section>

        {/* Features */}
        <section aria-labelledby="features-h" className="w-full px-6 py-24 sm:px-10 lg:px-16">
          <div className="mx-auto max-w-2xl text-center">
            <div className="mx-auto mb-4 h-1.5 w-16 rounded-full bg-accent" />
            <h2 id="features-h" className="text-3xl font-bold tracking-tight text-navy sm:text-4xl">Everything your campus needs</h2>
            <p className="mt-3 text-muted">From the first lesson to the final result, every step lives in one place.</p>
          </div>
          <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map(({ icon: Icon, title, body }) => (
              <div key={title} className="rounded-2xl border border-line/70 bg-white p-6">
                <span className="grid size-11 place-items-center rounded-xl bg-primary/10 text-primary"><Icon className="size-5" aria-hidden /></span>
                <h3 className="mt-4 font-semibold text-navy">{title}</h3>
                <p className="mt-1.5 text-sm text-muted">{body}</p>
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer className="border-t border-line/70 bg-white">
        <div className="flex w-full flex-col items-center justify-between gap-3 px-6 py-6 sm:px-10 lg:px-16 text-sm text-muted sm:flex-row">
          <span>© {new Date().getFullYear()} {PRODUCT} · {b.name}</span>
          {b.supportEmail && <a href={`mailto:${b.supportEmail}`} className="hover:text-ink">Need help? {b.supportEmail}</a>}
        </div>
      </footer>
    </div>
  );
}
