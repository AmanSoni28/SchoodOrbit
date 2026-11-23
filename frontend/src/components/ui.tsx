// House UI kit — small, accessible primitives on top of the design tokens in index.css.
import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { AlertTriangle, CheckCircle2, Inbox, Loader2, X } from 'lucide-react';
import { ApiError } from '../lib/api';

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');
export { cx };

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'accent'; size?: 'sm' | 'md'; loading?: boolean };
export function Button({ variant = 'primary', size = 'md', loading, className, children, disabled, ...p }: BtnProps) {
  const v = {
    primary: 'bg-primary text-white hover:brightness-110 shadow-sm shadow-primary/30 active:scale-[.98]',
    accent: 'bg-accent text-white hover:brightness-110 shadow-sm',
    secondary: 'bg-white text-ink border border-line hover:bg-cloud',
    ghost: 'text-ink hover:bg-cloud',
    danger: 'bg-danger text-white hover:brightness-110',
  }[variant];
  return (
    <button {...p} disabled={disabled || loading} className={cx('inline-flex items-center justify-center gap-2 rounded-lg font-medium transition disabled:opacity-55 disabled:cursor-not-allowed', size === 'sm' ? 'px-3 py-1.5 text-sm' : 'px-4 py-2.5 text-sm', v, className)}>
      {loading && <Loader2 className="size-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}

export function Card({ className, children, title, subtitle, action }: { className?: string; children: ReactNode; title?: ReactNode; subtitle?: ReactNode; action?: ReactNode }) {
  return (
    <section className={cx('rounded-2xl border border-line/80 bg-surface p-5 shadow-[0_1px_3px_rgba(16,27,58,0.05),0_8px_24px_-12px_rgba(16,27,58,0.08)] sm:p-6', className)}>
      {(title || action) && (
        <div className="mb-5 flex items-start justify-between gap-3">
          <div className="min-w-0">
            {title && <h2 className="text-[15px] font-semibold text-navy">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function PageHeader({ title, subtitle, actions, eyebrow }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; eyebrow?: ReactNode }) {
  return (
    <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && <div className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-primary">{eyebrow}</div>}
        <h1 className="text-[26px] font-bold leading-tight tracking-tight text-navy">{title}</h1>
        {subtitle && <p className="mt-1.5 max-w-2xl text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

// ── Form fields: label + error are wired with ids for screen readers ──
type FieldProps = { label: string; error?: string; hint?: string; children: (id: string, describedBy?: string) => ReactNode; required?: boolean };
export function Field({ label, error, hint, children, required }: FieldProps) {
  const id = useId();
  const desc = error ? `${id}-err` : hint ? `${id}-hint` : undefined;
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium text-ink">{label}{required && <span className="text-danger" aria-hidden> *</span>}</label>
      {children(id, desc)}
      {hint && !error && <p id={`${id}-hint`} className="text-xs text-muted">{hint}</p>}
      {error && <p id={`${id}-err`} className="text-xs font-medium text-danger">{error}</p>}
    </div>
  );
}
const inputCls = 'w-full rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink placeholder:text-muted/70 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:bg-cloud';
export function Input({ label, error, hint, className, ...p }: InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string; hint?: string }) {
  return <Field label={label} error={error} hint={hint} required={p.required}>{(id, d) => <input id={id} aria-describedby={d} aria-invalid={!!error} className={cx(inputCls, className)} {...p} />}</Field>;
}
export function Textarea({ label, error, hint, className, ...p }: TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; error?: string; hint?: string }) {
  return <Field label={label} error={error} hint={hint} required={p.required}>{(id, d) => <textarea id={id} aria-describedby={d} aria-invalid={!!error} className={cx(inputCls, 'min-h-24', className)} {...p} />}</Field>;
}
export function Select({ label, error, hint, className, children, ...p }: SelectHTMLAttributes<HTMLSelectElement> & { label: string; error?: string; hint?: string }) {
  return <Field label={label} error={error} hint={hint} required={p.required}>{(id, d) => <select id={id} aria-describedby={d} className={cx(inputCls, className)} {...p}>{children}</select>}</Field>;
}
export function Checkbox({ label, checked, onChange, hint }: { label: string; checked: boolean; onChange: (v: boolean) => void; hint?: string }) {
  return (
    <label className="flex cursor-pointer items-start gap-2.5 text-sm">
      <input type="checkbox" className="mt-0.5 size-4 accent-[var(--brand-primary)]" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span><span className="font-medium">{label}</span>{hint && <span className="block text-xs text-muted">{hint}</span>}</span>
    </label>
  );
}

/** Pulls field-level messages out of a 422 response for inline display. */
export const fieldErrors = (e: unknown): Record<string, string> =>
  e instanceof ApiError && Array.isArray(e.details) ? Object.fromEntries(e.details.map((d: any) => [d.path, d.message])) : {};

export function Badge({ tone = 'neutral', children }: { tone?: 'neutral' | 'primary' | 'success' | 'warning' | 'danger' | 'navy'; children: ReactNode }) {
  const t = {
    neutral: 'bg-cloud text-muted border-line', primary: 'bg-primary/10 text-primary border-primary/20',
    success: 'bg-accent/10 text-success border-accent/25', warning: 'bg-gold/20 text-[#7a5310] border-gold/40',
    danger: 'bg-danger/10 text-danger border-danger/20', navy: 'bg-navy text-white border-navy',
  }[tone];
  return <span className={cx('inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium', t)}>{children}</span>;
}

const STATUS_TONE: Record<string, Parameters<typeof Badge>[0]['tone']> = {
  PUBLISHED: 'success', ACTIVE: 'success', GRADED: 'success', ANSWERED: 'success', RESOLVED: 'neutral', COMPLETED: 'success', APPROVED: 'success', DRAFT_READY: 'primary', READY: 'primary',
  DRAFT: 'neutral', SCHEDULED: 'primary', CLOSED: 'neutral', ARCHIVED: 'neutral', SUBMITTED: 'primary', IN_PROGRESS: 'warning', OPEN: 'warning', PENDING: 'warning',
  PAID: 'success', PARTIAL: 'primary', OVERDUE: 'danger', WAIVED: 'neutral', PASS: 'success', FAIL: 'danger', INCOMPLETE: 'warning',
  QUEUED: 'neutral', PROCESSING: 'primary', FAILED: 'danger', REJECTED: 'danger', HIDDEN: 'danger', SUSPENDED: 'danger', DROPPED: 'danger', REVOKED: 'danger', NO_CONTENT: 'neutral',
};
export const StatusBadge = ({ status }: { status: string }) => <Badge tone={STATUS_TONE[status] ?? 'neutral'}>{status.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase())}</Badge>;

export const Skeleton = ({ className }: { className?: string }) => <div className={cx('skeleton rounded-lg', className)} aria-hidden />;
export function LoadingBlock({ rows = 3 }: { rows?: number }) {
  return <div className="space-y-3" role="status" aria-label="Loading">{Array.from({ length: rows }, (_, i) => <Skeleton key={i} className="h-14" />)}</div>;
}

export function EmptyState({ title, body, action, icon }: { title: string; body?: ReactNode; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-dashed border-line bg-white/60 px-6 py-10 text-center">
      <div className="mb-3 rounded-2xl bg-gradient-to-br from-primary/10 to-accent/10 p-3.5 text-primary">{icon ?? <Inbox className="size-6" aria-hidden />}</div>
      <p className="font-semibold text-navy">{title}</p>
      {body && <p className="mt-1 max-w-md text-sm text-muted">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const e = error as ApiError;
  const msg = e?.status === 403 ? 'You do not have permission to view this.' : e?.status === 404 ? 'This item could not be found.' : e?.message ?? 'Something went wrong.';
  return (
    <div role="alert" className="flex items-start gap-3 rounded-2xl border border-danger/25 bg-danger/5 p-4 text-sm">
      <AlertTriangle className="mt-0.5 size-5 shrink-0 text-danger" aria-hidden />
      <div className="flex-1"><p className="font-medium text-ink">{msg}</p>{e?.code === 'NETWORK' && <p className="text-muted">Check your connection.</p>}</div>
      {onRetry && <Button size="sm" variant="secondary" onClick={onRetry}>Retry</Button>}
    </div>
  );
}

/** Renders a TanStack query's loading / error / empty / data states consistently. */
export function QueryView<T>({ q, children, empty, isEmpty, rows }: { q: { isLoading: boolean; error: unknown; data: T | undefined; refetch: () => unknown }; children: (d: T) => ReactNode; empty?: ReactNode; isEmpty?: (d: T) => boolean; rows?: number }) {
  if (q.isLoading) return <LoadingBlock rows={rows} />;
  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  if (q.data === undefined) return null;
  if (empty && (isEmpty ? isEmpty(q.data) : Array.isArray(q.data) && q.data.length === 0)) return <>{empty}</>;
  return <>{children(q.data)}</>;
}

export function Progress({ value, label, tone = 'accent' }: { value: number | null; label: string; tone?: 'accent' | 'primary' | 'gold' }) {
  const v = Math.max(0, Math.min(100, value ?? 0));
  return (
    <div role="progressbar" aria-label={label} aria-valuenow={value ?? undefined} aria-valuemin={0} aria-valuemax={100} className="h-2 w-full overflow-hidden rounded-full bg-line/70">
      <div className={cx('h-full rounded-full transition-all', tone === 'accent' ? 'bg-accent' : tone === 'gold' ? 'bg-gold' : 'bg-primary')} style={{ width: `${v}%` }} />
    </div>
  );
}

export function Stat({ label, value, hint, icon, tone = 'primary', footer }: { label: string; value: ReactNode; hint?: ReactNode; icon?: ReactNode; tone?: 'primary' | 'accent' | 'gold' | 'navy'; footer?: ReactNode }) {
  const t = { primary: 'from-primary to-[#6f8bff]', accent: 'from-accent to-[#3fd1c4]', gold: 'from-[#e09a2a] to-gold', navy: 'from-navy to-navy-2' }[tone];
  const bar = { primary: 'bg-primary', accent: 'bg-accent', gold: 'bg-gold', navy: 'bg-navy' }[tone];
  return (
    <div className="relative overflow-hidden rounded-2xl border border-line/80 bg-surface p-5 shadow-[0_1px_3px_rgba(16,27,58,0.05)] transition hover:-translate-y-0.5 hover:shadow-md">
      <div className={cx('absolute inset-x-0 top-0 h-1 opacity-80', bar)} aria-hidden />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[13px] font-medium text-muted">{label}</div>
          <div className="mt-2 text-3xl font-bold tracking-tight text-navy tabular-nums">{value}</div>
        </div>
        {icon && <span className={cx('grid size-11 shrink-0 place-items-center rounded-xl bg-gradient-to-br text-white shadow-sm [&>svg]:size-5', t)} aria-hidden>{icon}</span>}
      </div>
      {hint && <div className="mt-2 text-xs text-muted">{hint}</div>}
      {footer && <div className="-mx-1 mt-3">{footer}</div>}
    </div>
  );
}

export function Table({ head, children, caption }: { head: ReactNode[]; children: ReactNode; caption?: string }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-line/80 bg-white shadow-[0_1px_3px_rgba(16,27,58,0.05)]">
      <table className="w-full min-w-[560px] text-left text-sm">
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead className="border-b border-line bg-cloud/70 text-[11px] uppercase tracking-wider text-muted">
          <tr>{head.map((h, i) => <th key={i} scope="col" className="px-4 py-3 font-semibold">{h}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-line/70 [&>tr]:transition-colors [&>tr:hover]:bg-cloud/60">{children}</tbody>
      </table>
    </div>
  );
}
export const Td = ({ children, className }: { children?: ReactNode; className?: string }) => <td className={cx('px-4 py-2.5 align-middle', className)}>{children}</td>;

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { id: T; label: string; badge?: ReactNode }[]; value: T; onChange: (t: T) => void }) {
  return (
    <div role="tablist" className="-mx-1 mb-6 flex gap-1 overflow-x-auto border-b border-line px-1">
      {tabs.map((t) => (
        <button key={t.id} role="tab" aria-selected={value === t.id} onClick={() => onChange(t.id)}
          className={cx('whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition', value === t.id ? 'border-primary text-primary' : 'border-transparent text-muted hover:text-ink')}>
          {t.label}{t.badge !== undefined && <span className="ml-1.5 rounded-full bg-cloud px-1.5 text-xs">{t.badge}</span>}
        </button>
      ))}
    </div>
  );
}

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} onClose={onClose} aria-label={title} className={cx('m-auto w-[calc(100%-2rem)] rounded-2xl border border-line p-0 shadow-2xl backdrop:bg-navy/40', wide ? 'max-w-3xl' : 'max-w-lg')}>
      {open && (
        <div className="p-6">
          <div className="mb-4 flex items-start justify-between gap-4">
            <h2 className="text-lg font-semibold text-navy">{title}</h2>
            <button onClick={onClose} className="rounded-lg p-1 text-muted hover:bg-cloud" aria-label="Close dialog"><X className="size-5" /></button>
          </div>
          {children}
        </div>
      )}
    </dialog>
  );
}

/** Confirmation for sensitive actions, with impact text (PDF §16). */
export function useConfirm() {
  const [state, setState] = useState<{ title: string; body: ReactNode; confirm: string; danger?: boolean; resolve: (v: boolean) => void } | null>(null);
  const confirm = useCallback((o: { title: string; body: ReactNode; confirm?: string; danger?: boolean }) => new Promise<boolean>((resolve) => setState({ confirm: 'Confirm', ...o, resolve })), []);
  const close = (v: boolean) => { state?.resolve(v); setState(null); };
  const dialog = (
    <Modal open={!!state} onClose={() => close(false)} title={state?.title ?? ''}>
      <div className="text-sm text-muted">{state?.body}</div>
      <div className="mt-6 flex justify-end gap-2">
        <Button variant="secondary" onClick={() => close(false)}>Cancel</Button>
        <Button variant={state?.danger ? 'danger' : 'primary'} onClick={() => close(true)}>{state?.confirm}</Button>
      </div>
    </Modal>
  );
  return { confirm, dialog };
}

// ── Toasts ──
type Toast = { id: number; kind: 'success' | 'error'; text: string };
const ToastCtx = createContext<(kind: Toast['kind'], text: string) => void>(() => {});
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const push = useCallback((kind: Toast['kind'], text: string) => {
    const id = Date.now() + Math.random();
    setItems((x) => [...x, { id, kind, text }]);
    setTimeout(() => setItems((x) => x.filter((t) => t.id !== id)), 5000);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div aria-live="polite" className="fixed bottom-4 right-4 z-50 flex w-[min(92vw,380px)] flex-col gap-2">
        {items.map((t) => (
          <div key={t.id} role={t.kind === 'error' ? 'alert' : 'status'} className={cx('flex items-start gap-2 rounded-xl border bg-white p-3 text-sm shadow-lg', t.kind === 'error' ? 'border-danger/30' : 'border-accent/30')}>
            {t.kind === 'error' ? <AlertTriangle className="size-5 shrink-0 text-danger" aria-hidden /> : <CheckCircle2 className="size-5 shrink-0 text-accent" aria-hidden />}
            <span className="flex-1">{t.text}</span>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
export function useToast() {
  const push = useContext(ToastCtx);
  return { success: (t: string) => push('success', t), error: (e: unknown) => push('error', e instanceof Error ? e.message : String(e)) };
}

/** Gradient welcome banner for dashboards: greeting on the left, highlight chips on the right. */
export function Hero({ eyebrow, title, subtitle, children, aside }: { eyebrow?: ReactNode; title: ReactNode; subtitle?: ReactNode; children?: ReactNode; aside?: ReactNode }) {
  return (
    <section className="relative mb-7 overflow-hidden rounded-3xl bg-gradient-to-br from-navy via-navy-2 to-primary p-6 text-white shadow-xl shadow-navy/15 sm:p-8">
      <div className="absolute -right-16 -top-20 size-72 rounded-full bg-accent/25 blur-3xl" aria-hidden />
      <div className="absolute -bottom-24 left-1/3 size-72 rounded-full bg-primary/40 blur-3xl" aria-hidden />
      <div className="relative flex flex-wrap items-center justify-between gap-6">
        <div className="min-w-0 max-w-xl">
          {eyebrow && <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-accent">{eyebrow}</div>}
          <h1 className="text-2xl font-bold leading-tight tracking-tight sm:text-3xl">{title}</h1>
          {subtitle && <p className="mt-2 text-sm text-white/70">{subtitle}</p>}
          {children && <div className="mt-5 flex flex-wrap gap-2.5">{children}</div>}
        </div>
        {aside}
      </div>
    </section>
  );
}
export const HeroChip = ({ icon, children }: { icon?: ReactNode; children: ReactNode }) => (
  <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-xs font-medium text-white ring-1 ring-white/15 backdrop-blur [&>svg]:size-3.5">{icon}{children}</span>
);
