import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, Circle, FileText, FolderPlus, Plus } from 'lucide-react';
import { send } from '../../../lib/api';
import { useAct, useGet } from '../../../lib/hooks';
import { Button, Card, EmptyState, Input, Modal, QueryView, StatusBadge } from '../../../components/ui';
import type { TabProps } from '../OfferingPage';

export default function ContentTab({ offeringId, access }: TabProps) {
  const path = `/offerings/${offeringId}/modules`;
  const q = useGet<any[]>(path);
  const [modal, setModal] = useState<{ kind: 'module' } | { kind: 'lesson'; moduleId: string } | null>(null);
  const [title, setTitle] = useState('');
  const close = () => { setModal(null); setTitle(''); };
  const addModule = useAct(() => send('POST', path, { title }), { success: 'Module added', invalidate: [path], onDone: close });
  const addLesson = useAct((moduleId: string) => send('POST', `/modules/${moduleId}/lessons`, { title }), { success: 'Lesson created as draft', invalidate: [path], onDone: close });

  return (
    <>
      {access.isInstructor && <div className="mb-4 flex justify-end"><Button onClick={() => setModal({ kind: 'module' })}><FolderPlus className="size-4" aria-hidden />Add module</Button></div>}
      <QueryView q={q} empty={<EmptyState title="No lessons yet" body={access.isInstructor ? 'Create a module, then add lessons to it.' : 'Your instructor has not published lessons yet.'} />}
        isEmpty={(d) => d.length === 0 || (!access.isInstructor && d.every((m: any) => m.lessons.length === 0))}>
        {(modules) => (
          <div className="space-y-4">
            {modules.filter((m) => access.isInstructor || access.isAdmin || m.lessons.length).map((m) => (
              <Card key={m.id} title={m.title} action={access.isInstructor && <Button size="sm" variant="secondary" onClick={() => setModal({ kind: 'lesson', moduleId: m.id })}><Plus className="size-4" aria-hidden />Lesson</Button>}>
                {m.lessons.length === 0 ? <p className="text-sm text-muted">No lessons in this module.</p> : (
                  <ol className="divide-y divide-line">
                    {m.lessons.map((l: any, i: number) => {
                      const done = l.progress?.length > 0;
                      return (
                        <li key={l.id}>
                          <Link to={`/lessons/${l.id}`} className="flex items-center gap-3 py-3 hover:text-primary">
                            {access.isStudent ? (done ? <CheckCircle2 className="size-5 shrink-0 text-accent" aria-label="Completed" /> : <Circle className="size-5 shrink-0 text-line" aria-label="Not completed" />) : <FileText className="size-5 shrink-0 text-muted" aria-hidden />}
                            <span className="flex-1 font-medium">{i + 1}. {l.title}</span>
                            {!l.isRequired && <span className="text-xs text-muted">Optional</span>}
                            {(access.isInstructor || access.isAdmin) && <StatusBadge status={l.status} />}
                          </Link>
                        </li>
                      );
                    })}
                  </ol>
                )}
              </Card>
            ))}
          </div>
        )}
      </QueryView>
      <Modal open={!!modal} onClose={close} title={modal?.kind === 'module' ? 'New module' : 'New lesson'}>
        <form onSubmit={(e) => { e.preventDefault(); modal?.kind === 'module' ? addModule.mutate() : modal && addLesson.mutate(modal.moduleId); }} className="space-y-4">
          <Input label="Title" required autoFocus value={title} onChange={(e) => setTitle(e.target.value)} />
          {modal?.kind === 'lesson' && <p className="text-xs text-muted">Lessons start as drafts. Add content and publish from the lesson page.</p>}
          <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={close}>Cancel</Button><Button type="submit" loading={addModule.isPending || addLesson.isPending}>Create</Button></div>
        </form>
      </Modal>
    </>
  );
}
