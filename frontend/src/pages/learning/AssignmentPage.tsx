import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ChevronLeft, Clock, Download } from 'lucide-react';
import { fileUrl, send } from '../../lib/api';
import { useAct, useGet } from '../../lib/hooks';
import { fmtDateTime, fromNow } from '../../lib/format';
import { FileUpload, type Uploaded } from '../../components/FileUpload';
import { Badge, Button, Card, Checkbox, EmptyState, Input, Modal, QueryView, StatusBadge, Table, Td, Textarea, useConfirm } from '../../components/ui';
import { AssignmentForm } from '../courses/tabs/AssignmentsTab';

const Files = ({ files }: { files: any[] }) => files.length ? (
  <ul className="mt-2 space-y-1">{files.map((f) => <li key={f.fileAsset.id}><a href={fileUrl(f.fileAsset.id)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm text-primary hover:underline"><Download className="size-3.5" aria-hidden />{f.fileAsset.originalName}</a></li>)}</ul>
) : null;

export default function AssignmentPage() {
  const { id } = useParams() as { id: string };
  const q = useGet<any>(`/assignments/${id}`);
  const [editing, setEditing] = useState(false);
  return (
    <QueryView q={q} rows={5}>
      {(a) => (
        <>
          <Link to={`/offerings/${a.offeringId}?tab=assignments`} className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-ink"><ChevronLeft className="size-4" aria-hidden />Assignments</Link>
          <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold text-navy">{a.title}</h1>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted">
                <Clock className="size-4" aria-hidden />Due {fmtDateTime(a.dueAt)} ({fromNow(a.dueAt)}) · {a.maxPoints} points
                {a.allowLate && <Badge>Late accepted{a.latePenaltyPct ? ` (−${a.latePenaltyPct}%)` : ''}</Badge>}
                {(a.access.isInstructor || a.access.isAdmin) && <StatusBadge status={a.status} />}
              </div>
            </div>
            {a.access.isInstructor && <Button variant="secondary" onClick={() => setEditing(true)}>Edit</Button>}
          </div>
          <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
            <Card title="Instructions"><p className="whitespace-pre-wrap text-sm leading-relaxed">{a.instructions}</p></Card>
            {a.access.isStudent && <StudentPanel a={a} />}
          </div>
          {(a.access.isInstructor || a.access.isAdmin) && <Submissions a={a} />}
          {editing && <EditAssignment a={a} onClose={() => setEditing(false)} />}
        </>
      )}
    </QueryView>
  );
}

function EditAssignment({ a, onClose }: { a: any; onClose: () => void }) {
  const setStatus = useAct((status: string) => send('PATCH', `/assignments/${a.id}`, { status }), { success: 'Status updated', invalidate: [`/assignments/${a.id}`, `/offerings/${a.offeringId}/assignments`], onDone: onClose });
  const [mode, setMode] = useState<'menu' | 'form'>('menu');
  if (mode === 'form') return <AssignmentForm offeringId={a.offeringId} initial={a} onClose={onClose} />;
  return (
    <Modal open onClose={onClose} title="Assignment">
      <p className="mb-3 text-sm text-muted">Current status: <StatusBadge status={a.status} /></p>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={() => setMode('form')}>Edit details</Button>
        {a.status === 'DRAFT' && <Button onClick={() => setStatus.mutate('PUBLISHED')}>Publish & notify</Button>}
        {a.status === 'PUBLISHED' && <Button variant="secondary" onClick={() => setStatus.mutate('CLOSED')}>Close submissions</Button>}
        {a.status === 'CLOSED' && <Button variant="secondary" onClick={() => setStatus.mutate('PUBLISHED')}>Reopen</Button>}
      </div>
    </Modal>
  );
}

function StudentPanel({ a }: { a: any }) {
  const latest = a.mySubmissions[0];
  const [content, setContent] = useState('');
  const [files, setFiles] = useState<Uploaded[]>([]);
  const { confirm, dialog } = useConfirm();
  const submit = useAct(() => send('POST', `/assignments/${a.id}/submissions`, { content, fileAssetIds: files.map((f) => f.id) }), { success: 'Submitted', invalidate: [`/assignments/${a.id}`, `/offerings/${a.offeringId}`, '/dashboard'], onDone: () => { setContent(''); setFiles([]); } });
  const late = new Date() > new Date(a.dueAt);
  const canSubmit = a.status === 'PUBLISHED' && (!late || a.allowLate) && (!latest || (a.allowResubmission && !latest.gradePublishedAt));
  return (
    <div className="space-y-4">
      {latest && (
        <Card title="Your submission">
          <div className="flex flex-wrap items-center gap-2 text-sm"><StatusBadge status={latest.gradePublishedAt ? 'GRADED' : 'SUBMITTED'} />{latest.isLate && <Badge tone="warning">Late</Badge>}<span className="text-muted">Attempt {latest.attemptNo} · {fmtDateTime(latest.submittedAt)}</span></div>
          {latest.content && <p className="mt-3 whitespace-pre-wrap rounded-lg bg-cloud p-3 text-sm">{latest.content}</p>}
          <Files files={latest.files} />
          {latest.gradePublishedAt ? (
            <div className="mt-4 rounded-xl border border-accent/30 bg-accent/5 p-3">
              <div className="text-lg font-bold text-navy">{Number(latest.score)} / {a.maxPoints}{latest.isLate && a.latePenaltyPct ? <span className="ml-2 text-xs font-normal text-muted">late penalty of {a.latePenaltyPct}% applies in the gradebook</span> : null}</div>
              {latest.feedback && <p className="mt-1 whitespace-pre-wrap text-sm">{latest.feedback}</p>}
            </div>
          ) : <p className="mt-3 text-xs text-muted">Your grade will appear here once your instructor publishes it.</p>}
        </Card>
      )}
      {canSubmit ? (
        <Card title={latest ? 'Resubmit' : 'Submit your work'}>
          <form onSubmit={async (e) => { e.preventDefault(); if (await confirm({ title: 'Submit assignment?', body: late ? 'The deadline has passed — this will be marked late.' : 'Your submission is timestamped by the server.', confirm: 'Submit' })) submit.mutate(); }} className="space-y-3">
            {late && <p className="rounded-lg bg-gold/15 p-2 text-xs">The deadline has passed. This submission will be marked late.</p>}
            <Textarea label="Answer / notes" rows={6} value={content} onChange={(e) => setContent(e.target.value)} />
            <FileUpload value={files} onChange={setFiles} accept=".pdf,.docx,.pptx,.png,.jpg,.jpeg,.txt" />
            <Button type="submit" className="w-full" loading={submit.isPending} disabled={!content.trim() && !files.length}>Submit</Button>
          </form>
          {dialog}
        </Card>
      ) : !latest && <Card><p className="text-sm text-muted">{a.status !== 'PUBLISHED' ? 'This assignment is closed.' : 'The deadline has passed and late submissions are not accepted.'}</p></Card>}
    </div>
  );
}

function Submissions({ a }: { a: any }) {
  const path = `/assignments/${a.id}/submissions`;
  const q = useGet<any>(path);
  const [grading, setGrading] = useState<any>(null);
  const publishAll = useAct(() => send('POST', `/assignments/${a.id}/publish-grades`), { success: 'Grades published to students', invalidate: [path] });
  return (
    <Card className="mt-6" title="Submissions" action={a.access.isInstructor && <Button size="sm" variant="accent" loading={publishAll.isPending} onClick={() => publishAll.mutate()}>Publish all graded</Button>}>
      <QueryView q={q} empty={<EmptyState title="No students enrolled" />} isEmpty={(d) => d.rows.length === 0}>
        {(d) => (
          <Table head={['Student', 'Submitted', 'Score', 'Status', '']}>
            {d.rows.map((r: any) => (
              <tr key={r.student.id}>
                <Td><div className="font-medium">{r.student.firstName} {r.student.lastName}</div><div className="text-xs text-muted">{r.student.email}</div></Td>
                <Td>{r.latest ? <>{fmtDateTime(r.latest.submittedAt)}{r.latest.isLate && <span className="ml-1"><Badge tone="warning">Late</Badge></span>}{r.attempts > 1 && <div className="text-xs text-muted">{r.attempts} attempts</div>}</> : <Badge tone="danger">Not submitted</Badge>}</Td>
                <Td>{r.latest?.score != null ? `${Number(r.latest.score)}/${a.maxPoints}` : '—'}</Td>
                <Td>{r.latest && (r.latest.gradePublishedAt ? <Badge tone="success">Published</Badge> : r.latest.status === 'GRADED' ? <Badge tone="primary">Graded (hidden)</Badge> : <Badge tone="warning">Needs grading</Badge>)}</Td>
                <Td>{r.latest && a.access.isInstructor && <Button size="sm" variant="secondary" onClick={() => setGrading(r)}>{r.latest.status === 'GRADED' ? 'Regrade' : 'Grade'}</Button>}</Td>
              </tr>
            ))}
          </Table>
        )}
      </QueryView>
      {grading && <GradeModal a={a} row={grading} onClose={() => setGrading(null)} />}
    </Card>
  );
}

function GradeModal({ a, row, onClose }: { a: any; row: any; onClose: () => void }) {
  const s = row.latest;
  const rubric: { criterion: string; points: number }[] = Array.isArray(a.rubric) ? a.rubric : [];
  const [score, setScore] = useState(s.score != null ? String(Number(s.score)) : '');
  const [feedback, setFeedback] = useState(s.feedback ?? '');
  const [publish, setPublish] = useState(true);
  const save = useAct(() => send('PATCH', `/submissions/${s.id}/grade`, { score: Number(score), feedback, publish }), { success: publish ? 'Grade published' : 'Grade saved (not yet visible)', invalidate: [`/assignments/${a.id}`], onDone: onClose });
  return (
    <Modal open onClose={onClose} title={`Grade — ${row.student.firstName} ${row.student.lastName}`} wide>
      <div className="mb-4 max-h-72 overflow-y-auto rounded-xl bg-cloud p-4 text-sm">
        <div className="mb-2 text-xs text-muted">Attempt {s.attemptNo} · {fmtDateTime(s.submittedAt)}{s.isLate ? ' · late' : ''}</div>
        {s.content ? <p className="whitespace-pre-wrap">{s.content}</p> : <p className="text-muted">No text.</p>}
        <Files files={s.files} />
      </div>
      {rubric.length > 0 && <ul className="mb-3 text-xs text-muted">{rubric.map((r) => <li key={r.criterion}>{r.criterion} — {r.points} pts</li>)}</ul>}
      <form onSubmit={(e) => { e.preventDefault(); save.mutate(); }} className="space-y-4">
        <Input label={`Score (out of ${a.maxPoints})`} type="number" step="0.5" min={0} max={a.maxPoints} required value={score} onChange={(e) => setScore(e.target.value)} hint="Changes are kept in the grade history (audit log)." />
        <Textarea label="Feedback" rows={4} value={feedback} onChange={(e) => setFeedback(e.target.value)} />
        <Checkbox label="Publish to student now" checked={publish} onChange={setPublish} />
        <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" loading={save.isPending}>Save grade</Button></div>
      </form>
    </Modal>
  );
}
