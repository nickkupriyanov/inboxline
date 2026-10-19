/**
 * The deterministic mock adapter and its server simulator.
 *
 * Every scenario here is a plain sequence of adapter calls: fixtures in, pages,
 * counters, mutations, invalidations and injected failures out. Time is fixed,
 * delays use fake timers where they matter, and the assertions look at what a
 * controller would observe through the same contract a real backend implements.
 */
import { describe, expect, expectTypeOf, it, vi } from 'vitest';
import { DEFAULT_INBOX_CONTEXT } from './context';
import { isAbortError, isInboxError, isUnknownOutcomeError } from './errors';
import { createMockAdapter } from './mock';
import type { InboxMockAdapter, InboxMockOptions } from './mock';
import type { InboxContext, InboxFilter, InboxNotification } from './types';

const BASE_MS = Date.parse('2026-10-18T12:00:00Z');
const NOW_MS = Date.parse('2026-10-18T13:00:00Z');

const CONTEXT: InboxContext = { key: 'user-1' };
const OTHER_CONTEXT: InboxContext = { key: 'user-2' };

function note(
  id: string,
  overrides: Partial<Omit<InboxNotification, 'id'>> = {},
): InboxNotification {
  return {
    id,
    createdAt: new Date(BASE_MS).toISOString(),
    title: `Notification ${id}`,
    read: false,
    ...overrides,
  };
}

/** `count` unread rows, newest first, one minute apart by default. */
function series(
  count: number,
  options: { read?: boolean; startMs?: number; stepMs?: number } = {},
): InboxNotification[] {
  const { read = false, startMs = BASE_MS, stepMs = 60_000 } = options;
  return Array.from({ length: count }, (_, index) =>
    note(`n-${String(index + 1).padStart(2, '0')}`, {
      createdAt: new Date(startMs - index * stepMs).toISOString(),
      read,
    }),
  );
}

function clockAt(nowMs = NOW_MS): { now: () => number } {
  return { now: () => nowMs };
}

function fixtureAdapter(
  notifications: readonly InboxNotification[],
  options: Omit<InboxMockOptions, 'clock' | 'contexts'> = {},
): InboxMockAdapter {
  return createMockAdapter({
    clock: clockAt(),
    contexts: [{ context: CONTEXT, notifications }],
    ...options,
  });
}

function freshSignal(): AbortSignal {
  return new AbortController().signal;
}

async function pageOf(
  adapter: InboxMockAdapter,
  filter: InboxFilter = 'all',
  cursor: string | null = null,
  signal: AbortSignal = freshSignal(),
): Promise<{ ids: string[]; nextCursor: string | null }> {
  const page = await adapter.getNotifications({ context: CONTEXT, filter, cursor, signal });
  return { ids: page.items.map((item) => item.id), nextCursor: page.nextCursor };
}

async function unreadOf(
  adapter: InboxMockAdapter,
  context: InboxContext = CONTEXT,
): Promise<number> {
  return (await adapter.getUnreadCount({ context, signal: freshSignal() })).unreadCount;
}

