import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { send } from '../../lib/api';
import { useAct, useGet } from '../../lib/hooks';
import { Button, Card, Checkbox, Input, PageHeader, QueryView, fieldErrors } from '../../components/ui';

const FEATURES: Record<string, string> = {
  doubtBoard: 'Anonymous Doubt Board', aiHomework: 'AI Homework Helper', aiContent: 'AI Notes & Quiz Generator', classInsights: 'Smart Class Insights',
  dailyRevision: 'Daily Revision Quiz', parentPortal: 'Parent portal', discussions: 'Course discussions',
};

export default function Settings() {
  const q = useGet<any>('/settings');
  const qc = useQueryClient();
  const [f, setF] = useState<any>(null);
  useEffect(() => { if (q.data) setF(q.data); }, [q.data]);
  const save = useAct(() => send('PATCH', '/settings', {
    name: f.name, shortName: f.shortName, logoUrl: f.logoUrl || null, primaryColor: f.primaryColor, accentColor: f.accentColor, timeZone: f.timeZone,
    locale: f.locale, emailFromName: f.emailFromName || null, supportEmail: f.supportEmail || null, requireMfaForAdmins: f.requireMfaForAdmins,
  }), { success: 'Branding saved', invalidate: ['/settings'], onDone: () => qc.invalidateQueries({ queryKey: ['branding'] }) });
  const toggle = useAct(({ key, enabled }: { key: string; enabled: boolean }) => send('PUT', `/settings/features/${key}`, { enabled }), { success: 'Feature updated', invalidate: ['/settings'], onDone: () => qc.invalidateQueries({ queryKey: ['branding'] }) });
  const errs = fieldErrors(save.error);
  const set = (k: string) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  return (
    <>
      <PageHeader title="Branding & features" subtitle="White-label settings for this college deployment. Changes apply to every page immediately." />
      <QueryView q={q}>{() => f && (
        <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
          <Card title="College identity">
            <form onSubmit={(e) => { e.preventDefault(); save.mutate(); }} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-[1fr_160px]">
                <Input label="College name" required value={f.name} onChange={set('name')} error={errs.name} />
                <Input label="Short name" required value={f.shortName} onChange={set('shortName')} error={errs.shortName} />
              </div>
              <Input label="Logo URL" type="url" value={f.logoUrl ?? ''} onChange={set('logoUrl')} hint="A square PNG/SVG hosted on your domain." error={errs.logoUrl} />
              <div className="grid gap-4 sm:grid-cols-2">
                {(['primaryColor', 'accentColor'] as const).map((k) => (
                  <div key={k} className="flex items-end gap-2">
                    <input type="color" aria-label={`${k === 'primaryColor' ? 'Primary' : 'Accent'} colour picker`} value={f[k]} onChange={set(k)} className="h-10 w-12 cursor-pointer rounded-lg border border-line" />
                    <div className="flex-1"><Input label={k === 'primaryColor' ? 'Primary colour' : 'Accent colour'} value={f[k]} onChange={set(k)} error={errs[k]} /></div>
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted">The primary colour is checked against WCAG AA contrast with white button text.</p>
              <div className="grid gap-4 sm:grid-cols-2">
                <Input label="Time zone" value={f.timeZone} onChange={set('timeZone')} hint="IANA name, e.g. Asia/Kolkata — controls the daily revision reset." />
                <Input label="Locale" value={f.locale} onChange={set('locale')} />
                <Input label="Email sender name" value={f.emailFromName ?? ''} onChange={set('emailFromName')} />
                <Input label="Support email" type="email" value={f.supportEmail ?? ''} onChange={set('supportEmail')} />
              </div>
              <Checkbox label="Require two-factor authentication for administrators" hint="Admins without MFA will be asked to set it up before continuing." checked={f.requireMfaForAdmins} onChange={(v) => setF({ ...f, requireMfaForAdmins: v })} />
              {save.error && !Object.keys(errs).length && <p role="alert" className="text-sm text-danger">{(save.error as Error).message}</p>}
              <Button type="submit" loading={save.isPending}>Save branding</Button>
            </form>
          </Card>
          <div className="space-y-6">
            <Card title="Preview">
              <div className="overflow-hidden rounded-xl border border-line">
                <div className="bg-navy p-4 text-white"><div className="font-semibold">{f.shortName}</div><div className="text-xs text-white/60">{f.name}</div></div>
                <div className="space-y-2 p-4"><span className="inline-block rounded-lg px-3 py-2 text-sm font-medium text-white" style={{ background: f.primaryColor }}>Primary button</span> <span className="inline-block rounded-lg px-3 py-2 text-sm font-medium text-white" style={{ background: f.accentColor }}>Accent</span></div>
              </div>
            </Card>
            <Card title="Feature toggles">
              <ul className="space-y-3">{Object.entries(FEATURES).map(([k, l]) => (
                <li key={k}><Checkbox label={l} checked={f.features[k]} onChange={(v) => { setF({ ...f, features: { ...f.features, [k]: v } }); toggle.mutate({ key: k, enabled: v }); }} /></li>
              ))}</ul>
            </Card>
          </div>
        </div>
      )}</QueryView>
    </>
  );
}
