// Leave rules shared by the routes and tests. Dates are calendar days (YYYY-MM-DD) in the college time zone.
import { addDays, toDay } from '../../lib/time';

export const LEAVE_RULES = { maxDays: 30, backdateDays: 15, maxAheadDays: 180 };

/** Inclusive calendar-day count. */
export const leaveDays = (from: string, to: string) => Math.round((toDay(to).getTime() - toDay(from).getTime()) / 86400000) + 1;

/** Returns an error message, or null when the range is allowed relative to `today`. */
export function checkRange(from: string, to: string, today: string): string | null {
  if (to < from) return 'The end date cannot be before the start date';
  if (leaveDays(from, to) > LEAVE_RULES.maxDays) return `A single request can cover at most ${LEAVE_RULES.maxDays} days`;
  if (from < addDays(today, -LEAVE_RULES.backdateDays)) return `Leave can be applied at most ${LEAVE_RULES.backdateDays} days after it started`;
  if (from > addDays(today, LEAVE_RULES.maxAheadDays)) return `Leave can be applied at most ${LEAVE_RULES.maxAheadDays} days in advance`;
  return null;
}

