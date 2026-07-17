import { format as dfFormat, isSameDay, addDays } from 'date-fns';

export type TimeMode = 'local' | 'utc';

/**
 * Every kickoff/commence/snapshot timestamp the backend sends is naive
 * UTC with no timezone marker on most endpoints (schemas.py datetime
 * fields serialize with no 'Z'/offset suffix — see scripts/db.ts's
 * documented "backend always writes/reads naive UTC" convention). JS's
 * `new Date(str)` parses a marker-less date-time string as LOCAL time
 * per the ECMA-262 spec, which silently mis-renders every kickoff time
 * by the viewer's UTC offset. Every consumer must parse through this
 * instead of calling `new Date(raw)` directly.
 *
 * Safe to call on a string that already has an offset (e.g.
 * /in-play-jumps, which does append 'Z') — detected and passed through
 * unchanged rather than double-appending.
 */
export function parseUtc(raw: string | Date): Date {
  if (raw instanceof Date) return raw;
  if (/[zZ]|[+-]\d{2}:?\d{2}$/.test(raw)) return new Date(raw);
  return new Date(raw + 'Z');
}

// date-fns' format() and its helpers (isSameDay, startOfDay, etc.) always
// read a Date's LOCAL getters. To render/group in UTC without adding a
// date-fns-tz dependency, build a "fake local" Date whose local fields
// equal the real UTC fields, then hand THAT to date-fns.
function asDisplayDate(date: Date, mode: TimeMode): Date {
  if (mode === 'local') return date;
  return new Date(
    date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(),
    date.getUTCHours(), date.getUTCMinutes(), date.getUTCSeconds(), date.getUTCMilliseconds()
  );
}

/** Parse + format in one step — use for any raw kickoff/timestamp string. */
export function formatKickoff(raw: string | Date, pattern: string, mode: TimeMode): string {
  return dfFormat(asDisplayDate(parseUtc(raw), mode), pattern);
}

/**
 * A Date whose local-getter fields match the wall-clock time in the
 * given mode — safe to feed into date-fns helpers that read local
 * getters (startOfDay, startOfWeek, isSameDay, etc.) so day/week
 * grouping agrees with the times displayed under it.
 */
export function toDisplayDate(raw: string | Date, mode: TimeMode): Date {
  return asDisplayDate(parseUtc(raw), mode);
}

/**
 * "now", expressed in the same wall-clock frame as toDisplayDate() —
 * needed so "Today"/"Tomorrow" grouping compares apples to apples in
 * UTC mode instead of silently comparing against the browser's real
 * local "today" (date-fns' own isToday()/isTomorrow() always do that,
 * which is wrong near a midnight boundary once UTC mode is selected).
 */
export function displayNow(mode: TimeMode): Date {
  return asDisplayDate(new Date(), mode);
}

/**
 * "Today" / "Tomorrow" / a formatted date. `displayDate` must already be
 * in display form — i.e. produced by toDisplayDate() in the SAME mode —
 * not a raw backend string or a plain parseUtc() Date. Passing a raw
 * value here would apply the UTC wall-clock transform twice.
 */
export function dayGroupLabel(displayDate: Date, mode: TimeMode): string {
  const now = displayNow(mode);
  if (isSameDay(displayDate, now)) return 'Today';
  if (isSameDay(displayDate, addDays(now, 1))) return 'Tomorrow';
  return dfFormat(displayDate, 'EEEE, MMMM d');
}
