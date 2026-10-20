import { createMockAdapter } from '@nickkupriyanov/inboxline-core';

/** 21 October 2026, 12:00 UTC — the consumer and its server share this moment. */
export const FIXED_NOW = Date.UTC(2026, 9, 21, 12, 0, 0);

export const CONTEXT = { key: 'install-check' };

export const NOTIFICATIONS = [
  {
    id: 'install-3',
    title: 'Install check: newest',
    body: 'The packed React binding rendered this row.',
    createdAt: new Date(FIXED_NOW - 5 * 60_000).toISOString(),
    read: false,
  },
  {
    id: 'install-2',
    title: 'Install check: second',
    body: 'The packed stylesheet is loaded next to it.',
    createdAt: new Date(FIXED_NOW - 40 * 60_000).toISOString(),
    read: false,
  },
  {
    id: 'install-1',
    title: 'Install check: read',
    body: 'A read row keeps the counter honest.',
    createdAt: new Date(FIXED_NOW - 2 * 60 * 60_000).toISOString(),
    read: true,
  },
  {
    id: 'install-0',
    title: 'Install check: unread',
    body: 'Three of the four rows are unread.',
    createdAt: new Date(FIXED_NOW - 26 * 60 * 60_000).toISOString(),
    read: false,
  },
];

export function createSeed() {
  return {
    page: { items: NOTIFICATIONS, nextCursor: null },
    unreadCount: 3,
    now: FIXED_NOW,
  };
}

export function createAdapter() {
  return createMockAdapter({
    clock: { now: () => FIXED_NOW },
    pageSize: 10,
    contexts: [{ context: CONTEXT, notifications: NOTIFICATIONS }],
  });
}
