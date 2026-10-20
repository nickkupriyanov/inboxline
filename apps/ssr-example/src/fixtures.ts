/**
 * Deterministic demo data shared by the server render and the client.
 *
 * The same rows, the same fixed clock and the same adapter configuration run on
 * both sides, so the hydrated page continues from the server's data instead of
 * showing a second, unrelated list.
 */
import { createMockAdapter } from '@nickkupriyanov/inboxline-core';
import type { InboxContext, InboxNotification } from '@nickkupriyanov/inboxline-core';

/** 20 October 2026, 12:00 UTC — the demo's “now”, on both sides. */
export const DEMO_NOW = Date.parse('2026-10-20T12:00:00Z');

export const DEMO_CONTEXT: InboxContext = { key: 'inboxline-ssr-demo' };

export const DEMO_NOTIFICATIONS: readonly InboxNotification[] = [
  {
    id: 'demo-4',
    createdAt: '2026-10-20T11:52:00Z',
    title: 'Deploy finished',
    body: 'inboxline-web is live on production.',
    author: { name: 'Release bot' },
    read: false,
  },
  {
    id: 'demo-3',
    createdAt: '2026-10-20T10:15:00Z',
    title: 'New comment on “SSR checklist”',
    body: 'Maria left a note about the hydration fallback.',
    author: { name: 'Maria' },
    read: false,
  },
  {
    id: 'demo-2',
    createdAt: '2026-10-19T16:40:00Z',
    title: 'Access request approved',
    body: 'Workspace analytics is now available to you.',
    read: true,
  },
  {
    id: 'demo-1',
    createdAt: '2026-10-18T09:05:00Z',
    title: 'Weekly digest',
    body: 'Four events happened in the last seven days.',
    read: false,
  },
];

/** The adapter used by both entries; a fresh instance per provider. */
export function createDemoAdapter() {
  return createMockAdapter({
    clock: { now: () => DEMO_NOW },
    pageSize: 10,
    contexts: [{ context: DEMO_CONTEXT, notifications: DEMO_NOTIFICATIONS }],
  });
}
