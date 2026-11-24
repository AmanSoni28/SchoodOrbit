import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { send } from '../../../lib/api';
import { useAct, useGet } from '../../../lib/hooks';
import { fmtDateTime, fromNow, toLocalInput } from '../../../lib/format';
import { Badge, Button, Checkbox, EmptyState, Input, Modal, QueryView, StatusBadge, Table, Td, Textarea, fieldErrors } from '../../../components/ui';
import { FileUpload, MAX_MB, type Uploaded } from '../../../components/FileUpload';
import type { TabProps } from '../OfferingPage';

export default function AssignmentsTab({ offeringId, access }: TabProps) {
  const path = `/offerings/${offeringId}/assignments`;
  const q = useGet<any[]>(path);
  const [open, setOpen] = useState(false);
  const staff = access.isInstructor || access.isAdmin;
  return (
    <>
      {access.isInstructor && <div className="mb-4 flex justify-end"><Button onClick={() => setOpen(true)}><Plus className="size-4" aria-hidden />New assignment</Button></div>}
      <QueryView q={q} empty={<EmptyState title="No assignments" body={access.isInstructor ? 'Create an assignment with a deadline and points.' : 'Nothing has been assigned yet.'} />}>
        {(rows) => (
          <Table head={staff ? ['Assignment', 'Due', 'Points', 'Status', 'Submissions'] : ['Assignment', 'Due', 'Points', 'Your status']}>
            {rows.map((a) => {
              const s = a.submissions?.[0];
              return (
                <tr key={a.id}>
                  <Td><Link to={`/assignments/${a.id}`} className="font-medium text-primary hover:underline">{a.title}</Link></Td>
                  <Td>{fmtDateTime(a.dueAt)}<div className="text-xs text-muted">{fromNow(a.dueAt)}</div></Td>
                  <Td>{a.maxPoints}</Td>
                  {staff ? (<><Td><StatusBadge status={a.status} /></Td><Td>{a._count?.submissions ?? 0}</Td></>) : (
                    <Td>{!s ? (new Date(a.dueAt) < new Date() ? <Badge tone="danger">Missing</Badge> : <Badge tone="warning">To do</Badge>) : s.gradePublishedAt ? <Badge tone="success">{Number(s.score)}/{a.maxPoints}</Badge> : <Badge tone="primary">Submitted{s.isLate ? ' (late)' : ''}</Badge>}</Td>
                  )}
                </tr>
              );
            })}
          </Table>
        )}
      </QueryView>
      {open && <AssignmentForm offeringId={offeringId} onClose={() => setOpen(false)} />}
    </>
  );
}

export function AssignmentForm({ offeringId, onClose, initial }: { offeringId: string; onClose: () => void; initial?: any }) {
  const nav = useNavigate();
  const [f, setF] = useState({
    title: initial?.title ?? '', instructions: initial?.instructions ?? '', dueAt: initial ? toLocalInput(initial.dueAt) : '',
    maxPoints: initial?.maxPoints ?? 100, allowLate: initial?.allowLate ?? false, latePenaltyPct: initial?.latePenaltyPct ?? 0, allowResubmission: initial?.allowResubmission ?? false, publish: false,
  });
  const [files, setFiles] = useState<Uploaded[]>(initial?.files?.map((x: any) => x.fileAsset) ?? []);
  const set = (k: string, v: any) => setF((x) => ({ ...x, [k]: v }));
  const save = useAct(() => {
    const body = { title: f.title, instructions: f.instructions, dueAt: new Date(f.dueAt).toISOString(), maxPoints: Number(f.maxPoints), allowLate: f.allowLate, latePenaltyPct: Number(f.latePenaltyPct), allowResubmission: f.allowResubmission, fileAssetIds: files.map((x) => x.id), ...(initial ? {} : { status: f.publish ? 'PUBLISHED' : 'DRAFT' }) };
    return initial ? send('PATCH', `/assignments/${initial.id}`, body) : send('POST', `/offerings/${offeringId}/assignments`, body);
  }, { success: initial ? 'Assignment updated' : 'Assignment created', invalidate: [`/offerings/${offeringId}/assignments`, '/assignments/'], onDone: (a: any) => { onClose(); if (!initial) nav(`/assignments/${a.id}`); } });
  const errs = fieldErrors(save.error);
  return (
    <Modal open onClose={onClose} title={initial ? 'Edit assignment' : 'New assignment'} wide>
      <form onSubmit={(e) => { e.preventDefault(); save.mutate(); }} className="space-y-4">
        <Input label="Title" required value={f.title} onChange={(e) => set('title', e.target.value)} error={errs.title} />
        <Textarea label="Instructions" required rows={6} value={f.instructions} onChange={(e) => set('instructions', e.target.value)} error={errs.instructions} />
        <div>
          <p className="mb-1.5 text-sm font-medium text-ink">Attachments <span className="font-normal text-muted">(optional)</span></p>
          <FileUpload value={files} onChange={setFiles} accept=".pdf,.docx,.pptx,.png,.jpg,.jpeg,.txt" label="Attach question paper or files" />
          <p className="mt-1 text-xs text-muted">PDF, Word, PowerPoint, images or text · up to 5 files, {MAX_MB} MB each. Students can download them once the assignment is published.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Due date & time" type="datetime-local" required value={f.dueAt} onChange={(e) => set('dueAt', e.target.value)} error={errs.dueAt} />
          <Input label="Maximum points" type="number" min={1} max={1000} required value={f.maxPoints} onChange={(e) => set('maxPoints', e.target.value)} />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Checkbox label="Accept late submissions" checked={f.allowLate} onChange={(v) => set('allowLate', v)} />
          <Checkbox label="Allow resubmission" hint="Every attempt is kept in history." checked={f.allowResubmission} onChange={(v) => set('allowResubmission', v)} />
        </div>
        {f.allowLate && <Input label="Late penalty (%)" type="number" min={0} max={100} value={f.latePenaltyPct} onChange={(e) => set('latePenaltyPct', e.target.value)} hint="Applied to the mark in the gradebook; the raw mark is kept." />}
        {!initial && <Checkbox label="Publish now" hint="Students are notified. Otherwise it stays a draft." checked={f.publish} onChange={(v) => set('publish', v)} />}
        <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" loading={save.isPending}>Save</Button></div>
      </form>
    </Modal>
  );
}
