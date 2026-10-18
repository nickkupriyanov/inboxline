/**
 * Timestamps at the adapter boundary.
 *
 * A notification time is RFC 3339 with an explicit offset (`Z` or `±HH:MM`), so
 * the same payload means the same instant in every browser, on the server and in
 * a test. The check here is deliberately arithmetic rather than `Date.parse()`:
 * engines differ on rolled-over dates such as `2026-02-31T00:00:00Z`, and a
 * silently re-interpreted creation time would move a notification to the wrong
 * place in a list that is ordered by time.
 *
 * Labelling a time — "5 minutes ago", a local format — belongs to the derived
 * view model (Iteration 3), which receives the current time explicitly.
 */

const TIMESTAMP_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})[Tt](\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(?:[Zz]|([+-])(\d{2}):(\d{2}))$/;

/** Days in each month, January first. February is corrected for leap years. */
const DAYS_IN_MONTH: readonly number[] = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function daysInMonth(year: number, month: number): number {
  return month === 2 && isLeapYear(year) ? 29 : DAYS_IN_MONTH[month - 1];
}

/**
 * Whether a value is a usable notification timestamp.
 *
 * Accepts a full RFC 3339 date-time with seconds and an explicit offset, with
 * optional fractional seconds. Rejects an offset-less string (a local time is
 * ambiguous the moment the reader is elsewhere), a rolled-over date such as
 * `2026-02-31T00:00:00Z`, out-of-range components and anything that is not a
 * string. Leap seconds are not accepted: `:60` would need a leap-second table to
 * stay correct.
 */
export function isInboxTimestamp(value: unknown): value is string {
  if (typeof value !== 'string') return false;

  const match = TIMESTAMP_PATTERN.exec(value);
  if (match === null) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);

  if (month < 1 || month > 12) return false;
  if (day < 1 || day > daysInMonth(year, month)) return false;
  if (hour > 23 || minute > 59 || second > 59) return false;

  const offsetHour = match[8];
  const offsetMinute = match[9];
  if (offsetHour !== undefined) {
    if (Number(offsetHour) > 23 || Number(offsetMinute) > 59) return false;
  }

  return true;
}
