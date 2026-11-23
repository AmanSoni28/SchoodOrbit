import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Check, Download, Info, Lightbulb, X } from 'lucide-react';
import { downloadUrl, send } from '../../../lib/api';
import { useAct, useGet } from '../../../lib/hooks';
import { fmtDate, fmtDateTime, pct } from '../../../lib/format';
import { Badge, Button, Card, EmptyState, Input, QueryView, Table, Td, cx } from '../../../components/ui';
import type { TabProps } from '../OfferingPage';

const iso = (d: Date) => d.toISOString().slice(0, 10);

function Metric({ label, m }: { label: string; m: any }) {
  return (
    <div className="rounded-2xl border border-line bg-white p-4">
      <div className="flex items-center justify-between text-sm text-muted">{label}{m.lowData && <Badge tone="warning">Low data</Badge>}</div>
      <div className="mt-2 text-2xl font-bold text-navy">{m.value === null ? '—' : typeof m.denominator === 'number' ? `${m.value}%` : m.value}</div>
      <div className="mt-1 text-xs text-muted">{typeof m.denominator === 'number' ? `${m.numerator} / ${m.denominator} · ` : ''}{m.population}</div>
    </div>
  );
}

// Accessible heat cell: colour + the number + a text label (never colour alone).
function Heat({ m }: { m: any }) {
  if (m.value === null) return <span className="text-muted">No data</span>;
  const tone = m.value < 50 ? 'bg-danger/15 text-danger' : m.value < 70 ? 'bg-gold/25 text-[#7a5310]' : 'bg-accent/15 text-success';
  const word = m.value < 50 ? 'Weak' : m.value < 70 ? 'Developing' : 'Strong';
  return <span className={cx('inline-flex rounded-md px-2 py-1 text-xs font-semibold', tone)}>{m.value}% · {word}{m.lowData ? ' (low data)' : ''} <span className="ml-1 font-normal">n={m.denominator}</span></span>;
}

