import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { KeyRound, Laptop, ShieldCheck } from 'lucide-react';
import { send } from '../../lib/api';
import { useAct, useGet } from '../../lib/hooks';
import { useAuth, ROLE_LABEL } from '../../lib/auth';
import { fmtDateTime } from '../../lib/format';
import { Badge, Button, Card, Input, PageHeader, QueryView, fieldErrors, useConfirm } from '../../components/ui';

export default function Account() {
  const { me } = useAuth();
  const [params] = useSearchParams();
  return (
    <>
      <PageHeader title="Account & security" subtitle={`${me?.email} · ${me?.roles.map((r) => ROLE_LABEL[r]).join(', ')}`} />
      {params.get('mfa') === 'required' && !me?.mfaEnabled && <div role="alert" className="mb-6 rounded-2xl border border-gold/50 bg-gold/10 p-4 text-sm"><strong>Your college requires two-factor authentication for administrators.</strong> Set it up below to continue.</div>}
      <div className="grid gap-6 lg:grid-cols-2">
        <ChangePassword />
        <Mfa />
        <Sessions />
      </div>
    </>
  );
}

function ChangePassword() {
  const [f, setF] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [err, setErr] = useState('');
  const save = useAct(() => send('POST', '/auth/password/change', { currentPassword: f.currentPassword, newPassword: f.newPassword }), { success: 'Password changed', onDone: () => setF({ currentPassword: '', newPassword: '', confirm: '' }) });
  const errs = fieldErrors(save.error);
  return (
    <Card title={<span className="flex items-center gap-2"><KeyRound className="size-4" aria-hidden />Password</span>}>
      <form onSubmit={(e) => { e.preventDefault(); if (f.newPassword !== f.confirm) return setErr('Passwords do not match'); setErr(''); save.mutate(); }} className="space-y-3">
        <Input label="Current password" type="password" autoComplete="current-password" required value={f.currentPassword} onChange={(e) => setF({ ...f, currentPassword: e.target.value })} />
        <Input label="New password" type="password" autoComplete="new-password" required minLength={10} value={f.newPassword} onChange={(e) => setF({ ...f, newPassword: e.target.value })} error={errs.newPassword} hint="At least 10 characters." />
        <Input label="Confirm new password" type="password" autoComplete="new-password" required value={f.confirm} onChange={(e) => setF({ ...f, confirm: e.target.value })} error={err || undefined} />
        <Button type="submit" loading={save.isPending}>Change password</Button>
      </form>
    </Card>
  );
}

function Mfa() {
  const { me } = useAuth();
  const qc = useQueryClient();
  const [setup, setSetup] = useState<{ secret: string; otpauthUri: string } | null>(null);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const refreshMe = () => qc.invalidateQueries({ queryKey: ['me'] });
  const start = useAct(() => send('POST', '/auth/mfa/setup'), { onDone: setSetup });
  const enable = useAct(() => send('POST', '/auth/mfa/enable', { code }), { success: 'Two-factor authentication is on', onDone: () => { setSetup(null); setCode(''); refreshMe(); } });
  const disable = useAct(() => send('POST', '/auth/mfa/disable', { code, password }), { success: 'Two-factor authentication is off', onDone: () => { setCode(''); setPassword(''); refreshMe(); } });
  return (
    <Card title={<span className="flex items-center gap-2"><ShieldCheck className="size-4" aria-hidden />Two-factor authentication</span>} action={me?.mfaEnabled ? <Badge tone="success">On</Badge> : <Badge>Off</Badge>}>
      {me?.mfaEnabled ? (
        <form onSubmit={(e) => { e.preventDefault(); disable.mutate(); }} className="space-y-3">
          <p className="text-sm text-muted">To turn it off, confirm your password and a current code.</p>
          <Input label="Password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          <Input label="6-digit code" inputMode="numeric" maxLength={6} required value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} />
          <Button type="submit" variant="secondary" loading={disable.isPending}>Turn off</Button>
        </form>
      ) : setup ? (
        <form onSubmit={(e) => { e.preventDefault(); enable.mutate(); }} className="space-y-3">
          <ol className="list-decimal space-y-2 pl-5 text-sm">
            <li>Open an authenticator app (Google Authenticator, Microsoft Authenticator, 1Password…).</li>
            <li>Add an account by entering this key manually:<code className="mt-1 block break-all rounded-lg bg-cloud p-2 font-mono text-sm tracking-wider">{setup.secret.match(/.{1,4}/g)?.join(' ')}</code><span className="text-xs text-muted">or open the setup link on your phone: </span><a href={setup.otpauthUri} className="break-all text-xs text-primary">{setup.otpauthUri.slice(0, 48)}…</a></li>
            <li>Enter the 6-digit code it shows.</li>
          </ol>
          <Input label="6-digit code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} required value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} />
          <Button type="submit" loading={enable.isPending}>Verify & turn on</Button>
        </form>
      ) : (
        <>
          <p className="mb-4 text-sm text-muted">Add a second step at sign-in using a code from your phone. Strongly recommended for administrators.</p>
          <Button loading={start.isPending} onClick={() => start.mutate()}>Set up two-factor</Button>
        </>
      )}
    </Card>
  );
}

function Sessions() {
  const { logout } = useAuth();
  const nav = useNavigate();
  const q = useGet<any[]>('/auth/sessions');
  const { confirm, dialog } = useConfirm();
  const revoke = useAct((id: string) => send('DELETE', `/auth/sessions/${id}`), { success: 'Session signed out', invalidate: ['/auth/sessions'] });
  const all = useAct(() => send('POST', '/auth/logout-all'), { onDone: async () => { await logout(); nav('/login'); } });
  return (
    <Card className="lg:col-span-2" title={<span className="flex items-center gap-2"><Laptop className="size-4" aria-hidden />Signed-in devices</span>}
      action={<Button size="sm" variant="secondary" onClick={async () => (await confirm({ title: 'Sign out everywhere?', body: 'All devices including this one will be signed out.', confirm: 'Sign out all', danger: true })) && all.mutate()}>Sign out all devices</Button>}>
      <QueryView q={q}>
        {(rows) => (
          <ul className="divide-y divide-line">{rows.map((s) => (
            <li key={s.id} className="flex items-center justify-between gap-3 py-3 text-sm">
              <div className="min-w-0"><div className="truncate font-medium">{s.userAgent ?? 'Unknown device'}</div><div className="text-xs text-muted">{s.ip} · since {fmtDateTime(s.createdAt)}</div></div>
              <Button size="sm" variant="ghost" onClick={() => revoke.mutate(s.id)}>Sign out</Button>
            </li>
          ))}</ul>
        )}
      </QueryView>
      {dialog}
    </Card>
  );
}
