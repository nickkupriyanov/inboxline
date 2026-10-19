import { describe, expect, it } from 'vitest';
import { defaultMessages } from './i18n';
import {
  addDaysToDayKey,
  createInboxTimeAnchor,
  dayKeyOf,
  dayKeyOfInstant,
  formatInboxDayLabel,
  formatInboxItemTime,
  formatInboxRelativeTime,
  isInboxDayKey,
  isInboxTimestamp,
  systemInboxClock,
} from './time';

describe('isInboxTimestamp', () => {
  it('accepts an RFC 3339 instant with an explicit offset', () => {
    expect(isInboxTimestamp('2026-10-18T12:00:00Z')).toBe(true);
    expect(isInboxTimestamp('2026-10-18T12:00:00+03:00')).toBe(true);
    expect(isInboxTimestamp('2026-10-18T12:00:00-05:30')).toBe(true);
  });

  it('accepts fractional seconds and lower-case separators', () => {
    expect(isInboxTimestamp('2026-10-18T12:00:00.500Z')).toBe(true);
    expect(isInboxTimestamp('2026-10-18T12:00:00.123456789Z')).toBe(true);
    expect(isInboxTimestamp('2026-10-18t12:00:00z')).toBe(true);
  });

  it('accepts the 29th of February in a leap year', () => {
    expect(isInboxTimestamp('2024-02-29T00:00:00Z')).toBe(true);
    expect(isInboxTimestamp('2000-02-29T00:00:00Z')).toBe(true);
  });

  it('rejects a time without an offset', () => {
    expect(isInboxTimestamp('2026-10-18T12:00:00')).toBe(false);
    expect(isInboxTimestamp('2026-10-18T12:00:00.500')).toBe(false);
  });

  it('rejects a date that the calendar rolled over', () => {
    expect(isInboxTimestamp('2026-02-31T00:00:00Z')).toBe(false);
    expect(isInboxTimestamp('2026-04-31T00:00:00Z')).toBe(false);
    expect(isInboxTimestamp('2026-02-29T00:00:00Z')).toBe(false);
    expect(isInboxTimestamp('1900-02-29T00:00:00Z')).toBe(false);
  });

  it('rejects out-of-range components', () => {
    expect(isInboxTimestamp('2026-13-01T00:00:00Z')).toBe(false);
    expect(isInboxTimestamp('2026-00-10T00:00:00Z')).toBe(false);
    expect(isInboxTimestamp('2026-10-00T00:00:00Z')).toBe(false);
    expect(isInboxTimestamp('2026-10-18T24:00:00Z')).toBe(false);
    expect(isInboxTimestamp('2026-10-18T12:60:00Z')).toBe(false);
    expect(isInboxTimestamp('2026-10-18T12:00:60Z')).toBe(false);
    expect(isInboxTimestamp('2026-10-18T12:00:00+24:00')).toBe(false);
    expect(isInboxTimestamp('2026-10-18T12:00:00+03:60')).toBe(false);
  });

  it('rejects shapes a backend should never send', () => {
    expect(isInboxTimestamp('2026-10-18')).toBe(false);
    expect(isInboxTimestamp('2026-10-18 12:00:00Z')).toBe(false);
    expect(isInboxTimestamp('18.10.2026 12:00')).toBe(false);
    expect(isInboxTimestamp('yesterday')).toBe(false);
    expect(isInboxTimestamp('')).toBe(false);
  });

  it('rejects anything that is not a string', () => {
    expect(isInboxTimestamp(1_792_324_800_000)).toBe(false);
    expect(isInboxTimestamp(new Date())).toBe(false);
    expect(isInboxTimestamp(null)).toBe(false);
    expect(isInboxTimestamp(undefined)).toBe(false);
  });
});

describe('isInboxDayKey', () => {
  it('accepts a real calendar day', () => {
    expect(isInboxDayKey('2026-10-18')).toBe(true);
    expect(isInboxDayKey('2024-02-29')).toBe(true);
  });

  it('rejects a rolled-over day, a wrong shape and a non-string', () => {
    expect(isInboxDayKey('2026-02-29')).toBe(false);
    expect(isInboxDayKey('2026-13-01')).toBe(false);
    expect(isInboxDayKey('2026-10-18T00:00:00Z')).toBe(false);
    expect(isInboxDayKey(20261018)).toBe(false);
  });
});

describe('dayKeyOf / dayKeyOfInstant', () => {
  const instant = '2026-10-18T22:30:00Z';

  it('expresses the same instant as a different day in different zones', () => {
    expect(dayKeyOfInstant(instant, 'UTC')).toBe('2026-10-18');
    expect(dayKeyOfInstant(instant, 'Asia/Tokyo')).toBe('2026-10-19');
    expect(dayKeyOfInstant(instant, 'America/Los_Angeles')).toBe('2026-10-18');
  });

  it('accepts a Date as well as an instant string', () => {
    expect(dayKeyOf(new Date(instant), 'Asia/Tokyo')).toBe('2026-10-19');
  });

  it('falls back to the date part when the instant cannot be parsed', () => {
    expect(dayKeyOfInstant('not-a-time', 'UTC')).toBe('not-a-time');
  });
});

