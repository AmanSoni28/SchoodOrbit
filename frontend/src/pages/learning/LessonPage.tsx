import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { CheckCircle2, ChevronLeft, Download, ExternalLink, HelpCircle, Link2, Pencil, Trash2 } from 'lucide-react';
import { fileUrl, send } from '../../lib/api';
import { useAct, useGet } from '../../lib/hooks';
import { bytes, toLocalInput } from '../../lib/format';
import { Markdown } from '../../components/Markdown';
import { FileUpload, type Uploaded } from '../../components/FileUpload';
import { Badge, Button, Card, Checkbox, Input, Modal, QueryView, Select, StatusBadge, Textarea, useConfirm } from '../../components/ui';

// YouTube/Vimeo links render as an embed; direct video files use <video>; anything else is a link.
function VideoBlock({ url }: { url: string }) {
  const yt = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]{11})/);
  const vimeo = url.match(/vimeo\.com\/(\d+)/);
  const src = yt ? `https://www.youtube-nocookie.com/embed/${yt[1]}` : vimeo ? `https://player.vimeo.com/video/${vimeo[1]}` : null;
  if (src) return <div className="aspect-video overflow-hidden rounded-xl bg-navy"><iframe src={src} title="Lesson video" className="size-full" allow="encrypted-media; picture-in-picture" allowFullScreen /></div>;
  if (/\.(mp4|webm)$/i.test(url)) return <video src={url} controls className="w-full rounded-xl bg-navy" />;
  return <a href={url} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1.5 text-sm font-medium text-primary"><ExternalLink className="size-4" aria-hidden />Open video</a>;
}

export default function LessonPage() {
  const { id } = useParams() as { id: string };
  const path = `/lessons/${id}`;
  const q = useGet<any>(path);
  const [editing, setEditing] = useState(false);
  const complete = useAct(() => send('POST', `/lessons/${id}/complete`), { success: 'Marked as complete', invalidate: [path, '/offerings/'] });
  return (
    <QueryView q={q} rows={6}>
      {(l) => {
        const done = l.progress?.length > 0;
        return (
          <>
            <Link to={`/offerings/${l.offeringId}`} className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-ink"><ChevronLeft className="size-4" aria-hidden />{l.module.title}</Link>
            <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
              <article className="min-w-0 space-y-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h1 className="text-2xl font-bold text-navy">{l.title}</h1>
                    <div className="mt-2 flex flex-wrap gap-2">{l.topics.map((t: any) => <Badge key={t.topic.id} tone="primary">{t.topic.name}</Badge>)}{(l.access.isInstructor || l.access.isAdmin) && <StatusBadge status={l.status} />}</div>
                  </div>
                  {l.access.isInstructor && <Button variant="secondary" onClick={() => setEditing(true)}><Pencil className="size-4" aria-hidden />Edit lesson</Button>}
                </div>
                {l.videoUrl && <VideoBlock url={l.videoUrl} />}
                {l.learningOutcomes && <Card title="Learning outcomes"><p className="whitespace-pre-wrap text-sm">{l.learningOutcomes}</p></Card>}
                <Card>{l.content.trim() ? <Markdown text={l.content} /> : <p className="text-sm text-muted">No written content yet.</p>}</Card>
              </article>
              <aside className="space-y-4">
                {l.access.isStudent && (
                  <Card>
                    {done ? <p className="flex items-center gap-2 font-medium text-success"><CheckCircle2 className="size-5" aria-hidden />Completed</p> : <Button className="w-full" variant="accent" loading={complete.isPending} onClick={() => complete.mutate()}>Mark as complete</Button>}
                    <Link to={`/offerings/${l.offeringId}?tab=doubts`} className="mt-3 flex items-center gap-1.5 text-sm font-medium text-primary"><HelpCircle className="size-4" aria-hidden />Ask an anonymous doubt</Link>
                  </Card>
                )}
                <Resources lesson={l} />
              </aside>
            </div>
            {editing && <LessonEditor lesson={l} onClose={() => setEditing(false)} />}
          </>
        );
      }}
    </QueryView>
  );
}

