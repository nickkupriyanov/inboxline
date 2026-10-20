/**
 * The HTTP contract and the controller on top of it.
 *
 * The first half checks the translation and the classified failures directly.
 * The second half drives the real controller through the real server, which is
 * the path an application uses: request → server → snapshot. The lost-answer
 * scenarios are reported by the server, not simulated with a fake rejection.
 */
import { describe, expect, it } from 'vitest';
import { createInboxController } from '@nickkupriyanov/inboxline-core';
import type { InboxAdapter, InboxSnapshot } from '@nickkupriyanov/inboxline-core';
import { createInboxHttpAdapter } from './adapter';
import type { InboxHttpScenario, ServerNotificationRow } from './adapter';
import { createExampleServer } from './server.mjs';

const NOW = Date.parse('2026-10-21T12:00:00Z');

function serverRow(
  notificationId: string,
  minutesAgo: number,
  isRead: boolean,
  headline: string,
  extra: Partial<ServerNotificationRow> = {},
): ServerNotificationRow {
  return {
    notificationId,
    headline,
    occurredAt: new Date(NOW - minutesAgo * 60_000).toISOString(),
    isRead,
    ...extra,
  };
}

const SEED: Record<string, readonly ServerNotificationRow[]> = {
  'ws-a': [
    serverRow('a1', 5, false, 'First row', {
      message: 'First body',
      actor: { id: 'ann', displayName: 'Ann Marie', avatar: 'https://img.test/ann.png' },
      iconUrl: 'https://img.test/icon.svg',
      payload: { project: 'inboxline', kind: 'deploy' },
    }),
    serverRow('a2', 30, false, 'Second row'),
    serverRow('a3', 60, true, 'Third row, read'),
    serverRow('a4', 120, false, 'Fourth row'),
    serverRow('a5', 180, true, 'Fifth row, read'),
    serverRow('a6', 2 * 24 * 60, false, 'Sixth row on another day'),
  ],
  'ws-b': [serverRow('b1', 10, false, 'Workspace B row')],
};

interface Harness {
  base: string;
  server: ReturnType<typeof createExampleServer>;
  adapter: InboxAdapter;
}

async function withServer(
  scenario: InboxHttpScenario,
  run: (harness: Harness) => Promise<void>,
): Promise<void> {
  const server = createExampleServer({ now: () => NOW, seed: SEED });
  const address = await server.listen(0);
  const base = `http://127.0.0.1:${address.port}`;
  try {
    await run({
      base,
      server,
      adapter: createInboxHttpAdapter({ baseUrl: base, pageSize: 2, scenario }),
    });
  } finally {
    await server.close();
  }
}

function query(contextKey = 'ws-a') {
  return {
    context: { key: contextKey },
    filter: 'all' as const,
    cursor: null,
    signal: new AbortController().signal,
  };
}

async function settle<T>(read: () => T | null): Promise<T> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const value = read();
    if (value !== null) return value;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error('The controller did not settle in time');
}

function controllerFor(adapter: InboxAdapter) {
  const controller = createInboxController({
    adapter,
    context: { key: 'ws-a' },
    clock: { now: () => NOW },
    config: { locale: 'en', timeZone: 'UTC' },
  });
  controller.start();
  return controller;
}

function item(snapshot: InboxSnapshot, id: string) {
  return snapshot.view.list.items.find((row) => row.id === id);
}

/* -------------------------------------------------------------------------- */
/*  Translation and errors                                                     */
/* -------------------------------------------------------------------------- */

