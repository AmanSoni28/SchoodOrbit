export const fmtDate = (d?: string | Date | null) => (d ? new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
export const fmtDateTime = (d?: string | Date | null) => (d ? new Date(d).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');

export function fromNow(d: string | Date) {
  const diff = new Date(d).getTime() - Date.now();
  const abs = Math.abs(diff), mins = Math.round(abs / 60000), hrs = Math.round(abs / 3600000), days = Math.round(abs / 86400000);
  const s = mins < 60 ? `${mins} min` : hrs < 48 ? `${hrs} h` : `${days} days`;
  return diff >= 0 ? `in ${s}` : `${s} ago`;
}

export const pct = (v: number | null | undefined) => (v === null || v === undefined ? '—' : `${v}%`);
export const bytes = (n: number) => (n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1048576).toFixed(1)} MB`);

/** <input type="datetime-local"> value for a Date, in the browser's local time. */
export const toLocalInput = (d?: string | Date | null) => {
  if (!d) return '';
  const x = new Date(d);
  return new Date(x.getTime() - x.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};

// Money is shown in Indian rupees (college locale en-IN).
const inrFmt = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2, minimumFractionDigits: 0 });
export const money = (n: number | null | undefined) => (n === null || n === undefined ? '—' : inrFmt.format(n));
/** Compact rupees for chart axes and tiles: ₹950, ₹12.5K, ₹3.4L, ₹1.2Cr. */
export const moneyShort = (n: number) => (n >= 1e7 ? `₹${+(n / 1e7).toFixed(1)}Cr` : n >= 1e5 ? `₹${+(n / 1e5).toFixed(1)}L` : n >= 1e3 ? `₹${+(n / 1e3).toFixed(1)}K` : `₹${Math.round(n)}`);
export const titleCase = (s: string) => s.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
