import { ShieldCheck } from 'lucide-react';
import { send } from '../../lib/api';
import { useAct, useGet } from '../../lib/hooks';
import { fmtDate } from '../../lib/format';
import { Badge, Button, Card, EmptyState, PageHeader, QueryView, StatusBadge, useConfirm } from '../../components/ui';

export default function Privacy() {
  const q = useGet<any[]>('/me/parent-links');
  const { confirm, dialog } = useConfirm();
  const revoke = useAct((id: string) => send('POST', `/me/parent-links/${id}/revoke`), { success: 'Access revoked', invalidate: ['/me/parent-links'] });
  return (
    <>
      <PageHeader title="Parent access" subtitle="Who can see your published progress, and what they can see." />
      <Card className="mb-6"><p className="flex gap-2 text-sm"><ShieldCheck className="size-5 shrink-0 text-accent" aria-hidden />Parents never see your AI Helper conversations, your anonymous doubts, unpublished marks, or other students' data.</p></Card>
      <QueryView q={q} empty={<EmptyState title="No parent or guardian is linked" />}>
        {(rows) => (
          <ul className="space-y-3">{rows.map((l) => {
            const scope: string[] = [...new Set<string>(l.consents.flatMap((c: any) => c.scope))];
            return (
              <li key={l.id}><Card>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div><div className="font-semibold">{l.parent.firstName} {l.parent.lastName} <span className="text-sm font-normal text-muted">({l.relationship})</span></div><div className="text-xs text-muted">{l.parent.email} · verified {fmtDate(l.verifiedAt)}</div></div>
                  <StatusBadge status={l.status} />
                </div>
                <div className="mt-3 flex flex-wrap gap-2">{scope.length ? scope.map((s) => <Badge key={s} tone="primary">{s.toLowerCase()}</Badge>) : <Badge>No access</Badge>}</div>
                {scope.length > 0 && <Button size="sm" variant="secondary" className="mt-4" onClick={async () => (await confirm({ title: 'Revoke access?', body: 'This parent will no longer see your progress, grades or attendance. Your college can restore it.', confirm: 'Revoke', danger: true })) && revoke.mutate(l.id)}>Revoke access</Button>}
              </Card></li>
            );
          })}</ul>
        )}
      </QueryView>
      {dialog}
    </>
  );
}