export default function InsightsTab({ offeringId, access }: TabProps) {
  const [range, setRange] = useState({ from: iso(new Date(Date.now() - 90 * 86400000)), to: iso(new Date()) });
  const qs = `?from=${range.from}&to=${range.to}`;
  const base = `/analytics/offerings/${offeringId}`;
  const ov = useGet<any>(`${base}/overview${qs}`);
  const topics = useGet<any[]>(`${base}/topics${qs}`);
  const wrong = useGet<any[]>(`${base}/wrong-answers${qs}`);
  const students = useGet<any[]>(`${base}/students${qs}`);
  const trends = useGet<any>(`${base}/doubt-trends${qs}`);
  const recs = useGet<any>(`${base}/recommendations${qs}`);
  const saveRec = useAct((s: any) => send('POST', `${base}/recommendations`, s), { success: 'Saved to your action list', invalidate: [`${base}/recommendations`] });
  const setRec = useAct(({ id, status }: { id: string; status: string }) => send('PATCH', `/analytics/recommendations/${id}`, { status }), { invalidate: [`${base}/recommendations`] });
  const maxWeek = Math.max(1, ...(trends.data?.weekly ?? []).map((w: any) => w.posted));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-40"><Input label="From" type="date" value={range.from} max={range.to} onChange={(e) => setRange({ ...range, from: e.target.value })} /></div>
        <div className="w-40"><Input label="To" type="date" value={range.to} min={range.from} onChange={(e) => setRange({ ...range, to: e.target.value })} /></div>
        <div className="flex-1" />
        <a href={downloadUrl(`${base}/export${qs}`)} className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-white px-3 py-2 text-sm font-medium hover:bg-cloud"><Download className="size-4" aria-hidden />Export student table</a>
      </div>
      <QueryView q={ov}>
        {(o) => (
          <>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
              <Metric label="Quiz accuracy" m={o.quizAccuracy} />
              <Metric label="Submission rate" m={o.submissionRate} />
              <Metric label="Lesson completion" m={o.lessonCompletion} />
              <Metric label="Unanswered doubts" m={o.unansweredDoubts} />
              <Metric label="Learning activity" m={o.learningActivity} />
            </div>
            <p className="flex items-center gap-1.5 text-xs text-muted"><Info className="size-3.5" aria-hidden />{o.students} enrolled students · {fmtDate(o.range.from)} – {fmtDate(o.range.to)} · calculated {fmtDateTime(o.generatedAt)}. Low LMS activity is not proof of low effort.</p>
          </>
        )}
      </QueryView>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Topic performance">
          <QueryView q={topics} empty={<EmptyState title="No topics yet" body="Tag lessons and questions with topics to see per-topic performance." />}>
            {(rows) => (
              <Table head={['Topic', 'Quiz accuracy', 'Practice', 'Doubts']}>
                {rows.map((t) => <tr key={t.topicId}><Td className="font-medium">{t.name}</Td><Td><Heat m={t.quizAccuracy} /></Td><Td><Heat m={t.practiceAccuracy} /></Td><Td>{t.doubts}</Td></tr>)}
              </Table>
            )}
          </QueryView>
        </Card>
        <Card title="Suggested actions">
          <QueryView q={recs}>
            {(r) => (
              <div className="space-y-4">
                {r.suggestions.length === 0 ? <p className="text-sm text-muted">No suggestions — no metric with enough data crossed a threshold.</p> : (
                  <ul className="space-y-2">{r.suggestions.map((s: any, i: number) => (
                    <li key={i} className="flex items-start gap-3 rounded-xl border border-line p-3 text-sm">
                      <Lightbulb className="mt-0.5 size-4 shrink-0 text-gold" aria-hidden />
                      <div className="flex-1"><div className="font-medium">{s.title}</div><div className="text-xs text-muted">Evidence: {Object.entries(s.evidence).filter(([k]) => k !== 'doubtId').map(([k, v]) => `${k}=${v}`).join(', ')}</div></div>
                      {access.isInstructor && <Button size="sm" variant="secondary" onClick={() => saveRec.mutate(s)}>Save</Button>}
                    </li>
                  ))}</ul>
                )}
                {r.saved.length > 0 && (
                  <div><h3 className="mb-2 text-sm font-semibold">Saved actions</h3>
                    <ul className="space-y-2">{r.saved.map((s: any) => (
                      <li key={s.id} className="flex items-center gap-2 text-sm">
                        <span className={cx('flex-1', s.status !== 'OPEN' && 'text-muted line-through')}>{s.title}</span>
                        {access.isInstructor && s.status === 'OPEN' && (<>
                          <button onClick={() => setRec.mutate({ id: s.id, status: 'DONE' })} className="rounded p-1 hover:bg-cloud" aria-label="Mark done"><Check className="size-4 text-success" /></button>
                          <button onClick={() => setRec.mutate({ id: s.id, status: 'DISMISSED' })} className="rounded p-1 hover:bg-cloud" aria-label="Dismiss"><X className="size-4 text-muted" /></button>
                        </>)}
                      </li>
                    ))}</ul>
                  </div>
                )}
              </div>
            )}
          </QueryView>
        </Card>
      </div>

      <Card title="Students">
        <QueryView q={students} empty={<EmptyState title="No enrolled students" />}>
          {(rows) => (
            <>
              <p className="mb-3 text-xs text-muted">"Needs attention" appears only when at least two transparent rules match (completion &lt; 50%, quiz average &lt; 40%, 2+ missing assignments). It is a prompt to check in — never an automatic decision.</p>
              <Table head={['Student', 'Completion', 'Quiz avg', 'Missing', 'Last activity', 'Flags']}>
                {rows.map((s) => (
                  <tr key={s.student.id}>
                    <Td className="font-medium">{s.student.firstName} {s.student.lastName}</Td>
                    <Td>{pct(s.completionPct)}</Td><Td>{pct(s.quizAvg)}</Td><Td>{s.missing}/{s.assignmentsDue}</Td>
                    <Td>{s.lastActivity ? fmtDate(s.lastActivity) : '—'}</Td>
                    <Td>{s.needsAttention ? <span title={s.reasons.join('\n')}><Badge tone="warning"><AlertTriangle className="size-3" aria-hidden />Needs attention</Badge><span className="sr-only">: {s.reasons.join('; ')}</span></span> : s.reasons.length ? <span className="text-xs text-muted">{s.reasons[0]}</span> : <span className="text-xs text-muted">—</span>}</Td>
                  </tr>
                ))}
              </Table>
            </>
          )}
        </QueryView>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Most-missed questions">
          <QueryView q={wrong} empty={<p className="text-sm text-muted">No incorrect answers in this period.</p>}>
            {(rows) => (
              <ul className="space-y-3">{rows.map((w) => (
                <li key={w.questionVersionId} className="text-sm">
                  <div className="flex justify-between gap-3"><span className="font-medium">{w.prompt}</span><span className="shrink-0 font-semibold text-danger">{w.wrongRate}% wrong</span></div>
                  <div className="text-xs text-muted">{w.wrong} of {w.total} answers{w.mostCommonWrong ? ` · most common wrong choice: "${w.mostCommonWrong.text}" (${w.mostCommonWrong.count})` : ''}{w.lowData ? ' · low data' : ''}</div>
                </li>
              ))}</ul>
            )}
          </QueryView>
        </Card>
        <Card title="Doubt trends">
          <QueryView q={trends}>
            {(t) => (
              <div className="space-y-5">
                {t.weekly.length === 0 ? <p className="text-sm text-muted">No doubts in this period.</p> : (
                  <figure>
                    <figcaption className="mb-2 text-xs text-muted">Doubts posted per week (teal = answered)</figcaption>
                    <ul className="space-y-1.5">{t.weekly.map((w: any) => (
                      <li key={w.week} className="flex items-center gap-2 text-xs">
                        <span className="w-20 shrink-0 text-muted">{fmtDate(w.week)}</span>
                        <span className="relative h-4 flex-1 rounded bg-cloud" aria-hidden>
                          <span className="absolute inset-y-0 left-0 rounded bg-primary/30" style={{ width: `${(w.posted / maxWeek) * 100}%` }} />
                          <span className="absolute inset-y-0 left-0 rounded bg-accent" style={{ width: `${(w.answered / maxWeek) * 100}%` }} />
                        </span>
                        <span className="w-24 shrink-0">{w.posted} posted, {w.answered} answered</span>
                      </li>
                    ))}</ul>
                  </figure>
                )}
                {t.topUnanswered.length > 0 && (
                  <div><h3 className="mb-1 text-sm font-semibold">Top unanswered</h3><ul className="space-y-1 text-sm">{t.topUnanswered.map((d: any) => <li key={d.id}><Link to={`/doubts/${d.id}`} className="text-primary hover:underline">{d.title}</Link> <span className="text-xs text-muted">({d.votes} votes)</span></li>)}</ul></div>
                )}
              </div>
            )}
          </QueryView>
        </Card>
      </div>
    </div>
  );
}