describe('the HTTP adapter contract', () => {
  it('translates the server payload into the core contract', async () => {
    await withServer('normal', async ({ adapter }) => {
      const page = await adapter.getNotifications(query());

      expect(page.items.map((row) => row.id)).toEqual(['a1', 'a2']);
      expect(page.items[0]).toMatchObject({
        title: 'First row',
        body: 'First body',
        read: false,
        createdAt: new Date(NOW - 5 * 60_000).toISOString(),
        author: { id: 'ann', name: 'Ann Marie', avatarUrl: 'https://img.test/ann.png' },
        icon: 'https://img.test/icon.svg',
        data: { project: 'inboxline', kind: 'deploy' },
      });
      expect(typeof page.nextCursor).toBe('string');
    });
  });

  it('counts the whole workspace, independently of filter and page', async () => {
    await withServer('normal', async ({ adapter }) => {
      const first = await adapter.getNotifications(query());
      const count = await adapter.getUnreadCount({
        context: { key: 'ws-a' },
        signal: new AbortController().signal,
      });

      expect(first.items).toHaveLength(2);
      expect(count.unreadCount).toBe(4);
    });
  });

  it('passes the filter and paginates without duplicates', async () => {
    await withServer('normal', async ({ adapter }) => {
      const unread = await adapter.getNotifications({ ...query(), filter: 'unread' });
      expect(unread.items.map((row) => row.id)).toEqual(['a1', 'a2']);
      expect(unread.items.every((row) => !row.read)).toBe(true);

      const first = await adapter.getNotifications(query());
      const second = await adapter.getNotifications({
        ...query(),
        cursor: first.nextCursor,
      });
      expect(second.items.map((row) => row.id)).toEqual(['a3', 'a4']);

      const third = await adapter.getNotifications({ ...query(), cursor: second.nextCursor });
      expect(third.items.map((row) => row.id)).toEqual(['a5', 'a6']);
      expect(third.nextCursor).toBeNull();
    });
  });

  it('isolates two workspaces', async () => {
    await withServer('normal', async ({ adapter }) => {
      const a = await adapter.getNotifications(query('ws-a'));
      const b = await adapter.getNotifications(query('ws-b'));
      const countB = await adapter.getUnreadCount({
        context: { key: 'ws-b' },
        signal: new AbortController().signal,
      });

      expect(a.items.map((row) => row.id)).toEqual(['a1', 'a2']);
      expect(b.items.map((row) => row.id)).toEqual(['b1']);
      expect(countB.unreadCount).toBe(1);
    });
  });

  it('maps a read change and its counter', async () => {
    await withServer('normal', async ({ adapter }) => {
      const result = await adapter.setReadStatus({
        id: 'a1',
        read: true,
        context: { key: 'ws-a' },
      });

      expect(result.notification.read).toBe(true);
      expect(result.unreadCount).toBe(3);

      const repeat = await adapter.setReadStatus({
        id: 'a1',
        read: true,
        context: { key: 'ws-a' },
      });
      expect(repeat.unreadCount).toBe(3);
    });
  });

  it('classifies a confirmed refusal and leaves the data alone', async () => {
    await withServer('read-refused', async ({ adapter }) => {
      await expect(
        adapter.setReadStatus({ id: 'a1', read: true, context: { key: 'ws-a' } }),
      ).rejects.toMatchObject({
        name: 'InboxError',
        code: 'CONFLICT',
        phase: 'mutation',
        outcome: 'rejected',
      });

      const count = await adapter.getUnreadCount({
        context: { key: 'ws-a' },
        signal: new AbortController().signal,
      });
      expect(count.unreadCount).toBe(4);
    });
  });

  it('keeps a counter failure separate from a successful list', async () => {
    await withServer('count-refused', async ({ adapter }) => {
      const page = await adapter.getNotifications(query());
      expect(page.items).toHaveLength(2);

      await expect(
        adapter.getUnreadCount({
          context: { key: 'ws-a' },
          signal: new AbortController().signal,
        }),
      ).rejects.toMatchObject({
        name: 'InboxError',
        code: 'ADAPTER_FAILURE',
        phase: 'load',
      });
    });
  });

  it('lets the first page through and refuses only the next one', async () => {
    await withServer('page-refused', async ({ adapter }) => {
      const first = await adapter.getNotifications(query());
      expect(first.items).toHaveLength(2);

      await expect(
        adapter.getNotifications({ ...query(), cursor: first.nextCursor }),
      ).rejects.toMatchObject({
        name: 'InboxError',
        code: 'ADAPTER_FAILURE',
        phase: 'load',
      });
    });
  });

  it('reports a missing notification and an invalid workspace', async () => {
    await withServer('normal', async ({ adapter }) => {
      await expect(
        adapter.setReadStatus({ id: 'nothing', read: true, context: { key: 'ws-a' } }),
      ).rejects.toMatchObject({ code: 'NOT_FOUND', phase: 'mutation' });

      await expect(adapter.getNotifications(query(''))).rejects.toMatchObject({
        code: 'ADAPTER_CONTRACT_VIOLATION',
        phase: 'load',
      });
    });
  });

  it('passes the abort signal to fetch', async () => {
    const seen: AbortSignal[] = [];
    const fetchImpl = ((_input: RequestInfo | URL, init?: RequestInit) => {
      return new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal;
        if (signal) {
          seen.push(signal);
          signal.addEventListener('abort', () => {
            reject(new DOMException('The request was aborted', 'AbortError'));
          });
        }
      });
    }) as typeof globalThis.fetch;

    const adapter = createInboxHttpAdapter({ baseUrl: 'http://example.test', fetch: fetchImpl });
    const controller = new AbortController();
    const pending = adapter.getNotifications({ ...query(), signal: controller.signal });
    controller.abort();

    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(seen).toHaveLength(1);
  });
});

