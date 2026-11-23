import { useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { ApiError } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { Button, Input } from '../../components/ui';
import { AuthLayout } from './AuthLayout';

export default function Login() {
  const { me, login } = useAuth();
  const nav = useNavigate();
  const loc = useLocation() as { state?: { from?: string } };
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mfaCode, setMfaCode] = useState('');
  const [needMfa, setNeedMfa] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (me) return <Navigate to={loc.state?.from ?? '/'} replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(''); setBusy(true);
    try {
      const r = await login(email, password, needMfa ? mfaCode : undefined);
      nav(r.mfaSetupRequired ? '/account?mfa=required' : loc.state?.from ?? '/', { replace: true });
    } catch (err) {
      if (err instanceof ApiError && err.code === 'MFA_REQUIRED') { setNeedMfa(true); setError(''); }
      else setError(err instanceof Error ? err.message : 'Sign-in failed');
    } finally { setBusy(false); }
  };

  return (
    <AuthLayout title={needMfa ? 'Two-factor verification' : 'Sign in'} subtitle={needMfa ? 'Enter the 6-digit code from your authenticator app.' : 'Use the account provided by your college.'}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        {!needMfa ? (
          <>
            <Input label="Email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
            <Input label="Password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          </>
        ) : (
          <Input label="Authentication code" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} required autoFocus value={mfaCode} onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, ''))} />
        )}
        {error && <p role="alert" className="rounded-lg bg-danger/8 px-3 py-2 text-sm font-medium text-danger">{error}</p>}
        <Button type="submit" loading={busy} className="w-full">{needMfa ? 'Verify' : 'Sign in'}</Button>
        <div className="flex justify-between text-sm">
          {needMfa ? <button type="button" className="text-muted hover:text-ink" onClick={() => { setNeedMfa(false); setMfaCode(''); }}>Back</button> : <span />}
          <Link to="/forgot-password" className="font-medium text-primary hover:underline">Forgot password?</Link>
        </div>
      </form>
    </AuthLayout>
  );
}
