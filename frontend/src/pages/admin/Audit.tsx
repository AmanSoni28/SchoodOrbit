import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { fmtDateTime } from '../../lib/format';
import { Badge, Button, EmptyState, Input, PageHeader, QueryView, Table, Td } from '../../components/ui';

const actionTone = (a: string) => (a === 'LOGIN' ? 'primary' : /DELETE|REVOKE|SUSPEND|FAIL|REJECT/.test(a) ? 'danger' : /CREATE|APPROVE|PUBLISH|ISSUED/.test(a) ? 'success' : /UPDATE|CHANGE|EDIT/.test(a) ? 'warning' : 'neutral');
import { AdminSummary } from './Summary';

const PAGE = 15;

export default function Audit() {
  const [page, setPage] = useState(1);
  const [action, setAction] = useState('');
  const q = useQuery({ queryKey: ['/audit-logs', page, action], queryFn: () => api(`/audit-logs?page=${page}&pageSize=${PAGE}${action ? `&action=${encodeURIComponent(action.toUpperCase())}` : ''}`) });
  return (
    <>
      <PageHeader title="Audit log" subtitle="Immutable record of sign-ins, configuration, grade changes, parent views and moderation." />
      <AdminSummary kind="audit" />
      <div className="mb-4 max-w-xs"><Input label="Filter by action (e.g. GRADE_CHANGED)" value={action} onChange={(e) => { setAction(e.target.value); setPage(1); }} /></div>
      <QueryView q={q} empty={<EmptyState title="No events" />} isEmpty={(d: any) => d.data.length === 0}>
        {(d: any) => (
          <>
            <Table head={['When', 'Actor', 'Action', 'Entity', 'Details']}>
              {d.data.map((a: any) => (
                <tr key={a.id}>
                  <Td className="whitespace-nowrap text-xs">{fmtDateTime(a.createdAt)}</Td>
                  <Td className="text-xs"><div className="flex items-center gap-2.5"><span className="grid size-8 shrink-0 place-items-center rounded-full bg-gradient-to-br from-primary to-accent text-[11px] font-semibold text-white" aria-hidden>{a.actor ? `${a.actor.firstName[0]}${a.actor.lastName[0]}` : 'SY'}</span><span><span className="block font-medium text-ink">{a.actor ? `${a.actor.firstName} ${a.actor.lastName}` : 'system'}</span><span className="text-muted">{a.ip}</span></span></div></Td>
                  <Td><Badge tone={actionTone(a.action)}>{a.action.replace(/_/g, ' ').toLowerCase()}</Badge></Td>
                  <Td className="text-xs">{a.entityType}<div className="font-mono text-muted">{a.entityId?.slice(0, 8)}</div></Td>
                  <Td className="max-w-xs truncate font-mono text-xs text-muted">{a.metadata ? JSON.stringify(a.metadata) : ''}</Td>
                </tr>
              ))}
            </Table>
            <div className="mt-4 flex items-center justify-between"><Button size="sm" variant="secondary" disabled={page === 1} onClick={() => setPage(page - 1)}>Newer</Button><span className="text-sm text-muted">Page {page} of {Math.max(1, Math.ceil(d.meta.total / PAGE))}</span><Button size="sm" variant="secondary" disabled={page * PAGE >= d.meta.total} onClick={() => setPage(page + 1)}>Older</Button></div>
          </>
        )}
      </QueryView>
    </>
  );
}