/* -------------------------------------------------------------------------- */
/*  The controller over HTTP                                                   */
/* -------------------------------------------------------------------------- */

describe('the controller over HTTP', () => {
  it('marks the whole workspace read, including rows never loaded', async () => {
    await withServer('normal', async ({ adapter, server }) => {
      const controller = controllerFor(adapter);
      await settle(() => {
        const snapshot = controller.getSnapshot();
        return snapshot.state.listStatus === 'ready' && snapshot.state.countStatus === 'ready'
          ? snapshot
          : null;
      });

      expect(controller.getSnapshot().state.order).toEqual(['a1', 'a2']);
      await controller.actions.markAllRead();

      const afterBulk = controller.getSnapshot();
      expect(afterBulk.state.unreadCount).toBe(0);
      expect(afterBulk.view.list.items.every((row) => row.read)).toBe(true);

      // The rows beyond the loaded page are read too: the server applied it to
      // the workspace, not to the two rows this client happened to load.
      const first = await adapter.getNotifications(query());
      const second = await adapter.getNotifications({ ...query(), cursor: first.nextCursor });
      expect([...first.items, ...second.items].every((row) => row.read)).toBe(true);

      server.addNotification(
        'ws-a',
        serverRow('a-new', -1, false, 'A new event after the bulk boundary'),
      );
      await controller.actions.refresh();

      const refreshed = controller.getSnapshot();
      expect(refreshed.state.unreadCount).toBe(1);
      expect(refreshed.view.list.items[0]?.id).toBe('a-new');
      expect(refreshed.view.list.items[0]?.read).toBe(false);
    });
  });

  it('keeps the loaded rows when the next page fails', async () => {
    await withServer('page-refused', async ({ adapter }) => {
      const controller = controllerFor(adapter);
      await settle(() =>
        controller.getSnapshot().state.listStatus === 'ready' ? controller.getSnapshot() : null,
      );

      await controller.actions.loadMore();

      const snapshot = controller.getSnapshot();
      expect(snapshot.state.order).toEqual(['a1', 'a2']);
      expect(snapshot.view.page.error).not.toBeNull();
      expect(snapshot.view.list.items).toHaveLength(2);
    });
  });

  it('represents a lost read answer and reconciles it', async () => {
    await withServer('read-lost', async ({ adapter, server }) => {
      const controller = controllerFor(adapter);
      const seen = new Set<string>();
      controller.subscribe(() => {
        const row = item(controller.getSnapshot(), 'a1');
        if (row?.pending) seen.add('pending');
        if (row?.unknown) seen.add('unknown');
      });

      await settle(() => (controller.getSnapshot().state.listStatus === 'ready' ? true : null));
      await controller.actions.setRead('a1', true);
      await settle(() => (item(controller.getSnapshot(), 'a1')?.unknown ? null : true));

      expect(seen.has('unknown')).toBe(true);
      expect(controller.getSnapshot().state.unreadCount).toBe(3);
      expect(
        server.state.workspaces.get('ws-a')?.find((row) => row.notificationId === 'a1')?.isRead,
      ).toBe(true);
      expect(item(controller.getSnapshot(), 'a1')?.read).toBe(true);
    });
  });

  it('represents a lost bulk answer and reconciles it', async () => {
    await withServer('bulk-lost', async ({ adapter, server }) => {
      const controller = controllerFor(adapter);
      const seen = new Set<string>();
      controller.subscribe(() => {
        const status = controller.getSnapshot().view.actions.bulkStatus;
        if (status !== 'idle') seen.add(status);
      });

      await settle(() => (controller.getSnapshot().state.countStatus === 'ready' ? true : null));
      await controller.actions.markAllRead();
      await settle(() =>
        controller.getSnapshot().view.actions.bulkStatus === 'idle' ? true : null,
      );

      expect(seen.has('unknown')).toBe(true);
      expect(controller.getSnapshot().state.unreadCount).toBe(0);
      expect(server.state.workspaces.get('ws-a')?.every((row) => row.isRead)).toBe(true);
    });
  });
});
