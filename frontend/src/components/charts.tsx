// Lightweight SVG/CSS charts on the design tokens. Each chart carries a text summary for screen readers.
import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';
import { cx } from './ui';

export const PALETTE = ['var(--color-primary)', 'var(--color-accent)', 'var(--color-gold)', '#8b5cf6', '#ef6b73', 'var(--color-navy-2)'];

/** Horizontal bars with labels — best for comparing named items (courses, departments). */
export function BarList({ items, format = (v) => String(v), max, empty = 'No data yet' }: {
  items: { label: ReactNode; value: number | null; href?: string; hint?: ReactNode; color?: string }[];
  format?: (v: number) => string; max?: number; empty?: string;
}) {
  if (items.length === 0) return <p className="py-6 text-center text-sm text-muted">{empty}</p>;
  const top = max ?? Math.max(1, ...items.map((i) => i.value ?? 0));
  return (
    <ul className="space-y-3.5">
      {items.map((it, n) => {
        const w = it.value === null ? 0 : Math.max(2, (it.value / top) * 100);
        const label = <span className="truncate font-medium text-ink">{it.label}</span>;
        return (
          <li key={n}>
            <div className="mb-1.5 flex items-baseline justify-between gap-3 text-sm">
              {it.href ? <Link to={it.href} className="min-w-0 truncate hover:text-primary">{label}</Link> : label}
              <span className="shrink-0 tabular-nums text-muted">{it.value === null ? '—' : format(it.value)}{it.hint && <span className="ml-1 text-xs">{it.hint}</span>}</span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-cloud">
              <div className="h-full rounded-full transition-[width] duration-700" style={{ width: `${w}%`, background: it.color ?? PALETTE[n % PALETTE.length] }} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/** Vertical (optionally stacked) columns over a sequence such as days. */
export function Columns({ data, series, height = 180, label }: {
  data: { label: string; values: number[] }[];
  series: { name: string; color: string }[];
  height?: number; label: string;
}) {
  const totals = data.map((d) => d.values.reduce((a, b) => a + b, 0));
  const top = niceMax(Math.max(1, ...totals));
  const summary = `${label}: ${data.map((d, i) => `${d.label} ${totals[i]}`).join(', ')}`;
  return (
    <figure>
      <div className="flex gap-2" role="img" aria-label={summary}>
        <div className="-my-1.5 flex flex-col justify-between text-right text-[11px] tabular-nums text-muted" style={{ height: height + 12 }} aria-hidden>
          {[top, top / 2, 0].map((v) => <span key={v}>{Math.round(v)}</span>)}
        </div>
        <div className="min-w-0 flex-1" aria-hidden>
          <div className="relative" style={{ height }}>
            <div className="absolute inset-0 flex flex-col justify-between">
              {[0, 1, 2].map((k) => <div key={k} className={cx('border-t', k === 2 ? 'border-line' : 'border-dashed border-line/70')} />)}
            </div>
            <div className="relative flex h-full items-end gap-1.5 sm:gap-2">
              {data.map((d, i) => (
                <div key={d.label} className="group relative flex h-full flex-1 items-end justify-center" title={`${d.label}: ${series.map((s, k) => `${s.name} ${d.values[k]}`).join(', ')}`}>
                  <div className="flex w-full max-w-9 flex-col-reverse overflow-hidden rounded-t-md transition-[height] duration-700" style={{ height: `${(totals[i] / top) * 100}%` }}>
                    {d.values.map((v, s) => <div key={s} style={{ flexGrow: v, background: series[s].color }} className="transition-opacity group-hover:opacity-80" />)}
                  </div>
                  <span className="pointer-events-none absolute left-1/2 hidden -translate-x-1/2 rounded bg-navy px-1.5 py-0.5 text-[11px] font-semibold text-white group-hover:block" style={{ bottom: `calc(${(totals[i] / top) * 100}% + 4px)` }}>{totals[i]}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="mt-1.5 flex gap-1.5 sm:gap-2">
            {data.map((d) => <span key={d.label} className="flex-1 truncate text-center text-[11px] text-muted">{d.label}</span>)}
          </div>
        </div>
      </div>
      {series.length > 1 && <Legend items={series.map((s, i) => ({ label: s.name, color: s.color, value: data.reduce((a, d) => a + d.values[i], 0) }))} className="mt-3 justify-center" />}
    </figure>
  );
}

/** Donut for parts of a whole, with a legend. */
export function Donut({ segments, center, sub, size = 160 }: { segments: { label: string; value: number; color?: string }[]; center?: ReactNode; sub?: ReactNode; size?: number }) {
  const total = segments.reduce((a, s) => a + s.value, 0);
  const r = 42, c = 2 * Math.PI * r;
  let offset = 0;
  const segs = segments.map((s, i) => ({ ...s, color: s.color ?? PALETTE[i % PALETTE.length] }));
  return (
    <div className="flex flex-wrap items-center gap-6">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg viewBox="0 0 100 100" className="-rotate-90" role="img" aria-label={segs.map((s) => `${s.label} ${s.value}`).join(', ')}>
          <circle cx="50" cy="50" r={r} fill="none" stroke="var(--color-cloud)" strokeWidth="12" />
          {total > 0 && segs.map((s) => {
            const len = (s.value / total) * c;
            const el = <circle key={s.label} cx="50" cy="50" r={r} fill="none" stroke={s.color} strokeWidth="12" strokeDasharray={`${Math.max(0, len - (segs.length > 1 ? 1.2 : 0))} ${c}`} strokeDashoffset={-offset} />;
            offset += len;
            return el;
          })}
        </svg>
        <div className="absolute inset-0 grid place-items-center text-center" aria-hidden>
          <div><div className="text-2xl font-bold text-navy">{center ?? total}</div>{sub && <div className="text-xs text-muted">{sub}</div>}</div>
        </div>
      </div>
      <Legend items={segs} total={total} className="flex-col" />
    </div>
  );
}

function Legend({ items, total, className }: { items: { label: string; value: number; color: string }[]; total?: number; className?: string }) {
  return (
    <ul className={cx('flex flex-wrap gap-x-4 gap-y-2 text-sm', className)}>
      {items.map((s) => (
        <li key={s.label} className="flex items-center gap-2">
          <span className="size-2.5 shrink-0 rounded-full" style={{ background: s.color }} aria-hidden />
          <span className="text-muted">{s.label}</span>
          <span className="font-semibold tabular-nums text-navy">{s.value}</span>
          {total ? <span className="text-xs text-muted">({Math.round((s.value / total) * 100)}%)</span> : null}
        </li>
      ))}
    </ul>
  );
}

/** Single-value radial progress (0–100). */
export function Ring({ value, size = 120, label, color = 'var(--color-accent)', children }: { value: number | null; size?: number; label: string; color?: string; children?: ReactNode }) {
  const v = Math.max(0, Math.min(100, value ?? 0)), r = 42, c = 2 * Math.PI * r;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} role="img" aria-label={`${label}: ${value === null ? 'no data' : `${v}%`}`}>
      <svg viewBox="0 0 100 100" className="-rotate-90">
        <circle cx="50" cy="50" r={r} fill="none" stroke="var(--color-cloud)" strokeWidth="10" />
        <circle cx="50" cy="50" r={r} fill="none" stroke={color} strokeWidth="10" strokeLinecap="round" strokeDasharray={`${(v / 100) * c} ${c}`} className="transition-[stroke-dasharray] duration-700" />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center" aria-hidden>{children ?? <span className="text-xl font-bold text-navy">{value === null ? '—' : `${v}%`}</span>}</div>
    </div>
  );
}

/** Round an axis max up to 1/2/5 × 10^n so gridlines land on readable numbers. */
export function niceMax(v: number) {
  const p = 10 ** Math.floor(Math.log10(v));
  return ([1, 2, 5, 10].find((m) => m * p >= v) ?? 10) * p;
}

const shade = (color: string, l: number) => (l === 0 ? 'var(--color-cloud)' : `color-mix(in srgb, ${color} ${[0, 25, 50, 75, 100][l]}%, white)`);
const dayLabel = (d: string, o: Intl.DateTimeFormatOptions) => new Date(`${d}T12:00:00`).toLocaleDateString(undefined, o);

/** GitHub-style calendar heatmap of daily counts (oldest first). Columns are Monday-start weeks. */
export function Heatmap({ days, label, color = 'var(--color-primary)', unit = 'events' }: { days: { day: string; n: number }[]; label: string; color?: string; unit?: string }) {
  if (days.length === 0) return null;
  const max = Math.max(1, ...days.map((d) => d.n));
  const total = days.reduce((a, d) => a + d.n, 0);
  const active = days.filter((d) => d.n > 0).length;
  const pad = (new Date(`${days[0].day}T12:00:00`).getDay() + 6) % 7;
  const cells: ({ day: string; n: number } | null)[] = [...Array(pad).fill(null), ...days];
  const weeks = Array.from({ length: Math.ceil(cells.length / 7) }, (_, w) => cells.slice(w * 7, w * 7 + 7));
  const level = (n: number) => (n === 0 ? 0 : Math.ceil((n / max) * 4));
  return (
    <figure role="img" aria-label={`${label}: ${total} ${unit} over ${days.length} days, active on ${active} days`}>
      <div className="flex gap-1 overflow-x-auto pb-1" aria-hidden>
        <div className="mt-5 grid shrink-0 grid-rows-7 gap-1 pr-1 text-[10px] leading-[14px] text-muted">{['Mon', '', 'Wed', '', 'Fri', '', ''].map((t, i) => <span key={i}>{t}</span>)}</div>
        {weeks.map((w, wi) => {
          const firstDay = w.find(Boolean);
          const showMonth = !!firstDay && (wi === 0 || new Date(`${firstDay.day}T12:00:00`).getDate() <= 7);
          return (
            <div key={wi} className="flex shrink-0 flex-col gap-1">
              <span className="h-4 text-[10px] text-muted">{showMonth ? dayLabel(firstDay!.day, { month: 'short' }) : ''}</span>
              {Array.from({ length: 7 }, (_, di) => {
                const c = w[di];
                return c
                  ? <span key={di} title={`${dayLabel(c.day, { day: 'numeric', month: 'short' })}: ${c.n} ${unit}`} className="size-3.5 rounded-[4px] ring-1 ring-inset ring-black/[.04] transition hover:scale-125" style={{ background: shade(color, level(c.n)) }} />
                  : <span key={di} className="size-3.5" />;
              })}
            </div>
          );
        })}
      </div>
      <figcaption className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
        <span><strong className="text-navy">{total}</strong> {unit} · active on <strong className="text-navy">{active}</strong> of {days.length} days</span>
        <span className="flex items-center gap-1" aria-hidden>Less{[0, 1, 2, 3, 4].map((l) => <span key={l} className="size-3 rounded-[3px]" style={{ background: shade(color, l) }} />)}More</span>
      </figcaption>
    </figure>
  );
}

/** Smooth area trend with hover points. `max` fixes the y-axis (e.g. 100 for percentages). */
export function AreaChart({ data, label, color = 'var(--color-primary)', height = 180, max, format = (v) => String(v), every = 1 }: {
  data: { label: string; value: number }[]; label: string; color?: string; height?: number; max?: number; format?: (v: number) => string; every?: number;
}) {
  if (data.length === 0) return <p className="py-6 text-center text-sm text-muted">No data yet</p>;
  const top = max ?? niceMax(Math.max(1, ...data.map((d) => d.value)));
  const pts = data.map((d, i) => [data.length === 1 ? 50 : (i / (data.length - 1)) * 100, 100 - (d.value / top) * 100] as const);
  const line = pts.map(([x, y], i) => {
    if (i === 0) return `M${x},${y}`;
    const [px, py] = pts[i - 1], mx = px + (x - px) / 2;
    return `C${mx},${py} ${mx},${y} ${x},${y}`;
  }).join(' ');
  const id = `area-${label.replace(/\W/g, '')}`;
  return (
    <figure role="img" aria-label={`${label}: ${data.map((d) => `${d.label} ${format(d.value)}`).join(', ')}`}>
      <div className="flex gap-2" aria-hidden>
        <div className="-my-1.5 flex flex-col justify-between text-right text-[11px] tabular-nums text-muted" style={{ height: height + 12 }}>
          {[top, top / 2, 0].map((v) => <span key={v}>{format(Math.round(v))}</span>)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="relative" style={{ height }}>
            <div className="absolute inset-0 flex flex-col justify-between">{[0, 1, 2].map((k) => <div key={k} className={cx('border-t', k === 2 ? 'border-line' : 'border-dashed border-line/70')} />)}</div>
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 size-full overflow-visible">
              <defs><linearGradient id={id} x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity=".3" /><stop offset="100%" stopColor={color} stopOpacity="0" /></linearGradient></defs>
              <path d={`${line} L${pts[pts.length - 1][0]},100 L${pts[0][0]},100 Z`} fill={`url(#${id})`} />
              <path d={line} fill="none" stroke={color} strokeWidth="2.5" vectorEffect="non-scaling-stroke" strokeLinecap="round" />
            </svg>
            {pts.map(([x, y], i) => (
              <span key={i} className="group absolute -translate-x-1/2 -translate-y-1/2" style={{ left: `${x}%`, top: `${y}%` }}>
                <span className="block size-2.5 rounded-full border-2 border-white shadow transition group-hover:scale-150" style={{ background: color }} />
                <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1.5 hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-navy px-2 py-1 text-[11px] font-medium text-white shadow-lg group-hover:block">{data[i].label}: {format(data[i].value)}</span>
              </span>
            ))}
          </div>
          <div className="mt-1.5 flex text-[11px] text-muted">
            {data.map((d, i) => <span key={i} className="min-w-0 flex-1 truncate text-center">{i % every === 0 ? d.label : ''}</span>)}
          </div>
        </div>
      </div>
    </figure>
  );
}

/** Tiny trend line for stat tiles. */
export function Sparkline({ values, color = 'var(--color-primary)', height = 32 }: { values: number[]; color?: string; height?: number }) {
  if (values.length < 2) return null;
  const top = Math.max(1, ...values);
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * 100},${96 - (v / top) * 90}`).join(' ');
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full" style={{ height }} aria-hidden>
      <polygon points={`0,100 ${pts} 100,100`} fill={color} fillOpacity=".12" />
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  );
}

/** One 100 % bar split into parts, with legend — for status breakdowns. */
export function StackedBar({ segments, empty = 'No data yet' }: { segments: { label: string; value: number; color?: string }[]; empty?: string }) {
  const total = segments.reduce((a, s) => a + s.value, 0);
  if (total === 0) return <p className="py-3 text-sm text-muted">{empty}</p>;
  const segs = segments.map((s, i) => ({ ...s, color: s.color ?? PALETTE[i % PALETTE.length] }));
  return (
    <div>
      <div className="flex h-3.5 overflow-hidden rounded-full bg-cloud" role="img" aria-label={segs.map((s) => `${s.label} ${s.value}`).join(', ')}>
        {segs.filter((s) => s.value > 0).map((s) => <div key={s.label} title={`${s.label}: ${s.value}`} style={{ width: `${(s.value / total) * 100}%`, background: s.color }} className="border-r-2 border-white last:border-r-0" />)}
      </div>
      <Legend items={segs} total={total} className="mt-3" />
    </div>
  );
}

/** Compact KPI for grids inside cards. */
export function Kpi({ label, value, hint, color }: { label: string; value: ReactNode; hint?: ReactNode; color?: string }) {
  return (
    <div className="rounded-xl bg-cloud/70 p-3.5">
      <div className="flex items-center gap-1.5 text-xs font-medium text-muted">{color && <span className="size-2 rounded-full" style={{ background: color }} aria-hidden />}{label}</div>
      <div className="mt-1 text-xl font-bold tabular-nums text-navy">{value}</div>
      {hint && <div className="text-[11px] text-muted">{hint}</div>}
    </div>
  );
}
