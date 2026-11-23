import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, UserPlus } from 'lucide-react';
import { api, send } from '../../lib/api';
import { useAct } from '../../lib/hooks';
import { useAuth, ROLE_LABEL, type Role } from '../../lib/auth';
import { fmtDate } from '../../lib/format';
import { Badge, Button, Checkbox, EmptyState, Input, Modal, PageHeader, QueryView, Select, StatusBadge, Table, Td, fieldErrors, useConfirm } from '../../components/ui';
import { AdminSummary } from './Summary';

const ROLES = Object.keys(ROLE_LABEL) as Role[];

export default function Users() {
  const [filter, setFilter] = useState({ search: '', role: '', status: '' });
  const [page, setPage] = useState(1);
  const qs = new URLSearchParams({ page: String(page), pageSize: '20', ...Object.fromEntries(Object.entries(filter).filter(([, v]) => v)) });
  const q = useQuery({ queryKey: ['/users', qs.toString()], queryFn: () => api(`/users?${qs}`) });
  const [edit, setEdit] = useState<any | 'new' | null>(null);
  return (
    <>
      <PageHeader title="Users" subtitle="Create accounts, assign roles and suspend access." actions={<Button onClick={() => setEdit('new')}><UserPlus className="size-4" aria-hidden />Add user</Button>} />
      <AdminSummary kind="users" />
      <div className="mb-4 grid gap-3 sm:grid-cols-[1fr_180px_160px]">
        <div className="relative"><Search className="pointer-events-none absolute bottom-2.5 left-3 size-4 text-muted" aria-hidden /><Input label="Search name or email" className="pl-9" value={filter.search} onChange={(e) => { setFilter({ ...filter, search: e.target.value }); setPage(1); }} /></div>
        <Select label="Role" value={filter.role} onChange={(e) => { setFilter({ ...filter, role: e.target.value }); setPage(1); }}><option value="">All roles</option>{ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</Select>
        <Select label="Status" value={filter.status} onChange={(e) => { setFilter({ ...filter, status: e.target.value }); setPage(1); }}><option value="">Any</option><option value="ACTIVE">Active</option><option value="SUSPENDED">Suspended</option></Select>
      </div>
      <QueryView q={q} empty={<EmptyState title="No users match" />} isEmpty={(d: any) => d.data.length === 0}>
        {(d: any) => (
          <>
            <Table head={['Name', 'Roles', 'Status', 'MFA', 'Last sign-in', '']}>
              {d.data.map((u: any) => (
                <tr key={u.id}>
                  <Td><div className="font-medium">{u.firstName} {u.lastName}</div><div className="text-xs text-muted">{u.email}</div></Td>
                  <Td><div className="flex flex-wrap gap-1">{u.roles.map((r: Role) => <Badge key={r} tone={r.includes('ADMIN') ? 'navy' : 'neutral'}>{ROLE_LABEL[r]}</Badge>)}</div></Td>
                  <Td><StatusBadge status={u.status} /></Td>
                  <Td>{u.mfaEnabled ? <Badge tone="success">On</Badge> : <span className="text-xs text-muted">Off</span>}</Td>
                  <Td className="text-xs">{u.lastLoginAt ? fmtDate(u.lastLoginAt) : 'Never'}</Td>
                  <Td><Button size="sm" variant="secondary" onClick={() => setEdit(u)}>Edit</Button></Td>
                </tr>
              ))}
            </Table>
            <div className="mt-4 flex items-center justify-between text-sm">
              <Button size="sm" variant="secondary" disabled={page === 1} onClick={() => setPage(page - 1)}>Previous</Button>
              <span className="text-muted">{d.meta.total} users · page {page}</span>
              <Button size="sm" variant="secondary" disabled={page * 20 >= d.meta.total} onClick={() => setPage(page + 1)}>Next</Button>
            </div>
          </>
        )}
      </QueryView>
      {edit && <UserForm user={edit === 'new' ? null : edit} onClose={() => setEdit(null)} />}
    </>
  );
}

function UserForm({ user, onClose }: { user: any | null; onClose: () => void }) {
  const { me } = useAuth();
  const isSuper = me?.roles.includes('SUPER_ADMIN');
  const [f, setF] = useState({ email: user?.email ?? '', firstName: user?.firstName ?? '', lastName: user?.lastName ?? '', password: '', roles: (user?.roles ?? ['STUDENT']) as Role[] });
  const { confirm, dialog } = useConfirm();
  const save = useAct(() => (user
    ? send('PATCH', `/users/${user.id}`, { firstName: f.firstName, lastName: f.lastName, roles: f.roles, ...(f.password ? { password: f.password } : {}) })
    : send('POST', '/users', f)), { success: user ? 'User updated' : 'User created', invalidate: ['/users'], onDone: onClose });
  const setStatus = useAct((status: string) => send('PATCH', `/users/${user.id}`, { status }), { success: 'Status updated', invalidate: ['/users'], onDone: onClose });
  const errs = fieldErrors(save.error);
  const grantable = ROLES.filter((r) => isSuper || !r.includes('ADMIN'));
  return (
    <Modal open onClose={onClose} title={user ? `Edit ${user.firstName} ${user.lastName}` : 'Add user'} wide>
      <form onSubmit={(e) => { e.preventDefault(); save.mutate(); }} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="First name" required value={f.firstName} onChange={(e) => setF({ ...f, firstName: e.target.value })} error={errs.firstName} />
          <Input label="Last name" required value={f.lastName} onChange={(e) => setF({ ...f, lastName: e.target.value })} error={errs.lastName} />
        </div>
        <Input label="Email" type="email" required disabled={!!user} value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} error={errs.email} />
        <Input label={user ? 'Set a new password (optional)' : 'Initial password'} type="password" autoComplete="new-password" required={!user} minLength={10} value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} error={errs.password} hint={user ? 'Resetting signs the user out everywhere.' : 'At least 10 characters. Share it securely; the user can change it.'} />
        <fieldset><legend className="mb-2 text-sm font-medium">Roles</legend>
          <div className="grid gap-2 sm:grid-cols-3">{grantable.map((r) => <Checkbox key={r} label={ROLE_LABEL[r]} checked={f.roles.includes(r)} onChange={(v) => setF({ ...f, roles: v ? [...f.roles, r] : f.roles.filter((x) => x !== r) })} />)}</div>
          {!isSuper && <p className="mt-2 text-xs text-muted">Only a Super Admin can grant administrator roles.</p>}
        </fieldset>
        <div className="flex flex-wrap justify-between gap-2 border-t border-line pt-4">
          {user ? (user.status === 'ACTIVE'
            ? <Button type="button" variant="danger" onClick={async () => (await confirm({ title: 'Suspend this account?', body: 'The user is signed out immediately and cannot sign in. Their records are kept and you can reactivate them later.', confirm: 'Suspend', danger: true })) && setStatus.mutate('SUSPENDED')}>Suspend</Button>
            : <Button type="button" variant="secondary" onClick={() => setStatus.mutate('ACTIVE')}>Reactivate</Button>) : <span />}
          <div className="flex gap-2"><Button type="button" variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" loading={save.isPending} disabled={!f.roles.length}>Save</Button></div>
        </div>
      </form>
      {dialog}
    </Modal>
  );
}
