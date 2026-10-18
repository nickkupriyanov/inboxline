import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CONTEXT_KEY,
  DEFAULT_FILTER,
  DEFAULT_INBOX_CONTEXT,
  INBOX_FILTERS,
  isInboxContext,
  isInboxFilter,
  isSameInboxContext,
} from './context';

describe('context defaults', () => {
  it('works against an implicit context', () => {
    expect(DEFAULT_CONTEXT_KEY).toBe('default');
    expect(DEFAULT_INBOX_CONTEXT).toEqual({ key: 'default' });
  });

  it('starts on the full list', () => {
    expect(INBOX_FILTERS).toEqual(['all', 'unread']);
    expect(DEFAULT_FILTER).toBe('all');
  });
});

describe('isInboxFilter', () => {
  it('accepts the shipped filters', () => {
    expect(isInboxFilter('all')).toBe(true);
    expect(isInboxFilter('unread')).toBe(true);
  });

  it('rejects anything else rather than falling back silently', () => {
    expect(isInboxFilter('read')).toBe(false);
    expect(isInboxFilter('')).toBe(false);
    expect(isInboxFilter(42)).toBe(false);
    expect(isInboxFilter(undefined)).toBe(false);
  });
});

describe('isInboxContext', () => {
  it('accepts a key, with or without context data', () => {
    expect(isInboxContext({ key: 'user-1' })).toBe(true);
    expect(isInboxContext({ key: 'workspace-7', data: { tenant: 'acme' } })).toBe(true);
  });

  it('rejects a missing, empty or non-string key', () => {
    expect(isInboxContext({})).toBe(false);
    expect(isInboxContext({ key: '' })).toBe(false);
    expect(isInboxContext({ key: 7 })).toBe(false);
    expect(isInboxContext(null)).toBe(false);
    expect(isInboxContext('user-1')).toBe(false);
  });
});

describe('isSameInboxContext', () => {
  it('compares the key and ignores context data', () => {
    expect(isSameInboxContext({ key: 'user-1' }, { key: 'user-1', data: { token: 'fresh' } })).toBe(
      true,
    );
  });

  it('separates different keys', () => {
    expect(isSameInboxContext({ key: 'user-1' }, { key: 'user-2' })).toBe(false);
  });

  it('treats a missing context as the default one', () => {
    expect(isSameInboxContext(undefined, { key: DEFAULT_CONTEXT_KEY })).toBe(true);
    expect(isSameInboxContext(undefined, undefined)).toBe(true);
    expect(isSameInboxContext(undefined, { key: 'user-1' })).toBe(false);
  });
});