describe('pagination', () => {
  it('returns pages newest first with an advancing cursor and an explicit end', async () => {
    const adapter = fixtureAdapter(series(5), { pageSize: 2 });

    const first = await pageOf(adapter);
    expect(first.ids).toEqual(['n-01', 'n-02']);
    expect(first.nextCursor).not.toBeNull();

    const second = await pageOf(adapter, 'all', first.nextCursor);
    expect(second.ids).toEqual(['n-03', 'n-04']);
    expect(second.nextCursor).not.toBeNull();

    const third = await pageOf(adapter, 'all', second.nextCursor);
    expect(third.ids).toEqual(['n-05']);
    expect(third.nextCursor).toBeNull();
  });

  it('serves a page of 10 under a counter of 27, including unloaded rows', async () => {
    const adapter = fixtureAdapter(series(27), { pageSize: 10 });

    const first = await adapter.getNotifications({
      context: CONTEXT,
      filter: 'all',
      cursor: null,
      signal: freshSignal(),
    });
    expect(first.items).toHaveLength(10);
    expect(await unreadOf(adapter)).toBe(27);

    const collected = [...first.items.map((item) => item.id)];
    let cursor = first.nextCursor;
    while (cursor !== null) {
      const page = await adapter.getNotifications({
        context: CONTEXT,
        filter: 'all',
        cursor,
        signal: freshSignal(),
      });
      collected.push(...page.items.map((item) => item.id));
      cursor = page.nextCursor;
    }

    expect(collected).toHaveLength(27);
    expect(new Set(collected).size).toBe(27);
    expect(collected[collected.length - 1]).toBe('n-27');
  });

  it('narrows the list to unread rows without narrowing the counter', async () => {
    const notifications = [
      note('a', { createdAt: new Date(BASE_MS).toISOString(), read: false }),
      note('b', { createdAt: new Date(BASE_MS - 60_000).toISOString(), read: true }),
      note('c', { createdAt: new Date(BASE_MS - 120_000).toISOString(), read: false }),
    ];
    const adapter = fixtureAdapter(notifications);

    expect((await pageOf(adapter, 'unread')).ids).toEqual(['a', 'c']);
    expect(await unreadOf(adapter)).toBe(2);
  });

  it('orders equal timestamps by id, deterministically and across pages', async () => {
    const createdAt = new Date(BASE_MS).toISOString();
    const notifications = [
      note('b', { createdAt }),
      note('a', { createdAt }),
      note('c', { createdAt }),
    ];
    const adapter = fixtureAdapter(notifications, { pageSize: 2 });

    const first = await pageOf(adapter);
    const second = await pageOf(adapter, 'all', first.nextCursor);
    expect([...first.ids, ...second.ids]).toEqual(['a', 'b', 'c']);
  });

  it('keeps a newer event from shifting the continuation of a loaded page', async () => {
    const adapter = fixtureAdapter(series(5), { pageSize: 2 });
    const first = await pageOf(adapter);

    adapter.addNotification(
      CONTEXT,
      note('new', { createdAt: new Date(BASE_MS + 60_000).toISOString() }),
    );

    const second = await pageOf(adapter, 'all', first.nextCursor);
    expect(second.ids).toEqual(['n-03', 'n-04']);
  });

  it('continues after the cursor when a row disappears from the unread filter', async () => {
    const adapter = fixtureAdapter(series(5), { pageSize: 2 });
    const first = await pageOf(adapter, 'unread');
    expect(first.ids).toEqual(['n-01', 'n-02']);

    await adapter.setReadStatus({ context: CONTEXT, id: 'n-02', read: true });

    const second = await pageOf(adapter, 'unread', first.nextCursor);
    expect(second.ids).toEqual(['n-03', 'n-04']);

    const third = await pageOf(adapter, 'unread', second.nextCursor);
    expect(third.ids).toEqual(['n-05']);
    expect(third.nextCursor).toBeNull();
  });

  it('rejects a cursor it did not issue', async () => {
    const adapter = fixtureAdapter(series(2));

    const error = await adapter
      .getNotifications({
        context: CONTEXT,
        filter: 'all',
        cursor: 'not-a-mock-cursor',
        signal: freshSignal(),
      })
      .catch((value: unknown) => value);

    expect(isInboxError(error)).toBe(true);
    expect(error).toMatchObject({ code: 'ADAPTER_FAILURE', phase: 'load' });
  });
});

