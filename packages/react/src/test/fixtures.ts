/**
 * Explicit fixtures for the React binding tests.
 *
 * No random data and no real clock: the mock adapter receives the same injected
 * time as the provider, so the derived day groups and relative labels are
 * reproducible.
 */
import { createMockAdapter } from '@nickkupriyanov/inboxline-core';
import type { InboxNotification } from '@nickkupriyanov/inboxline-core';

/** 19 October 2026, 12:00 UTC — a fixed moment for every test. */
export const FIXED_NOW = Date.UTC(2026, 9, 19, 12, 0, 0);

export const testClock = { now: () => FIXED_NOW };

export function notification(
  id: string,
  overrides: Partial<InboxNotification> = {},
): InboxNotification {
  return {
    id,
    createdAt: '2026-10-19T11:00:00Z',
    title: `Notification ${id}`,
    read: false,
    ...overrides,
  };
}

/** Context `user-a`: four rows, three of them unread, two per page. */
export const CONTEXT_A = { key: 'user-a' };
export const CONTEXT_B = { key: 'user-b' };

export const NOTIFICATIONS_A: readonly InboxNotification[] = [
  notification('n4', { createdAt: '2026-10-19T11:00:00Z', title: 'Fourth', read: false }),
  notification('n3', { createdAt: '2026-10-19T10:00:00Z', title: 'Third', read: false }),
  notification('n2', { createdAt: '2026-10-18T10:00:00Z', title: 'Second', read: true }),
  notification('n1', { createdAt: '2026-10-17T10:00:00Z', title: 'First', read: false }),
];

export const NOTIFICATIONS_B: readonly InboxNotification[] = [
  notification('b1', { createdAt: '2026-10-18T09:00:00Z', title: 'Only B', read: false }),
];

export function createFixtureAdapter(
  options: {
    pageSize?: number;
    latencyMs?: number;
    contexts?: readonly {
      context: { key: string };
      notifications?: readonly InboxNotification[];
    }[];
  } = {},
) {
  return createMockAdapter({
    clock: testClock,
    pageSize: options.pageSize ?? 2,
    ...(options.latencyMs === undefined ? {} : { latencyMs: options.latencyMs }),
    contexts: options.contexts ?? [
      { context: CONTEXT_A, notifications: NOTIFICATIONS_A },
      { context: CONTEXT_B, notifications: NOTIFICATIONS_B },
    ],
  });
}
