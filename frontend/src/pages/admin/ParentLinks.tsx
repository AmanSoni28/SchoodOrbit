import { useState } from 'react';
import { HeartHandshake } from 'lucide-react';
import { api, send } from '../../lib/api';
import { useAct, useGet } from '../../lib/hooks';
import { useQuery } from '@tanstack/react-query';
import { fmtDate } from '../../lib/format';
import { Badge, Button, Card, Checkbox, EmptyState, Input, PageHeader, QueryView, Select, StatusBadge, Table, Td, useConfirm } from '../../components/ui';

const SCOPES = [['PROGRESS', 'Course progress & upcoming work'], ['GRADES', 'Published grades'], ['ATTENDANCE', 'Attendance']] as const;

export default function ParentLinks() {
  const q = useGet<any[]>('/parent-links');
  const parents = useQuery({ queryKey: ['/users', 'PARENT'], queryFn: () => api('/users?role=PARENT&pageSize=100') });
  const students = useQuery({ queryKey: ['/users', 'STUDENT'], queryFn: () => api('/users?role=STUDENT&pageSize=100') });
  const [f, setF] = useState({ parentId: '', studentId: '', relationship: 'Guardian', scope: ['PROGRESS', 'GRADES'] as string[], expiresAt: '' });
  const { confirm, dialog } = useConfirm();
  const link = useAct(() => send('POST', '/parent-links', { ...f, expiresAt: f.expiresAt || undefined }), { success: 'Link verified and consent recorded', invalidate: ['/parent-links'] });
  const revoke = useAct((id: string) => send('POST', `/parent-links/${id}/revoke`), { success: 'Access revoked', invalidate: ['/parent-links'] });
  return (
    <>
      <PageHeader title="Parent access" subtitle="Verify parent–student links and record exactly what each parent may see." />
      <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
        <Card title="Verify a link">
          <form onSubmit={(e) => { e.preventDefault(); link.mutate(); }} className="space-y-3">
            <Select label="Parent account" required value={f.parentId} onChange={(e) => setF({ ...f, parentId: e.target.value })}><option value="">Choose…</option>{parents.data?.data.map((u: any) => <option key={u.id} value={u.id}>{u.firstName} {u.lastName} ({u.email})</option>)}</Select>
            <Select label="Student" required value={f.studentId} onChange={(e) => setF({ ...f, studentId: e.target.value })}><option value="">Choose…</option>{students.data?.data.map((u: any) => <option key={u.id} value={u.id}>{u.firstName} {u.lastName} ({u.email})</option>)}</Select>
            <Input label="Relationship" value={f.relationship} onChange={(e) => setF({ ...f, relationship: e.target.value })} />
            <fieldset className="space-y-2"><legend className="text-sm font-medium">Consented access</legend>{SCOPES.map(([k, l]) => <Checkbox key={k} label={l} checked={f.scope.includes(k)} onChange={(v) => setF({ ...f, scope: v ? [...f.scope, k] : f.scope.filter((x) => x !== k) })} />)}</fieldset>
            <Input label="Consent expires (optional)" type="date" value={f.expiresAt} onChange={(e) => setF({ ...f, expiresAt: e.target.value })} />
            <p className="text-xs text-muted">Parents never see AI Helper chats, anonymous doubt identities, unpublished marks or other students. Every parent view is audited.</p>
            <Button type="submit" className="w-full" loading={link.isPending} disabled={!f.scope.length}>Verify & grant</Button>
          </form>
        </Card>
        <QueryView q={q} empty={<EmptyState icon={<HeartHandshake className="size-6" />} title="No parent links yet" />}>
          {(rows) => (
            <Table head={['Parent', 'Student', 'Access', 'Status', '']}>
              {rows.map((l) => (
                <tr key={l.id}>
                  <Td><div className="font-medium">{l.parent.firstName} {l.parent.lastName}</div><div className="text-xs text-muted">{l.relationship}</div></Td>
                  <Td>{l.student.firstName} {l.student.lastName}</Td>
                  <Td><div className="flex flex-wrap gap-1">{l.consents.flatMap((c: any) => c.scope).map((s: string) => <Badge key={s} tone="primary">{s.toLowerCase()}</Badge>)}{l.consents[0]?.expiresAt && <span className="text-xs text-muted">until {fmtDate(l.consents[0].expiresAt)}</span>}{!l.consents.length && <span className="text-xs text-muted">None</span>}</div></Td>
                  <Td><StatusBadge status={l.status} /></Td>
                  <Td>{l.status === 'ACTIVE' && <Button size="sm" variant="secondary" onClick={async () => (await confirm({ title: 'Revoke parent access?', body: 'The parent immediately loses access to this student.', confirm: 'Revoke', danger: true })) && revoke.mutate(l.id)}>Revoke</Button>}</Td>
                </tr>
              ))}
            </Table>
          )}
        </QueryView>
      </div>
      {dialog}
    </>
  );
}
