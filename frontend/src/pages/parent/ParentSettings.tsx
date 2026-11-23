import { useEffect, useState } from 'react';
import { send } from '../../lib/api';
import { useAct, useGet } from '../../lib/hooks';
import { Button, Card, Checkbox, PageHeader, QueryView } from '../../components/ui';

const LABELS: Record<string, string> = { GRADE: 'A grade is published', ASSIGNMENT: 'New assignments', ATTENDANCE: 'Attendance updates', ANNOUNCEMENT: 'College announcements' };

export default function ParentSettings() {
  const path = '/parent/notification-preferences';
  const q = useGet<any[]>(path);
  const [prefs, setPrefs] = useState<any[]>([]);
  useEffect(() => { if (q.data) setPrefs(q.data); }, [q.data]);
  const save = useAct(() => send('PATCH', path, { preferences: prefs }), { success: 'Preferences saved', invalidate: [path] });
  return (
    <>
      <PageHeader title="Notification settings" />
      <Card className="max-w-lg">
        <QueryView q={q}>{() => (
          <form onSubmit={(e) => { e.preventDefault(); save.mutate(); }} className="space-y-3">
            {prefs.map((p) => <Checkbox key={p.type} label={LABELS[p.type] ?? p.type} checked={p.enabled} onChange={(v) => setPrefs(prefs.map((x) => (x.type === p.type ? { ...x, enabled: v } : x)))} />)}
            <Button type="submit" loading={save.isPending}>Save</Button>
          </form>
        )}</QueryView>
      </Card>
    </>
  );
}