describe('reading state', () => {
  it('reports an empty context as no rows and a known zero', async () => {
    const adapter = fixtureAdapter([]);

    expect(await pageOf(adapter)).toEqual({ ids: [], nextCursor: null });
    expect(await unreadOf(adapter)).toBe(0);
  });

  it('sets one row read and confirms it with the current counter', async () => {
    const adapter = fixtureAdapter(series(3));

    const result = await adapter.setReadStatus({ context: CONTEXT, id: 'n-02', read: true });

    expect(result.notification).toMatchObject({ id: 'n-02', read: true });
    expect(result.unreadCount).toBe(2);
    expect(await unreadOf(adapter)).toBe(2);
    expect((await pageOf(adapter, 'unread')).ids).toEqual(['n-01', 'n-03']);
  });

  it('is idempotent when the same status is set twice', async () => {
    const adapter = fixtureAdapter(series(2));

    const first = await adapter.setReadStatus({ context: CONTEXT, id: 'n-01', read: true });
    const second = await adapter.setReadStatus({ context: CONTEXT, id: 'n-01', read: true });

    expect(second).toEqual(first);
    expect(second.unreadCount).toBe(1);
  });

  it('sets a row back to unread and raises the counter', async () => {
    const adapter = fixtureAdapter(series(2, { read: true }));

    const result = await adapter.setReadStatus({ context: CONTEXT, id: 'n-01', read: false });

    expect(result.notification.read).toBe(false);
    expect(result.unreadCount).toBe(1);
  });

  it('rejects an unknown id as a confirmed NOT_FOUND mutation', async () => {
    const adapter = fixtureAdapter(series(1));

    const error = await adapter
      .setReadStatus({ context: CONTEXT, id: 'missing', read: true })
      .catch((value: unknown) => value);

    expect(isInboxError(error)).toBe(true);
    expect(error).toMatchObject({ code: 'NOT_FOUND', phase: 'mutation', outcome: 'rejected' });
  });

  it('keeps contexts isolated from each other', async () => {
    const adapter = createMockAdapter({
      clock: clockAt(),
      contexts: [
        { context: CONTEXT, notifications: series(2) },
        { context: OTHER_CONTEXT, notifications: [note('other')] },
      ],
    });

    expect(await unreadOf(adapter)).toBe(2);
    expect(await unreadOf(adapter, OTHER_CONTEXT)).toBe(1);

    await adapter.setReadStatus({ context: OTHER_CONTEXT, id: 'other', read: true });

    expect(await unreadOf(adapter)).toBe(2);
    expect(await unreadOf(adapter, OTHER_CONTEXT)).toBe(0);
    expect((await pageOf(adapter)).ids).toEqual(['n-01', 'n-02']);
  });
});

describe('markAllRead', () => {
  it('marks the whole context, including rows that were never loaded', async () => {
    const adapter = fixtureAdapter(series(27), { pageSize: 10 });

    const result = await adapter.markAllRead({ context: CONTEXT });

    expect(result).toEqual({
      boundary: new Date(NOW_MS).toISOString(),
      unreadCount: 0,
    });
    expect(await unreadOf(adapter)).toBe(0);

    const rows: InboxNotification[] = [];
    let cursor: string | null = null;
    do {
      const page = await adapter.getNotifications({
        context: CONTEXT,
        filter: 'all',
        cursor,
        signal: freshSignal(),
      });
      rows.push(...page.items);
      cursor = page.nextCursor;
    } while (cursor !== null);

    expect(rows).toHaveLength(27);
    expect(rows.every((row) => row.read)).toBe(true);
    expect((await pageOf(adapter, 'unread')).ids).toEqual([]);
  });

  it('keeps an event created after the bulk operation unread', async () => {
    const adapter = fixtureAdapter(series(3));
    await adapter.markAllRead({ context: CONTEXT });

    adapter.addNotification(
      CONTEXT,
      note('later', { createdAt: new Date(NOW_MS + 60_000).toISOString() }),
    );

    expect(await unreadOf(adapter)).toBe(1);
    expect((await pageOf(adapter, 'unread')).ids).toEqual(['later']);
  });

  it('uses the injected clock and keeps events after the boundary unread', async () => {
    const notifications = [
      note('before', { createdAt: new Date(NOW_MS - 60_000).toISOString() }),
      note('at-boundary', { createdAt: new Date(NOW_MS).toISOString() }),
      note('after', { createdAt: new Date(NOW_MS + 60_000).toISOString() }),
    ];
    const adapter = fixtureAdapter(notifications);

    const result = await adapter.markAllRead({ context: CONTEXT });

    expect(result.boundary).toBe(new Date(NOW_MS).toISOString());
    expect(result.unreadCount).toBe(1);
    expect(await unreadOf(adapter)).toBe(1);
    expect((await pageOf(adapter, 'unread')).ids).toEqual(['after']);
  });

  it('leaves already-read rows read and returns a known zero', async () => {
    const adapter = fixtureAdapter(series(3, { read: true }));

    const result = await adapter.markAllRead({ context: CONTEXT });

    expect(result.unreadCount).toBe(0);
    expect(await unreadOf(adapter)).toBe(0);
  });
});

