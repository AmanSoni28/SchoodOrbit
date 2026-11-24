import { useState, type FormEvent, type InputHTMLAttributes, type KeyboardEvent, type ReactNode } from 'react';
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, BookOpen, Eye, EyeOff, GraduationCap, HeartHandshake, KeyRound, Lock, Mail, ShieldCheck, Users, X, type LucideIcon } from 'lucide-react';
import { ApiError } from '../../lib/api';
import { ROLE_LABEL, useAuth, type Role } from '../../lib/auth';
import { useBranding } from '../../lib/branding';
import { Button, Field, cx } from '../../components/ui';
import { AuthLayout } from './AuthLayout';

const ROLE_ICON: Record<Role, LucideIcon> = { STUDENT: GraduationCap, FACULTY: BookOpen, PARENT: HeartHandshake, COLLEGE_ADMIN: Users, SUPER_ADMIN: ShieldCheck };

/** Text input with a leading icon and an optional trailing control, built on the house Field (label + error wiring). */
function IconInput({ label, icon: Icon, trailing, ...p }: InputHTMLAttributes<HTMLInputElement> & { label: string; icon: LucideIcon; trailing?: ReactNode }) {
  return (
    <Field label={label} required={p.required}>
      {(id, d) => (
        <div className="relative">
          <Icon className="pointer-events-none absolute left-3.5 top-1/2 size-[18px] -translate-y-1/2 text-muted" aria-hidden />
          <input id={id} aria-describedby={d} {...p}
            className={cx('h-11 w-full rounded-xl border border-line bg-cloud/50 pl-11 text-sm text-ink placeholder:text-muted/70 transition focus:border-primary focus:bg-white focus:outline-none focus:ring-4 focus:ring-primary/15', trailing ? 'pr-11' : 'pr-3.5')} />
          {trailing && <div className="absolute right-1.5 top-1/2 -translate-y-1/2">{trailing}</div>}
        </div>
      )}
    </Field>
  );
}

export default function Login() {
  const { me, login } = useAuth();
  const b = useBranding();
  const nav = useNavigate();
  const loc = useLocation() as { state?: { from?: string } };
  const [params, setParams] = useSearchParams();
  const qRole = params.get('role') as Role | null;
  const role = qRole && qRole in ROLE_LABEL ? qRole : null;
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [caps, setCaps] = useState(false);
  const [mfaCode, setMfaCode] = useState('');
  const [needMfa, setNeedMfa] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (me) return <Navigate to={loc.state?.from ?? '/'} replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!needMfa && (!email.trim() || !password)) { setError('Enter your email and password.'); return; }
    setError(''); setBusy(true);
    // auth.tsx opens this workspace after login if the user has the role, else falls back to their default.
    if (role) try { localStorage.setItem('lms.role', role); } catch { /* storage blocked */ }
    try {
      const r = await login(email, password, needMfa ? mfaCode : undefined);
      nav(r.mfaSetupRequired ? '/account?mfa=required' : loc.state?.from ?? '/', { replace: true });
    } catch (err) {
      if (err instanceof ApiError && err.code === 'MFA_REQUIRED') { setNeedMfa(true); setError(''); }
      else setError(err instanceof Error ? err.message : 'Sign-in failed');
    } finally { setBusy(false); }
  };
  const capsCheck = (e: KeyboardEvent<HTMLInputElement>) => setCaps(e.getModifierState?.('CapsLock') ?? false);

  const RoleIcon = role ? ROLE_ICON[role] : null;
  const badge = role && RoleIcon && !needMfa ? (
    <div className="mb-5 inline-flex items-center gap-2 rounded-full bg-primary/[.08] py-1 pl-1 pr-2 text-xs font-semibold text-primary ring-1 ring-primary/15">
      <span className="grid size-6 place-items-center rounded-full bg-primary text-white"><RoleIcon className="size-3.5" aria-hidden /></span>
      {ROLE_LABEL[role]} portal
      <button type="button" onClick={() => setParams({})} className="ml-0.5 rounded-full p-0.5 text-primary/60 hover:bg-primary/10 hover:text-primary" aria-label="Clear role and sign in without one"><X className="size-3.5" /></button>
    </div>
  ) : needMfa ? (
    <div className="mb-5 grid size-12 place-items-center rounded-2xl bg-primary/10 text-primary"><KeyRound className="size-6" aria-hidden /></div>
  ) : null;

  return (
    <AuthLayout badge={badge}
      title={needMfa ? 'Two-factor verification' : 'Welcome back'}
      subtitle={needMfa ? 'Enter the 6-digit code from your authenticator app.' : role ? `Sign in to your ${ROLE_LABEL[role].toLowerCase()} account.` : 'Sign in with the account provided by your college.'}>
      <form onSubmit={submit} className="space-y-5" noValidate>
        {!needMfa ? (
          <>
            <IconInput label="Email" icon={Mail} type="email" autoComplete="username" placeholder="you@college.edu" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} />
            <div>
              <IconInput label="Password" icon={Lock} type={showPw ? 'text' : 'password'} autoComplete="current-password" placeholder="••••••••••" required value={password}
                onChange={(e) => setPassword(e.target.value)} onKeyUp={capsCheck} onKeyDown={capsCheck} onBlur={() => setCaps(false)}
                trailing={<button type="button" onClick={() => setShowPw((s) => !s)} className="grid size-8 place-items-center rounded-lg text-muted hover:bg-cloud hover:text-ink" aria-label={showPw ? 'Hide password' : 'Show password'} aria-pressed={showPw}>
                  {showPw ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>} />
              <div className="mt-2 flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-[#9a6a12]" role="status">{caps ? 'Caps Lock is on' : ''}</span>
                <Link to="/forgot-password" className="text-xs font-medium text-primary hover:underline">Forgot password?</Link>
              </div>
            </div>
          </>
        ) : (
          <IconInput label="Authentication code" icon={KeyRound} inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} placeholder="123456" required autoFocus
            value={mfaCode} onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, ''))} />
        )}
        {error && <p role="alert" className="rounded-xl border border-danger/20 bg-danger/[.06] px-3.5 py-2.5 text-sm font-medium text-danger">{error}</p>}
        <Button type="submit" loading={busy} className="h-11 w-full rounded-xl text-[15px]">{needMfa ? 'Verify and sign in' : 'Sign in'}</Button>
        {needMfa && <button type="button" className="mx-auto flex items-center gap-1 text-sm text-muted hover:text-ink" onClick={() => { setNeedMfa(false); setMfaCode(''); }}><ArrowLeft className="size-4" aria-hidden />Use a different account</button>}
      </form>
      <div className="mt-8 flex items-center justify-between border-t border-line/70 pt-5 text-sm">
        <Link to="/" className="inline-flex items-center gap-1 text-muted hover:text-ink"><ArrowLeft className="size-4" aria-hidden />Back to home</Link>
        {b.supportEmail && <a href={`mailto:${b.supportEmail}`} className="text-xs text-muted hover:text-ink">Need help?</a>}
      </div>
    </AuthLayout>
  );
}
