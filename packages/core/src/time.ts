/**
 * Timestamps, calendar days, the time reference and the time labels.
 *
 * Nothing here reads the wall clock: the anchor (`InboxTimeAnchor`) is built by
 * the caller — a controller or a test — and passed in, which is what makes a day
 * boundary, another zone and a relative label reproducible instead of dependent
 * on when the code happens to run. `Intl` does the formatting, and every
 * formatter is built lazily and cached, so importing this module touches no
 * browser object and a server render costs nothing extra.
 *
 * A notification time is RFC 3339 with an explicit offset (`Z` or `±HH:MM`), so
 * the same payload means the same instant in every browser, on the server and in
 * a test. The check is deliberately arithmetic rather than `Date.parse()`:
 * engines differ on rolled-over dates such as `2026-02-31T00:00:00Z`, and a
 * silently re-interpreted creation time would move a notification to the wrong
 * place in a list that is ordered by time.
 */
import { format, selectPlural } from './i18n';
import type { InboxClock, InboxMessages, InboxTimeAnchor } from './types';

const TIMESTAMP_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})[Tt](\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(?:[Zz]|([+-])(\d{2}):(\d{2}))$/;

/** Days in each month, January first. February is corrected for leap years. */
const DAYS_IN_MONTH: readonly number[] = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

const DAY_KEY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

const MINUTE_MS = 60_000;
const HOUR_MS = 3_600_000;

/** The UTC instant a calendar day is anchored to, immune to DST and offset drift. */
const DAY_ANCHOR_HOUR_UTC = 12;

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

/* -------------------------------------------------------------------------- */
/*  Formatters                                                                */
/* -------------------------------------------------------------------------- */

const formatterCache = new Map<string, Intl.DateTimeFormat>();

/**
 * A cached formatter.
 *
 * The lookup is defensive rather than optimistic: a consumer can pass an
 * unsupported locale or zone, and a widget that throws while rendering a time is
 * worse than one that renders it in English. `resolveInboxConfig()` rejects such
 * a value up front; this is the second line of defence for a hand-built config.
 */
function getFormatter(locale: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = `${locale}|${JSON.stringify(options)}`;
  let formatter = formatterCache.get(key);
  if (!formatter) {
    formatter = createFormatter(locale, options);
    formatterCache.set(key, formatter);
  }
  return formatter;
}

function createFormatter(locale: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  try {
    return new Intl.DateTimeFormat(locale, options);
  } catch {
    const { timeZone: _timeZone, ...rest } = options;
    try {
      return new Intl.DateTimeFormat('en-US', rest);
    } catch {
      return new Intl.DateTimeFormat('en-US');
    }
  }
}

/* -------------------------------------------------------------------------- */
/*  Calendar days                                                             */
/* -------------------------------------------------------------------------- */

function pad(value: number): string {
  return value < 10 ? `0${value}` : String(value);
}

/** Whether a value is a `YYYY-MM-DD` calendar day. */
export function isInboxDayKey(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const match = DAY_KEY_PATTERN.exec(value);
  if (match === null) return false;
  const month = Number(match[2]);
  const day = Number(match[3]);
  return month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(Number(match[1]), month);
}

/** Calendar day of an instant, expressed in `timeZone`, as `YYYY-MM-DD`. */
export function dayKeyOf(date: Date, timeZone: string): string {
  const parts = getFormatter('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const lookup: Record<string, string> = {};
  for (const part of parts) lookup[part.type] = part.value;
  return `${lookup.year}-${lookup.month}-${lookup.day}`;
}

/**
 * Calendar day of an RFC 3339 instant, expressed in `timeZone`.
 *
 * A value the runtime cannot parse falls back to its own date part, so a row
 * whose time was not checked at the adapter boundary still gets a group instead
 * of a crash. The adapter contract requires a valid timestamp in the first place.
 */
export function dayKeyOfInstant(iso: string, timeZone: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso.slice(0, 10);
  return dayKeyOf(date, timeZone);
}

/** Shifts a `YYYY-MM-DD` day key by whole days. */
export function addDaysToDayKey(dayKey: string, amount: number): string {
  const match = DAY_KEY_PATTERN.exec(dayKey);
  if (match === null) throw new RangeError(`Inboxline: not a calendar day: ${dayKey}`);
  const date = new Date(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), DAY_ANCHOR_HOUR_UTC),
  );
  date.setUTCDate(date.getUTCDate() + amount);
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

function dayKeyToDate(dayKey: string): Date {
  const match = DAY_KEY_PATTERN.exec(dayKey);
  if (match === null) throw new RangeError(`Inboxline: not a calendar day: ${dayKey}`);
  return new Date(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), DAY_ANCHOR_HOUR_UTC),
  );
}

