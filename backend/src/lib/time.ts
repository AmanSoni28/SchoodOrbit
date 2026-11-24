// Local calendar date (YYYY-MM-DD) in the college's time zone.
export function localDate(timeZone: string, at = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(at);
}

export function addDays(ymd: string, days: number) {
  const d = new Date(ymd + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** A `@db.Date` value for a YYYY-MM-DD string, and back. */
export const toDay = (ymd: string) => new Date(ymd + 'T00:00:00Z');
export const ymd = (d: Date) => d.toISOString().slice(0, 10);
