import { describe, expect, it } from 'vitest';
import * as react from './index';

/**
 * The entry point of the React binding: the provider, the ready-made feed and
 * the two headless hooks, and nothing that duplicates domain logic. The list is
 * deliberate — a new runtime export has to be added here, which is the moment to
 * ask whether it belongs in the surface at all.
 */
const EXPECTED_EXPORTS: readonly string[] = [
  'DEFAULT_INBOX_COMPONENTS',
  'DefaultAvatar',
  'DefaultEmpty',
  'DefaultError',
  'DefaultFilters',
  'DefaultHeader',
  'DefaultLoading',
  'DefaultNotificationItem',
  'DefaultPageError',
  'DefaultTrigger',
  'Inbox',
  'InboxProvider',
  'cssAnimations',
  'useInboxFlow',
  'useInboxUI',
];

describe('@nickkupriyanov/inboxline-react entry point', () => {
  it('imports in a DOM environment without touching the DOM at import time', () => {
    expect(react).toBeTypeOf('object');
  });

  it('exports exactly the provider, the feed and the headless hooks', () => {
    expect(Object.keys(react).sort()).toEqual([...EXPECTED_EXPORTS].sort());
  });
});
