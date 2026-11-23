import { useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { send } from '../../lib/api';
import { Button, Input, fieldErrors } from '../../components/ui';
import { AuthLayout } from './AuthLayout';

export function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setError('');
    try { await send('POST', '/auth/password/forgot', { email }); setDone(true); } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  };
  return (
    <AuthLayout title="Reset your password" subtitle="We'll email you a link to choose a new password.">
      {done ? (
        <div role="status" className="rounded-xl border border-accent/30 bg-accent/5 p-4 text-sm">If an account exists for <strong>{email}</strong>, a reset link is on its way. The link is valid for 30 minutes.</div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <Input label="Email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} error={error || undefined} />
          <Button type="submit" loading={busy} className="w-full">Send reset link</Button>
        </form>
      )}
      <p className="mt-6 text-sm"><Link to="/login" className="font-medium text-primary hover:underline">Back to sign in</Link></p>
    </AuthLayout>
  );
}

export function ResetPassword() {
  const [params] = useSearchParams();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (password !== confirm) return setErrors({ confirm: 'Passwords do not match' });
    setBusy(true); setErrors({});
    try { await send('POST', '/auth/password/reset', { token: params.get('token'), password }); setDone(true); }
    catch (err) { setErrors({ ...fieldErrors(err), form: (err as Error).message }); } finally { setBusy(false); }
  };
  return (
    <AuthLayout title="Choose a new password" subtitle="Use at least 10 characters.">
      {done ? (
        <div role="status" className="rounded-xl border border-accent/30 bg-accent/5 p-4 text-sm">Your password has been changed and other sessions were signed out. <Link to="/login" className="font-medium text-primary">Sign in</Link></div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <Input label="New password" type="password" autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)} error={errors.password} />
          <Input label="Confirm password" type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} error={errors.confirm} />
          {errors.form && !errors.password && <p role="alert" className="text-sm text-danger">{errors.form}</p>}
          <Button type="submit" loading={busy} className="w-full">Update password</Button>
        </form>
      )}
    </AuthLayout>
  );
}
