import { describe, expect, it } from 'vitest';
import * as core from './index';

/**
 * The entry point of Iteration 1: the integration contract and nothing that
 * talks to a network or the DOM. The list is deliberate — a new runtime export
 * has to be added here, which is the moment to ask whether it belongs in the
 * surface of the core at all.
 */
const EXPECTED_EXPORTS: readonly string[] = [
  // adapter contract and boundary checks
  'isInboxAuthor',
  'isInboxNotification',
  'isInboxPage',
  'isInboxUnreadCount',
  'isInboxReadStatusResult',
  'isInboxMarkAllReadResult',
  'assertInboxPage',
  'assertInboxUnreadCount',
  'assertInboxReadStatusResult',
  'assertInboxMarkAllReadResult',
  // context and filter
  'DEFAULT_CONTEXT_KEY',
  'DEFAULT_INBOX_CONTEXT',
  'DEFAULT_FILTER',
  'INBOX_FILTERS',
  'isInboxFilter',
  'isInboxContext',
  'isSameInboxContext',
  // errors
  'INBOX_ERROR_CODES',
  'INBOX_ERROR_PHASES',
  'INBOX_ERROR_OUTCOMES',
  'InboxError',
  'isInboxErrorCode',
  'isInboxErrorPhase',
  'isInboxErrorOutcome',
  'isInboxError',
  'isUnknownOutcomeError',
  'toInboxError',
  'createUnknownOutcomeError',
  'isAbortError',
  'createAbortError',
  // time
  'isInboxTimestamp',
];

describe('@nickkupriyanov/inboxline-core entry point', () => {
  it('imports without browser globals', () => {
    expect(core).toBeTypeOf('object');
    expect(typeof window).toBe('undefined');
    expect(typeof document).toBe('undefined');
  });

  it('exports the contract of Iteration 1 and nothing else', () => {
    expect(Object.keys(core).sort()).toEqual([...EXPECTED_EXPORTS].sort());
  });

  it('exports no React binding and no controller runtime yet', () => {
    expect('createInboxController' in core).toBe(false);
    expect('createInboxReducer' in core).toBe(false);
  });
});
