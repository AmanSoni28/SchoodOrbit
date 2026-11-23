import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ShieldCheck, Sparkles } from 'lucide-react';
import { send } from '../../../lib/api';
import { useAct, useGet } from '../../../lib/hooks';
import { fmtDateTime } from '../../../lib/format';
import { FileUpload, type Uploaded } from '../../../components/FileUpload';
import { Button, Card, Checkbox, EmptyState, ErrorState, Input, QueryView, Select, StatusBadge, Table, Td, Textarea } from '../../../components/ui';
import type { TabProps } from '../OfferingPage';

const TYPES = { NOTES: 'Study notes', SUMMARY: 'Summary', FLASHCARDS: 'Flashcards', MCQ: 'Multiple-choice questions', DESCRIPTIVE: 'Descriptive questions' };

export default function AIGeneratorTab({ offeringId }: TabProps) {
  const policy = useGet<any>(`/offerings/${offeringId}/ai-policy`);
  const modules = useGet<any[]>(`/offerings/${offeringId}/modules`);
  const jobsPath = `/ai/content/jobs?offeringId=${offeringId}`;
  // Poll while any job is still running.
  const [poll, setPoll] = useState<number | false>(false);
  const jobs = useGet<any[]>(jobsPath, { refetchInterval: poll });
  const running = jobs.data?.some((j) => j.status === 'QUEUED' || j.status === 'PROCESSING');
  if (!!running !== !!poll) setPoll(running ? 3000 : false);

  const [f, setF] = useState({ type: 'NOTES', lessonId: '', useLessonContent: false, count: 5, difficulty: 'MEDIUM', instructions: '' });
  const [files, setFiles] = useState<Uploaded[]>([]);
  const create = useAct(() => send('POST', '/ai/content/jobs', { offeringId, type: f.type, lessonId: f.lessonId || undefined, useLessonContent: f.useLessonContent, count: Number(f.count), difficulty: f.difficulty, instructions: f.instructions || undefined, fileAssetIds: files.map((x) => x.id) }), {
    success: 'Generation started — you will review the draft before anything is published', invalidate: ['/ai/content/jobs'], onDone: () => setFiles([]),
  });
  const lessons = modules.data?.flatMap((m) => m.lessons) ?? [];
  const p = policy.data;

  return (
    <div className="grid gap-6 lg:grid-cols-5">
      <Card className="lg:col-span-2" title={<span className="flex items-center gap-2"><Sparkles className="size-4 text-accent" aria-hidden />Generate draft content</span>}>
        {policy.error ? <ErrorState error={policy.error} /> : p && !p.configured ? (
          <EmptyState title="AI is not configured" body="Your Super Admin needs to add an AI provider key on the server before content can be generated." />
        ) : p && !p.contentGenEnabled ? (
          <EmptyState title="Turned off for this course" body="Enable AI content generation in the Settings tab." />
        ) : (
          <form onSubmit={(e) => { e.preventDefault(); create.mutate(); }} className="space-y-4">
            <Select label="What to generate" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>{Object.entries(TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
            <Select label="Lesson" value={f.lessonId} onChange={(e) => setF({ ...f, lessonId: e.target.value })}><option value="">Not linked to a lesson</option>{lessons.map((l: any) => <option key={l.id} value={l.id}>{l.title}</option>)}</Select>
            {f.lessonId && <Checkbox label="Use this lesson's text as a source" checked={f.useLessonContent} onChange={(v) => setF({ ...f, useLessonContent: v })} />}
            <div><p className="mb-1.5 text-sm font-medium">Source documents (PDF or .txt)</p><FileUpload value={files} onChange={setFiles} accept=".pdf,.txt" max={3} label="Upload source" /></div>
            {['FLASHCARDS', 'MCQ', 'DESCRIPTIVE'].includes(f.type) && (
              <div className="grid grid-cols-2 gap-3">
                <Input label="How many" type="number" min={1} max={30} value={f.count} onChange={(e) => setF({ ...f, count: Number(e.target.value) })} />
                <Select label="Difficulty" value={f.difficulty} onChange={(e) => setF({ ...f, difficulty: e.target.value })}><option>EASY</option><option>MEDIUM</option><option>HARD</option></Select>
              </div>
            )}
            <Textarea label="Notes for the generator (optional)" rows={2} value={f.instructions} onChange={(e) => setF({ ...f, instructions: e.target.value })} hint="e.g. focus on worked examples" />
            <Button type="submit" className="w-full" loading={create.isPending} disabled={!files.length && !f.useLessonContent}>Generate draft</Button>
            <p className="flex gap-2 text-xs text-muted"><ShieldCheck className="size-4 shrink-0 text-accent" aria-hidden />Output is a draft generated only from your sources. You review, edit and approve it; nothing reaches students automatically.</p>
          </form>
        )}
      </Card>
      <Card className="lg:col-span-3" title="Generation jobs">
        <QueryView q={jobs} empty={<EmptyState title="No jobs yet" body="Generated drafts will appear here for review." />}>
          {(rows) => (
            <Table head={['Type', 'Lesson / sources', 'Status', 'Created', '']}>
              {rows.map((j) => (
                <tr key={j.id}>
                  <Td className="font-medium">{TYPES[j.type as keyof typeof TYPES]}</Td>
                  <Td className="text-xs">{j.lesson?.title ?? '—'}<div className="text-muted">{j.sources.map((s: any) => s.fileAsset?.originalName).filter(Boolean).join(', ')}</div></Td>
                  <Td><StatusBadge status={j.status} />{j.drafts[0] && <div className="mt-1"><StatusBadge status={j.drafts[0].reviewStatus} /></div>}</Td>
                  <Td className="text-xs">{fmtDateTime(j.createdAt)}</Td>
                  <Td><Link to={`/ai-content/jobs/${j.id}`} className="text-sm font-medium text-primary">{j.status === 'DRAFT_READY' ? 'Review' : 'Open'}</Link></Td>
                </tr>
              ))}
            </Table>
          )}
        </QueryView>
      </Card>
    </div>
  );
}