/* -------------------------------------------------------------------------- */
/*  Time reference                                                            */
/* -------------------------------------------------------------------------- */

/** The real clock. A binding hands this to the controller after mounting. */
export function systemInboxClock(): InboxClock {
  return { now: () => Date.now() };
}

/**
 * Fixes the time reference: the moment, and the days “today” and “yesterday”
 * mean in the configured zone. Both day keys make the derivation a pure function
 * of the anchor, so midnight is a test case rather than a race.
 */
export function createInboxTimeAnchor(nowMs: number, timeZone: string): InboxTimeAnchor {
  const today = dayKeyOf(new Date(nowMs), timeZone);
  return { nowMs, today, yesterday: addDaysToDayKey(today, -1) };
}

/* -------------------------------------------------------------------------- */
/*  Time labels                                                               */
/* -------------------------------------------------------------------------- */

/** `just now`, `{count} minutes ago`, `{count} hours ago`. */
export function formatInboxRelativeTime(
  iso: string,
  nowMs: number,
  messages: InboxMessages,
  locale: string,
): string {
  const at = Date.parse(iso);
  // A future timestamp (clock skew) reads as “now” rather than as a negative age.
  const elapsed = Number.isFinite(at) ? nowMs - at : 0;
  if (elapsed < MINUTE_MS) return messages.timeNow;
  if (elapsed < HOUR_MS) {
    return format(selectPlural(messages.relativeMinute, Math.floor(elapsed / MINUTE_MS), locale), {
      count: Math.floor(elapsed / MINUTE_MS),
    });
  }
  return format(selectPlural(messages.relativeHour, Math.floor(elapsed / HOUR_MS), locale), {
    count: Math.floor(elapsed / HOUR_MS),
  });
}

/** `Today` / `Yesterday` / `Monday, 12 October`, for a group heading. */
export function formatInboxDayLabel(
  dayKey: string,
  anchor: InboxTimeAnchor,
  messages: InboxMessages,
  locale: string,
): string {
  if (dayKey === anchor.today) return messages.todayLabel;
  if (dayKey === anchor.yesterday) return messages.yesterdayLabel;
  return getFormatter(locale, {
    timeZone: 'UTC',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    ...(dayKey.slice(0, 4) === anchor.today.slice(0, 4) ? {} : { year: 'numeric' }),
  }).format(dayKeyToDate(dayKey));
}

/**
 * The time label of one row: relative while the notification belongs to today,
 * an absolute short date otherwise. The group heading already says which day a
 * row of another day is from, so the row repeats the date and not the weekday.
 */
export function formatInboxItemTime(
  iso: string,
  locale: string,
  timeZone: string,
  anchor: InboxTimeAnchor,
  messages: InboxMessages,
): string {
  const dayKey = dayKeyOfInstant(iso, timeZone);
  if (dayKey === anchor.today) {
    return formatInboxRelativeTime(iso, anchor.nowMs, messages, locale);
  }
  return getFormatter(locale, {
    timeZone: 'UTC',
    day: 'numeric',
    month: 'short',
    ...(dayKey.slice(0, 4) === anchor.today.slice(0, 4) ? {} : { year: 'numeric' }),
  }).format(dayKeyToDate(dayKey));
}
