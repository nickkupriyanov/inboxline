import { describe, expect, it } from 'vitest';
import * as core from './index';

/**
 * The entry point of the core: the integration contract, the state machine, the
 * derived view model, the controller and the copy, and nothing that talks to a
 * network or the DOM. The list is deliberate — a new runtime export has to be
 * added here, which is the moment to ask whether it belongs in the surface of the
 * core at all.
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
  // stable class names
  'IL_CLASS',
  // configuration
  'FALLBACK_LOCALE',
  'FALLBACK_TIME_ZONE',
  'isSupportedInboxLocale',
  'isSupportedInboxTimeZone',
  'resolveInboxConfig',
  // controller
  'createInboxController',
  // context and filter
  'DEFAULT_CONTEXT_KEY',
  'DEFAULT_INBOX_CONTEXT',
  'DEFAULT_FILTER',
  'INBOX_FILTERS',
  'isInboxFilter',
  'isInboxContext',
  'isSameInboxContext',
  // derived view model
  'INBOX_VIEW_TIME_BUCKET_MS',
  'createInboxViewMemo',
  'deriveInboxView',
  'inboxViewKey',
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
  // mock adapter
  'createMockAdapter',
  // copy
  'defaultMessages',
  'resolveMessageLocale',
  'resolveMessages',
  'format',
  'selectPlural',
  // state machine
  'createInboxState',
  'inboxReducer',
  // time
  'isInboxTimestamp',
  'isInboxDayKey',
  'dayKeyOf',
  'dayKeyOfInstant',
  'addDaysToDayKey',
  'createInboxTimeAnchor',
  'systemInboxClock',
  'formatInboxRelativeTime',
  'formatInboxDayLabel',
  'formatInboxItemTime',
];

describe('@nickkupriyanov/inboxline-core entry point', () => {
  it('imports without browser globals', () => {
    expect(core).toBeTypeOf('object');
    expect(typeof window).toBe('undefined');
    expect(typeof document).toBe('undefined');
  });

  it('exports the contract, the state machine, the controller and the copy, and nothing else', () => {
    expect(Object.keys(core).sort()).toEqual([...EXPECTED_EXPORTS].sort());
  });

  it('exports the controller runtime next to the derived view', () => {
    expect(typeof core.deriveInboxView).toBe('function');
    expect(typeof core.createInboxController).toBe('function');
  });
});
