import type { ReactNode } from 'react';
import { Brain, CheckCircle2 } from 'lucide-react';
import { useBranding } from '../../lib/branding';

export function AuthLayout({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  const b = useBranding();
  return (
    <div className="grid min-h-full lg:grid-cols-[1.05fr_1fr]">
      <div className="relative hidden overflow-hidden bg-gradient-to-br from-navy via-navy-2 to-[#2a3f9e] p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="absolute -right-24 -top-24 size-[28rem] rounded-full bg-accent/25 blur-3xl" aria-hidden />
        <div className="absolute -bottom-40 -left-10 size-[26rem] rounded-full bg-primary/40 blur-3xl" aria-hidden />
        <div className="absolute inset-0 opacity-[.07] [background-image:radial-gradient(white_1px,transparent_1px)] [background-size:22px_22px]" aria-hidden />
        <div className="relative flex items-center gap-3">
          {b.logoUrl ? <img src={b.logoUrl} alt="" className="size-11 rounded-xl bg-white object-contain p-1" /> : <span className="grid size-11 place-items-center rounded-xl bg-gradient-to-br from-accent to-primary text-white shadow-lg"><Brain className="size-6" aria-hidden /></span>}
          <div><div className="text-lg font-semibold">{b.name}</div><div className="text-sm text-white/60">Learning Management System</div></div>
        </div>
        <div className="relative max-w-md">
          <div className="mb-5 h-1.5 w-20 rounded-full bg-accent" />
          <h2 className="text-4xl font-bold leading-tight tracking-tight">Learn, teach and track progress — <span className="bg-gradient-to-r from-accent to-[#8fb3ff] bg-clip-text text-transparent">in one calm place.</span></h2>
          <ul className="mt-6 space-y-3 text-white/80">
            {['Courses, lessons, assignments and quizzes', 'Anonymous doubt board and daily revision', 'Guided AI study help with faculty oversight'].map((t) => (
              <li key={t} className="flex items-center gap-3 rounded-xl bg-white/[.06] px-4 py-3 ring-1 ring-white/10 backdrop-blur"><CheckCircle2 className="size-5 shrink-0 text-accent" aria-hidden />{t}</li>
            ))}
          </ul>
        </div>
        <p className="relative text-xs text-white/45">{b.supportEmail ? `Need help? ${b.supportEmail}` : ' '}</p>
      </div>
      <div className="flex items-center justify-center p-6 sm:p-12">
        <main className="w-full max-w-md rounded-3xl border border-line/70 bg-white p-8 shadow-[0_20px_60px_-24px_rgba(16,27,58,0.25)] sm:p-10">
          <div className="mb-8 lg:hidden"><span className="text-lg font-semibold text-navy">{b.name}</span></div>
          <h1 className="text-[28px] font-bold tracking-tight text-navy">{title}</h1>
          {subtitle && <p className="mt-1.5 text-sm text-muted">{subtitle}</p>}
          <div className="mt-8">{children}</div>
        </main>
      </div>
    </div>
  );
}