function Resources({ lesson }: { lesson: any }) {
  const path = `/lessons/${lesson.id}`;
  const [adding, setAdding] = useState<'LINK' | 'FILE' | null>(null);
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [files, setFiles] = useState<Uploaded[]>([]);
  const { confirm, dialog } = useConfirm();
  const reset = () => { setAdding(null); setTitle(''); setUrl(''); setFiles([]); };
  const add = useAct(() => send('POST', `${path}/resources`, adding === 'LINK' ? { type: 'LINK', title, url } : { type: 'FILE', title: title || files[0]?.originalName, fileAssetId: files[0]?.id }), { success: 'Resource added', invalidate: [path], onDone: reset });
  const remove = useAct((rid: string) => send('DELETE', `/resources/${rid}`), { success: 'Resource removed', invalidate: [path] });
  return (
    <Card title="Resources">
      {lesson.resources.length === 0 ? <p className="text-sm text-muted">No resources attached.</p> : (
        <ul className="space-y-2">{lesson.resources.map((r: any) => (
          <li key={r.id} className="flex items-center gap-2 text-sm">
            {r.type === 'LINK' ? <Link2 className="size-4 shrink-0 text-muted" aria-hidden /> : <Download className="size-4 shrink-0 text-muted" aria-hidden />}
            <a href={r.type === 'LINK' ? r.url : fileUrl(r.fileAsset.id)} target="_blank" rel="noreferrer noopener" className="flex-1 truncate font-medium text-primary hover:underline">{r.title}</a>
            {r.fileAsset && <span className="text-xs text-muted">{bytes(r.fileAsset.size)}</span>}
            {lesson.access.isInstructor && <button onClick={async () => (await confirm({ title: 'Remove resource?', body: `"${r.title}" will no longer be visible to students.`, confirm: 'Remove', danger: true })) && remove.mutate(r.id)} className="rounded p-1 text-muted hover:bg-cloud" aria-label={`Remove ${r.title}`}><Trash2 className="size-4" /></button>}
          </li>
        ))}</ul>
      )}
      {lesson.access.isInstructor && (
        <div className="mt-4 flex gap-2"><Button size="sm" variant="secondary" onClick={() => setAdding('FILE')}>Upload file</Button><Button size="sm" variant="secondary" onClick={() => setAdding('LINK')}>Add link</Button></div>
      )}
      <Modal open={!!adding} onClose={reset} title={adding === 'LINK' ? 'Add a link' : 'Upload a file'}>
        <form onSubmit={(e) => { e.preventDefault(); add.mutate(); }} className="space-y-4">
          <Input label="Title" required={adding === 'LINK'} value={title} onChange={(e) => setTitle(e.target.value)} />
          {adding === 'LINK' ? <Input label="URL" type="url" required value={url} onChange={(e) => setUrl(e.target.value)} /> : <FileUpload value={files} onChange={setFiles} max={1} accept=".pdf,.pptx,.docx,.png,.jpg,.jpeg,.webp,.txt" label="Choose file" />}
          <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={reset}>Cancel</Button><Button type="submit" loading={add.isPending} disabled={adding === 'FILE' && !files.length}>Add</Button></div>
        </form>
      </Modal>
      {dialog}
    </Card>
  );
}

function LessonEditor({ lesson, onClose }: { lesson: any; onClose: () => void }) {
  const topics = useGet<any[]>(`/offerings/${lesson.offeringId}/topics`);
  const [f, setF] = useState({
    title: lesson.title, content: lesson.content, videoUrl: lesson.videoUrl ?? '', learningOutcomes: lesson.learningOutcomes ?? '', status: lesson.status,
    publishAt: toLocalInput(lesson.publishAt), isRequired: lesson.isRequired, topicIds: lesson.topics.map((t: any) => t.topic.id) as string[],
  });
  const save = useAct(() => send('PATCH', `/lessons/${lesson.id}`, {
    title: f.title, content: f.content, videoUrl: f.videoUrl || null, learningOutcomes: f.learningOutcomes || null, status: f.status,
    publishAt: f.publishAt ? new Date(f.publishAt).toISOString() : null, isRequired: f.isRequired, topicIds: f.topicIds,
  }), { success: 'Lesson saved', invalidate: [`/lessons/${lesson.id}`, `/offerings/${lesson.offeringId}/modules`], onDone: onClose });
  return (
    <Modal open onClose={onClose} title="Edit lesson" wide>
      <form onSubmit={(e) => { e.preventDefault(); save.mutate(); }} className="space-y-4">
        <Input label="Title" required value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
        <Textarea label="Content" rows={12} value={f.content} onChange={(e) => setF({ ...f, content: e.target.value })} hint="Supports ## headings, ### sub-headings, - bullet lists, **bold** and `code`." className="font-mono text-[13px]" />
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Video URL" type="url" value={f.videoUrl} onChange={(e) => setF({ ...f, videoUrl: e.target.value })} hint="YouTube, Vimeo, or a direct .mp4 link" />
          <Textarea label="Learning outcomes" rows={2} value={f.learningOutcomes} onChange={(e) => setF({ ...f, learningOutcomes: e.target.value })} />
          <Select label="Status" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}><option value="DRAFT">Draft</option><option value="SCHEDULED">Scheduled</option><option value="PUBLISHED">Published</option><option value="ARCHIVED">Archived</option></Select>
          {f.status === 'SCHEDULED' && <Input label="Publish at" type="datetime-local" required value={f.publishAt} onChange={(e) => setF({ ...f, publishAt: e.target.value })} />}
        </div>
        <Checkbox label="Required for completion" checked={f.isRequired} onChange={(v) => setF({ ...f, isRequired: v })} />
        <fieldset><legend className="mb-2 text-sm font-medium">Topics (used by insights and daily revision)</legend>
          <div className="flex flex-wrap gap-2">{topics.data?.map((t) => (
            <label key={t.id} className="flex items-center gap-1.5 rounded-full border border-line px-3 py-1 text-sm"><input type="checkbox" checked={f.topicIds.includes(t.id)} onChange={(e) => setF({ ...f, topicIds: e.target.checked ? [...f.topicIds, t.id] : f.topicIds.filter((x) => x !== t.id) })} />{t.name}</label>
          ))}{topics.data?.length === 0 && <span className="text-sm text-muted">Create topics in the Question bank.</span>}</div>
        </fieldset>
        <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" loading={save.isPending}>Save lesson</Button></div>
      </form>
    </Modal>
  );
}