describe('server simulator', () => {
  it('adds a new event without notifying subscribers by itself', async () => {
    const adapter = fixtureAdapter(series(2));
    const listener = vi.fn();
    adapter.subscribe({ context: CONTEXT, onInvalidate: listener });

    adapter.addNotification(
      CONTEXT,
      note('new', { createdAt: new Date(BASE_MS + 60_000).toISOString() }),
    );

    expect(listener).not.toHaveBeenCalled();
    expect((await pageOf(adapter)).ids).toEqual(['new', 'n-01', 'n-02']);
    expect(await unreadOf(adapter)).toBe(3);
  });

  it('invalidates only the context that changed and stops after unsubscribe', () => {
    const adapter = fixtureAdapter(series(1));
    const listener = vi.fn();
    const otherListener = vi.fn();
    const unsubscribe = adapter.subscribe({ context: CONTEXT, onInvalidate: listener });
    adapter.subscribe({ context: OTHER_CONTEXT, onInvalidate: otherListener });

    adapter.invalidate(CONTEXT);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(otherListener).not.toHaveBeenCalled();

    unsubscribe();
    adapter.invalidate(CONTEXT);
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('supports a read change made outside the controller', async () => {
    const adapter = fixtureAdapter(series(2));
    const listener = vi.fn();
    adapter.subscribe({ context: CONTEXT, onInvalidate: listener });

    await adapter.setReadStatus({ context: CONTEXT, id: 'n-01', read: true });
    adapter.invalidate(CONTEXT);

    expect(listener).toHaveBeenCalledTimes(1);
    expect(await unreadOf(adapter)).toBe(1);
  });

  it('treats each subscribe call as an independent subscription', () => {
    const adapter = fixtureAdapter(series(1));
    const listener = vi.fn();
    const first = adapter.subscribe({ context: CONTEXT, onInvalidate: listener });
    const second = adapter.subscribe({ context: CONTEXT, onInvalidate: listener });

    first();
    adapter.invalidate(CONTEXT);
    expect(listener).toHaveBeenCalledTimes(1);

    second();
    adapter.invalidate(CONTEXT);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('rejects a duplicate id and a payload that is not a notification', () => {
    const adapter = fixtureAdapter(series(1));

    expect(() => adapter.addNotification(CONTEXT, note('n-01'))).toThrow(RangeError);
    expect(() => adapter.addNotification(CONTEXT, { ...note('bad'), title: '' })).toThrow(
      RangeError,
    );
  });

  it('rejects duplicate seeds for one context', () => {
    expect(() =>
      createMockAdapter({
        clock: clockAt(),
        contexts: [
          { context: CONTEXT, notifications: series(1) },
          { context: CONTEXT, notifications: series(1) },
        ],
      }),
    ).toThrow(RangeError);
  });
});

describe('latency and cancellation', () => {
  it('waits for the configured delay before answering', async () => {
    vi.useFakeTimers();
    try {
      const adapter = fixtureAdapter(series(1), { latencyMs: 50 });
      const pending = adapter.getNotifications({
        context: CONTEXT,
        filter: 'all',
        cursor: null,
        signal: freshSignal(),
      });
      let settled = false;
      void pending.then(() => {
        settled = true;
      });

      await vi.advanceTimersByTimeAsync(49);
      expect(settled).toBe(false);

      await vi.advanceTimersByTimeAsync(1);
      await expect(pending).resolves.toMatchObject({ nextCursor: null });
      expect(settled).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('accepts a delay function per operation', async () => {
    vi.useFakeTimers();
    try {
      const adapter = fixtureAdapter(series(1), {
        latencyMs: (operation) => (operation === 'getUnreadCount' ? 20 : 0),
      });
      const pending = adapter.getUnreadCount({ context: CONTEXT, signal: freshSignal() });
      let settled = false;
      void pending.then(() => {
        settled = true;
      });

      await vi.advanceTimersByTimeAsync(19);
      expect(settled).toBe(false);

      await vi.advanceTimersByTimeAsync(1);
      await expect(pending).resolves.toEqual({ unreadCount: 1 });
    } finally {
      vi.useRealTimers();
    }
  });

  it('changes the delay with setLatency and rejects a negative one', async () => {
    const adapter = fixtureAdapter(series(1));

    expect(() => adapter.setLatency(-1)).toThrow(RangeError);
    adapter.setLatency(0);
    expect(await pageOf(adapter)).toMatchObject({ ids: ['n-01'] });
  });

  it('rejects a cancelled load without consuming a queued failure', async () => {
    const adapter = fixtureAdapter(series(1), { latencyMs: 1_000 });
    adapter.failNext('getNotifications', { code: 'UNAUTHORIZED' });
    const controller = new AbortController();

    const pending = adapter.getNotifications({
      context: CONTEXT,
      filter: 'all',
      cursor: null,
      signal: controller.signal,
    });
    controller.abort();

    const error = await pending.catch((value: unknown) => value);
    expect(isAbortError(error)).toBe(true);
    expect(isInboxError(error)).toBe(false);

    adapter.setLatency(0);
    await expect(
      adapter.getNotifications({
        context: CONTEXT,
        filter: 'all',
        cursor: null,
        signal: freshSignal(),
      }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('rejects immediately when the signal is already aborted', async () => {
    const adapter = fixtureAdapter(series(1));
    adapter.failNext('getUnreadCount');
    const controller = new AbortController();
    controller.abort();

    const error = await adapter
      .getUnreadCount({ context: CONTEXT, signal: controller.signal })
      .catch((value: unknown) => value);

    expect(isAbortError(error)).toBe(true);

    // The aborted call never reached the simulated server, so the queued failure is
    // still waiting for the next real request.
    await expect(unreadOf(adapter)).rejects.toMatchObject({ code: 'ADAPTER_FAILURE' });
    expect(await unreadOf(adapter)).toBe(1);
  });
});

describe('injected failures', () => {
  it('refuses one load with the requested code and then recovers', async () => {
    const adapter = fixtureAdapter(series(2));
    adapter.failNext('getNotifications', { code: 'UNAUTHORIZED', message: 'Session expired' });

    await expect(
      adapter.getNotifications({
        context: CONTEXT,
        filter: 'all',
        cursor: null,
        signal: freshSignal(),
      }),
    ).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
      phase: 'load',
      outcome: 'rejected',
      message: 'Session expired',
    });

    expect((await pageOf(adapter)).ids).toEqual(['n-01', 'n-02']);
  });

  it('refuses a mutation without applying it', async () => {
    const adapter = fixtureAdapter(series(2));
    adapter.failNext('setReadStatus', { code: 'CONFLICT' });

    await expect(
      adapter.setReadStatus({ context: CONTEXT, id: 'n-01', read: true }),
    ).rejects.toMatchObject({ code: 'CONFLICT', phase: 'mutation', outcome: 'rejected' });

    expect(await unreadOf(adapter)).toBe(2);
    expect((await pageOf(adapter, 'unread')).ids).toEqual(['n-01', 'n-02']);
  });

  it('applies a change and then loses the answer', async () => {
    const adapter = fixtureAdapter(series(2));
    adapter.failNext('setReadStatus', { apply: true, outcome: 'unknown' });

    const error = await adapter
      .setReadStatus({ context: CONTEXT, id: 'n-01', read: true })
      .catch((value: unknown) => value);

    expect(isUnknownOutcomeError(error)).toBe(true);
    expect(error).toMatchObject({ code: 'UNKNOWN', phase: 'mutation', outcome: 'unknown' });
    expect(await unreadOf(adapter)).toBe(1);

    const page = await adapter.getNotifications({
      context: CONTEXT,
      filter: 'all',
      cursor: null,
      signal: freshSignal(),
    });
    expect(page.items.find((item) => item.id === 'n-01')?.read).toBe(true);
  });

  it('can lose the answer of a markAllRead only after applying it', async () => {
    const adapter = fixtureAdapter(series(3));
    adapter.failNext('markAllRead', { apply: true, outcome: 'unknown' });

    const error = await adapter.markAllRead({ context: CONTEXT }).catch((value: unknown) => value);

    expect(isUnknownOutcomeError(error)).toBe(true);
    expect(await unreadOf(adapter)).toBe(0);
  });

  it('can report an unknown outcome without changing the data', async () => {
    const adapter = fixtureAdapter(series(2));
    adapter.failNext('setReadStatus', { outcome: 'unknown' });

    const error = await adapter
      .setReadStatus({ context: CONTEXT, id: 'n-01', read: true })
      .catch((value: unknown) => value);

    expect(isUnknownOutcomeError(error)).toBe(true);
    expect(await unreadOf(adapter)).toBe(2);
  });

  it('drops queued failures with clearFailures', async () => {
    const adapter = fixtureAdapter(series(1));
    adapter.failNext('getUnreadCount');
    adapter.failNext('getNotifications');

    adapter.clearFailures('getUnreadCount');
    expect(await unreadOf(adapter)).toBe(1);

    adapter.clearFailures();
    expect((await pageOf(adapter)).ids).toEqual(['n-01']);
  });

  it('rejects failure combinations that contradict the operation', () => {
    const adapter = fixtureAdapter(series(1));

    expect(() => adapter.failNext('getNotifications', { apply: true, outcome: 'unknown' })).toThrow(
      RangeError,
    );
    expect(() => adapter.failNext('getUnreadCount', { outcome: 'unknown' })).toThrow(RangeError);
    expect(() => adapter.failNext('setReadStatus', { apply: true, outcome: 'rejected' })).toThrow(
      RangeError,
    );
  });

  it('rejects an unknown operation at runtime', () => {
    const adapter = fixtureAdapter(series(1));

    expect(() => adapter.failNext('nope' as never)).toThrow(RangeError);
    expect(() => adapter.clearFailures('nope' as never)).toThrow(RangeError);
  });
});

describe('determinism', () => {
  it('produces the same pages and boundary from the same fixtures', async () => {
    const fixtures = series(4);
    const first = fixtureAdapter(fixtures, { pageSize: 2 });
    const second = fixtureAdapter(fixtures, { pageSize: 2 });

    expect(await pageOf(first)).toEqual(await pageOf(second));
    expect(await first.markAllRead({ context: CONTEXT })).toEqual(
      await second.markAllRead({ context: CONTEXT }),
    );
    expect(await pageOf(first, 'unread')).toEqual(await pageOf(second, 'unread'));
  });

  it('validates its configuration at creation', () => {
    expect(() => createMockAdapter({ clock: clockAt(), pageSize: 0 })).toThrow(RangeError);
    expect(() => createMockAdapter({ clock: clockAt(), pageSize: 1.5 })).toThrow(RangeError);
    expect(() => createMockAdapter({ clock: clockAt(), latencyMs: -10 })).toThrow(RangeError);
    expect(() => createMockAdapter({ clock: undefined as never })).toThrow(TypeError);
  });
});

describe('typing', () => {
  it('keeps TData flowing through the adapter', () => {
    const adapter = createMockAdapter<{ orderId: number }>({
      clock: clockAt(),
      contexts: [
        {
          context: CONTEXT,
          notifications: [
            {
              id: 'typed',
              createdAt: new Date(BASE_MS).toISOString(),
              title: 'Typed',
              read: false,
              data: { orderId: 4210 },
            },
          ],
        },
      ],
    });

    expectTypeOf(adapter).toEqualTypeOf<InboxMockAdapter<{ orderId: number }>>();
  });
});

describe('the implicit context', () => {
  it('accepts DEFAULT_INBOX_CONTEXT as an ordinary context', async () => {
    const adapter = createMockAdapter({
      clock: clockAt(),
      contexts: [{ context: DEFAULT_INBOX_CONTEXT, notifications: [note('welcome')] }],
    });

    expect(
      await adapter.getUnreadCount({ context: DEFAULT_INBOX_CONTEXT, signal: freshSignal() }),
    ).toEqual({ unreadCount: 1 });
    expect(
      await adapter.getNotifications({
        context: DEFAULT_INBOX_CONTEXT,
        filter: 'all',
        cursor: null,
        signal: freshSignal(),
      }),
    ).toMatchObject({ nextCursor: null });
  });
});
