import { useEffect, useState } from 'react';
import { send } from '../../../lib/api';
import { useAct, useGet } from '../../../lib/hooks';
import { Button, Card, Checkbox, Input, QueryView, Select, useConfirm } from '../../../components/ui';
import type { TabProps } from '../OfferingPage';

export default function SettingsTab({ offeringId, access, offering }: TabProps) {
  const inv = [`/offerings/${offeringId}`];
  const [w, setW] = useState(offering.gradingWeights as { assignments: number; quizzes: number });
  const [meetingUrl, setMeetingUrl] = useState(offering.meetingUrl ?? '');
  const saveOffering = useAct((body: object) => send('PATCH', `/offerings/${offeringId}`, body), { success: 'Course settings saved', invalidate: inv });
  const { confirm, dialog } = useConfirm();
  const ro = !access.isInstructor;

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {access.isAdmin && (
        <Card title="Offering status">
          <p className="mb-3 text-sm text-muted">Students only see the course when it is published. Archiving keeps all records.</p>
          <div className="flex flex-wrap gap-2">
            {['DRAFT', 'PUBLISHED', 'ARCHIVED'].map((s) => (
              <Button key={s} variant={offering.status === s ? 'primary' : 'secondary'} size="sm" disabled={offering.status === s}
                onClick={async () => (s !== 'ARCHIVED' || (await confirm({ title: 'Archive this offering?', body: 'Students will lose access to the course. Grades and submissions are preserved and you can republish later.', confirm: 'Archive', danger: true }))) && saveOffering.mutate({ status: s })}>
                {s[0] + s.slice(1).toLowerCase()}
              </Button>
            ))}
          </div>
        </Card>
      )}
      <Card title="Grading weights">
        <form onSubmit={(e) => { e.preventDefault(); saveOffering.mutate({ gradingWeights: w }); }} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Input label="Assignments (%)" type="number" min={0} max={100} disabled={ro} value={w.assignments} onChange={(e) => setW({ assignments: Number(e.target.value), quizzes: 100 - Number(e.target.value) })} />
            <Input label="Quizzes (%)" type="number" min={0} max={100} disabled={ro} value={w.quizzes} onChange={(e) => setW({ quizzes: Number(e.target.value), assignments: 100 - Number(e.target.value) })} />
          </div>
          {!ro && <Button type="submit" size="sm" loading={saveOffering.isPending}>Save weights</Button>}
        </form>
      </Card>
      <Card title="Live class link">
        <form onSubmit={(e) => { e.preventDefault(); saveOffering.mutate({ meetingUrl: meetingUrl || null }); }} className="space-y-3">
          <Input label="Default meeting URL" type="url" disabled={ro} value={meetingUrl} onChange={(e) => setMeetingUrl(e.target.value)} hint="Shown to enrolled students on the course page." />
          {!ro && <Button type="submit" size="sm">Save link</Button>}
        </form>
      </Card>
      <AIPolicy offeringId={offeringId} readOnly={ro} />
      <RevisionPolicy offeringId={offeringId} readOnly={ro} />
      {dialog}
    </div>
  );
}

function AIPolicy({ offeringId, readOnly }: { offeringId: string; readOnly: boolean }) {
  const path = `/offerings/${offeringId}/ai-policy`;
  const q = useGet<any>(path);
  const [p, setP] = useState<any>(null);
  useEffect(() => { if (q.data) setP(q.data); }, [q.data]);
  const save = useAct(() => send('PUT', path, { homeworkEnabled: p.homeworkEnabled, blockDuringQuizzes: p.blockDuringQuizzes, dailyMessageLimit: Number(p.dailyMessageLimit), contentGenEnabled: p.contentGenEnabled }), { success: 'AI policy saved', invalidate: [path] });
  return (
    <Card title="AI policy">
      <QueryView q={q}>{() => p && (
        <form onSubmit={(e) => { e.preventDefault(); save.mutate(); }} className="space-y-3">
          {!p.configured && <p className="rounded-lg bg-gold/15 p-2 text-xs">AI is not configured on the server yet; these settings apply once it is.</p>}
          <fieldset disabled={readOnly} className="space-y-3">
            <Checkbox label="AI Homework Helper enabled" checked={p.homeworkEnabled} onChange={(v) => setP({ ...p, homeworkEnabled: v })} />
            <Checkbox label="Block the helper while a student has a quiz in progress" checked={p.blockDuringQuizzes} onChange={(v) => setP({ ...p, blockDuringQuizzes: v })} />
            <Input label="Questions per student per day" type="number" min={0} max={500} value={p.dailyMessageLimit} onChange={(e) => setP({ ...p, dailyMessageLimit: e.target.value })} />
            <Checkbox label="AI notes & quiz generator enabled" checked={p.contentGenEnabled} onChange={(v) => setP({ ...p, contentGenEnabled: v })} />
          </fieldset>
          {!readOnly && <Button type="submit" size="sm" loading={save.isPending}>Save AI policy</Button>}
        </form>
      )}</QueryView>
    </Card>
  );
}

function RevisionPolicy({ offeringId, readOnly }: { offeringId: string; readOnly: boolean }) {
  const path = `/offerings/${offeringId}/revision-policy`;
  const q = useGet<any>(path);
  const [p, setP] = useState<any>(null);
  useEffect(() => { if (q.data) setP(q.data); }, [q.data]);
  const save = useAct(() => send('PUT', path, { enabled: p.enabled, questionsPerDay: Number(p.questionsPerDay), topicWindowDays: Number(p.topicWindowDays), showExplanations: p.showExplanations }), { success: 'Revision policy saved', invalidate: [path] });
  return (
    <Card title="Daily revision quiz">
      <QueryView q={q}>{() => p && (
        <form onSubmit={(e) => { e.preventDefault(); save.mutate(); }} className="space-y-3">
          <fieldset disabled={readOnly} className="space-y-3">
            <Checkbox label="Enabled for this course" hint="Uses approved questions on topics of lessons each student completed. Practice scores never affect grades." checked={p.enabled} onChange={(v) => setP({ ...p, enabled: v })} />
            <div className="grid grid-cols-2 gap-3">
              <Input label="Questions per day" type="number" min={1} max={20} value={p.questionsPerDay} onChange={(e) => setP({ ...p, questionsPerDay: e.target.value })} />
              <Input label="Look-back window (days)" type="number" min={1} max={365} value={p.topicWindowDays} onChange={(e) => setP({ ...p, topicWindowDays: e.target.value })} />
            </div>
            <Select label="Show explanations" value={p.showExplanations} onChange={(e) => setP({ ...p, showExplanations: e.target.value })}><option value="AFTER_EACH">After each answer</option><option value="AFTER_SUBMIT">After submitting</option></Select>
          </fieldset>
          {!readOnly && <Button type="submit" size="sm" loading={save.isPending}>Save revision policy</Button>}
        </form>
      )}</QueryView>
    </Card>
  );
}