describe('addDaysToDayKey', () => {
  it('crosses a month and a year boundary', () => {
    expect(addDaysToDayKey('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDaysToDayKey('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDaysToDayKey('2027-01-01', -1)).toBe('2026-12-31');
  });

  it('rejects a value that is not a calendar day', () => {
    expect(() => addDaysToDayKey('2026-10', 1)).toThrow(RangeError);
  });
});

describe('createInboxTimeAnchor', () => {
  it('fixes today and yesterday in the given zone, across midnight', () => {
    // 00:30 on the 18th in Moscow is still the evening of the 17th in Berlin.
    const nowMs = Date.parse('2026-10-18T00:30:00+03:00');

    expect(createInboxTimeAnchor(nowMs, 'Europe/Moscow')).toEqual({
      nowMs,
      today: '2026-10-18',
      yesterday: '2026-10-17',
    });
    expect(createInboxTimeAnchor(nowMs, 'Europe/Berlin')).toEqual({
      nowMs,
      today: '2026-10-17',
      yesterday: '2026-10-16',
    });
  });
});

describe('systemInboxClock', () => {
  it('reports the current time in milliseconds', () => {
    const clock = systemInboxClock();
    const before = Date.now();
    const now = clock.now();
    const after = Date.now();
    expect(now).toBeGreaterThanOrEqual(before);
    expect(now).toBeLessThanOrEqual(after);
  });
});

describe('formatInboxRelativeTime', () => {
  const nowMs = Date.parse('2026-10-18T12:00:00Z');
  const en = defaultMessages.en;
  const ru = defaultMessages.ru;

  it('says “just now” for the first minute, including clock skew', () => {
    expect(formatInboxRelativeTime('2026-10-18T11:59:30Z', nowMs, en, 'en')).toBe('just now');
    expect(formatInboxRelativeTime('2026-10-18T12:00:05Z', nowMs, en, 'en')).toBe('just now');
    expect(formatInboxRelativeTime('2026-10-18T12:05:00Z', nowMs, ru, 'ru')).toBe('только что');
  });

  it('counts whole minutes and hours', () => {
    expect(formatInboxRelativeTime('2026-10-18T11:55:00Z', nowMs, en, 'en')).toBe('5 minutes ago');
    expect(formatInboxRelativeTime('2026-10-18T11:59:00Z', nowMs, en, 'en')).toBe('1 minute ago');
    expect(formatInboxRelativeTime('2026-10-18T09:00:00Z', nowMs, en, 'en')).toBe('3 hours ago');
  });

  it('uses the plural form of the locale', () => {
    expect(formatInboxRelativeTime('2026-10-18T11:58:00Z', nowMs, ru, 'ru')).toBe('2 минуты назад');
    expect(formatInboxRelativeTime('2026-10-18T11:55:00Z', nowMs, ru, 'ru')).toBe('5 минут назад');
    expect(formatInboxRelativeTime('2026-10-18T09:00:00Z', nowMs, ru, 'ru')).toBe('3 часа назад');
  });
});

describe('formatInboxDayLabel', () => {
  const anchor = createInboxTimeAnchor(Date.parse('2026-10-18T12:00:00Z'), 'UTC');

  it('names today and yesterday', () => {
    expect(formatInboxDayLabel('2026-10-18', anchor, defaultMessages.en, 'en-GB')).toBe('Today');
    expect(formatInboxDayLabel('2026-10-17', anchor, defaultMessages.ru, 'ru')).toBe('Вчера');
  });

  it('formats an older day with its weekday', () => {
    expect(formatInboxDayLabel('2026-10-12', anchor, defaultMessages.en, 'en-GB')).toBe(
      'Monday 12 October',
    );
    expect(formatInboxDayLabel('2026-10-12', anchor, defaultMessages.ru, 'ru')).toBe(
      'понедельник, 12 октября',
    );
  });

  it('adds the year only when it differs from today', () => {
    expect(formatInboxDayLabel('2025-12-31', anchor, defaultMessages.en, 'en-GB')).toBe(
      'Wednesday, 31 December 2025',
    );
  });
});

describe('formatInboxItemTime', () => {
  const anchor = createInboxTimeAnchor(Date.parse('2026-10-18T12:00:00Z'), 'UTC');

  it('uses a relative label inside today', () => {
    expect(
      formatInboxItemTime('2026-10-18T11:55:00Z', 'en', 'UTC', anchor, defaultMessages.en),
    ).toBe('5 minutes ago');
  });

  it('uses a short absolute date outside today', () => {
    expect(
      formatInboxItemTime('2026-10-17T09:00:00Z', 'en-GB', 'UTC', anchor, defaultMessages.en),
    ).toBe('17 Oct');
    expect(
      formatInboxItemTime('2025-12-31T09:00:00Z', 'en-GB', 'UTC', anchor, defaultMessages.en),
    ).toBe('31 Dec 2025');
  });

  it('decides “today” in the configured zone, not in UTC', () => {
    const instant = '2026-10-18T22:30:00Z';
    const tokyo = createInboxTimeAnchor(Date.parse('2026-10-19T01:00:00Z'), 'Asia/Tokyo');
    // In Tokyo the notification belongs to today, so it gets a relative label.
    expect(formatInboxItemTime(instant, 'en', 'Asia/Tokyo', tokyo, defaultMessages.en)).toBe(
      '2 hours ago',
    );
    // In UTC the same instant is still the 18th and reads as an absolute date.
    const utc = createInboxTimeAnchor(Date.parse('2026-10-19T01:00:00Z'), 'UTC');
    expect(formatInboxItemTime(instant, 'en-GB', 'UTC', utc, defaultMessages.en)).toBe('18 Oct');
  });
});
