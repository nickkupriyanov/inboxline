import { describe, expect, it } from 'vitest';
import { isInboxTimestamp } from './time';

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
