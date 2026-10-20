/**
 * The controller lifecycle.
 *
 * The scenarios drive the same public API a binding will use: creation without
 * requests, `start`/`stop`, `refresh`, context and adapter replacement, the
 * injected clock and the independent list/counter loads. Requests are deferred
 * by a scripted adapter, so a test resolves them in the order that makes a race
 * observable instead of waiting for a timer.
 */
import { describe, expect, it, vi } from 'vitest';
import type {
  InboxAdapter,
  InboxCountQuery,
  InboxListQuery,
  InboxMarkAllQuery,
  InboxMarkAllReadResult,
  InboxReadStatusQuery,
  InboxReadStatusResult,
  InboxSubscriptionQuery,
} from './adapter';
import { DEFAULT_INBOX_CONTEXT } from './context';
import { createInboxController } from './controller';
import { InboxError } from './errors';
import { createMockAdapter } from './mock';
import type {
  InboxClock,
  InboxContext,
  InboxFilter,
  InboxNotification,
  InboxPage,
  InboxUnreadCount,
} from './types';

const NOW = Date.parse('2026-10-18T13:00:00Z');

function note(
  id: string,
  overrides: Partial<Omit<InboxNotification, 'id'>> = {},
): InboxNotification {
  return {
    id,
    createdAt: '2026-10-18T12:55:00Z',
    title: `Notification ${id}`,
    read: false,
    ...overrides,
  };
}

function page(items: InboxNotification[], nextCursor: string | null = null): InboxPage {
  return { items, nextCursor };
}

function clockAt(nowMs: number): InboxClock & { set(now: number): void } {
  let current = nowMs;
  return {
    now: () => current,
    set(now) {
      current = now;
    },
  };
}

function deferred<T>(): {
  promise: Promise<T>;
  resolve(value: T): void;
  reject(reason?: unknown): void;
} {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, resolve, reject };
}

const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

interface AdapterCalls {
  lists: InboxListQuery[];
  counts: InboxCountQuery[];
  reads: InboxReadStatusQuery[];
  marksAll: InboxMarkAllQuery[];
  subscriptions: InboxSubscriptionQuery[];
}

/**
 * One subscription the scripted adapter handed out.
 *
 * `active` becomes false when the controller calls the unsubscribe function, so
 * a test can tell a released subscription from a live one and can replay a late
 * event that a real transport might still deliver.
 */
interface ScriptedSubscription {
  readonly query: InboxSubscriptionQuery;
  active: boolean;
}

/**
 * An adapter whose requests never settle until the test says so.
 *
 * The request signal is honoured only by the controller's identity check: the
 * scripted promises stay pending after an abort on purpose, which is the harder
 * case — a real adapter may resolve late even when it was cancelled. Mutations
 * are deferred too, which is what makes the serial queue observable.
 *
 * `subscribe` is opt-in: the default adapter has no invalidation transport, and
 * one that does records every query and offers `emitInvalidation()`.
 */
function createScriptedAdapter(options: { subscribe?: boolean } = {}): {
  adapter: InboxAdapter;
  calls: AdapterCalls;
  lists: Array<ReturnType<typeof deferred<InboxPage>>>;
  counts: Array<ReturnType<typeof deferred<InboxUnreadCount>>>;
  reads: Array<ReturnType<typeof deferred<InboxReadStatusResult>>>;
  marks: Array<ReturnType<typeof deferred<InboxMarkAllReadResult>>>;
  subscriptions: ScriptedSubscription[];
  emitInvalidation(): void;
  activeSubscriptions(): number;
} {
  const calls: AdapterCalls = {
    lists: [],
    counts: [],
    reads: [],
    marksAll: [],
    subscriptions: [],
  };
  const lists: Array<ReturnType<typeof deferred<InboxPage>>> = [];
  const counts: Array<ReturnType<typeof deferred<InboxUnreadCount>>> = [];
  const reads: Array<ReturnType<typeof deferred<InboxReadStatusResult>>> = [];
  const marks: Array<ReturnType<typeof deferred<InboxMarkAllReadResult>>> = [];
  const subscriptions: ScriptedSubscription[] = [];

  const adapter: InboxAdapter = {
    getNotifications(query) {
      calls.lists.push(query);
      const pending = deferred<InboxPage>();
      lists.push(pending);
      return pending.promise;
    },
    getUnreadCount(query) {
      calls.counts.push(query);
      const pending = deferred<InboxUnreadCount>();
      counts.push(pending);
      return pending.promise;
    },
    setReadStatus(query) {
      calls.reads.push(query);
      const pending = deferred<InboxReadStatusResult>();
      reads.push(pending);
      return pending.promise;
    },
    markAllRead(query) {
      calls.marksAll.push(query);
      const pending = deferred<InboxMarkAllReadResult>();
      marks.push(pending);
      return pending.promise;
    },
  };

  if (options.subscribe) {
    adapter.subscribe = (query) => {
      const entry: ScriptedSubscription = { query, active: true };
      calls.subscriptions.push(query);
      subscriptions.push(entry);
      return () => {
        entry.active = false;
      };
    };
  }

  return {
    adapter,
    calls,
    lists,
    counts,
    reads,
    marks,
    subscriptions,
    emitInvalidation() {
      for (const entry of [...subscriptions]) {
        if (entry.active) entry.query.onInvalidate();
      }
    },
    activeSubscriptions() {
      return subscriptions.filter((entry) => entry.active).length;
    },
  };
}

describe('creation and snapshot', () => {
  it('performs no request and exposes an honest idle snapshot', () => {
    const script = createScriptedAdapter();
    const controller = createInboxController({
      adapter: script.adapter,
      clock: clockAt(NOW),
    });

    expect(script.calls.lists).toHaveLength(0);
    expect(script.calls.counts).toHaveLength(0);

    const snapshot = controller.getSnapshot();
    expect(snapshot.revision).toBe(1);
    expect(snapshot.state.listStatus).toBe('idle');
    expect(snapshot.state.countStatus).toBe('idle');
    expect(snapshot.state.unreadCount).toBeNull();
    expect(snapshot.state.order).toEqual([]);
    expect(snapshot.view.counter.known).toBe(false);
    expect(snapshot.view.counter.label).toBeNull();
    expect(snapshot.view.list.loading).toBe(false);
    expect(snapshot.view.list.empty).toBe(false);
    expect(controller.getSnapshot()).toBe(snapshot);
  });

  it('keeps the snapshot stable until a real change and releases listeners', () => {
    const script = createScriptedAdapter();
    const controller = createInboxController({ adapter: script.adapter, clock: clockAt(NOW) });
    const listener = vi.fn();
    const unsubscribe = controller.subscribe(listener);

    const before = controller.getSnapshot();
    controller.start();
    expect(listener).toHaveBeenCalled();

    const during = controller.getSnapshot();
    expect(during).not.toBe(before);
    expect(during.revision).toBe(before.revision + 1);
    expect(during.state.listStatus).toBe('loading');
    expect(during.state.countStatus).toBe('loading');

    unsubscribe();
    unsubscribe();
    script.lists[0].resolve(page([note('a')]));
    script.counts[0].resolve({ unreadCount: 1 });
    return flush().then(() => {
      expect(listener).toHaveBeenCalledTimes(2);
      expect(controller.getSnapshot().state.order).toEqual(['a']);
    });
  });

  it('keeps two controllers apart', async () => {
    const first = createScriptedAdapter();
    const second = createScriptedAdapter();
    const firstController = createInboxController({
      adapter: first.adapter,
      context: { key: 'user-a' },
      clock: clockAt(NOW),
    });
    const secondController = createInboxController({
      adapter: second.adapter,
      context: { key: 'user-b' },
      clock: clockAt(NOW),
    });

    firstController.start();
    secondController.start();

    expect(first.calls.lists[0]?.context.key).toBe('user-a');
    expect(second.calls.lists[0]?.context.key).toBe('user-b');

    first.lists[0].resolve(page([note('a')]));
    first.counts[0].resolve({ unreadCount: 3 });
    second.lists[0].resolve(page([note('b')]));
    second.counts[0].resolve({ unreadCount: 7 });
    await flush();

    expect(firstController.getSnapshot().state.order).toEqual(['a']);
    expect(firstController.getSnapshot().state.unreadCount).toBe(3);
    expect(secondController.getSnapshot().state.order).toEqual(['b']);
    expect(secondController.getSnapshot().state.unreadCount).toBe(7);
  });

  it('does nothing when the actions that need a live controller run before start', async () => {
    const script = createScriptedAdapter();
    const controller = createInboxController({ adapter: script.adapter, clock: clockAt(NOW) });

    await controller.actions.refresh();
    await controller.actions.loadMore();
    controller.actions.setContext({ key: 'user-2' });

    expect(script.calls.lists).toHaveLength(0);
    expect(script.calls.counts).toHaveLength(0);
    expect(controller.getSnapshot().state.contextKey).toBe('user-2');
  });
});

describe('server-rendered initial data', () => {
  const LABEL_NOW = Date.parse('2026-10-18T13:00:00Z');

  it('exposes a seeded page, counter and time anchor before any request', () => {
    const script = createScriptedAdapter();
    const controller = createInboxController({
      adapter: script.adapter,
      // The injected clock is one hour ahead on purpose: the first snapshot
      // must use the seed's anchor, not the machine that is rendering.
      clock: clockAt(LABEL_NOW + 3_600_000),
      config: { locale: 'en', timeZone: 'UTC' },
      initialData: {
        page: page(
          [
            note('a', { createdAt: '2026-10-18T12:56:00Z' }),
            note('b', { createdAt: '2026-10-18T12:40:00Z' }),
          ],
          'cursor-2',
        ),
        unreadCount: 27,
        now: LABEL_NOW,
      },
    });

    expect(script.calls.lists).toHaveLength(0);
    expect(script.calls.counts).toHaveLength(0);

    const snapshot = controller.getSnapshot();
    expect(snapshot.state.listStatus).toBe('ready');
    expect(snapshot.state.countStatus).toBe('ready');
    expect(snapshot.state.order).toEqual(['a', 'b']);
    expect(snapshot.state.unreadCount).toBe(27);
    expect(snapshot.state.nextCursor).toBe('cursor-2');
    expect(snapshot.state.pending.reads).toEqual({});
    expect(snapshot.state.pending.bulk).toBeNull();
    expect(snapshot.view.list.items.map((item) => item.id)).toEqual(['a', 'b']);
    expect(snapshot.view.list.items[0]?.timeLabel).toBe('4 minutes ago');
    expect(snapshot.view.counter.label).toBe('27 unread notifications');
    expect(controller.getSnapshot()).toBe(snapshot);
  });

  it('keeps an unknown counter and an empty page honest', () => {
    const script = createScriptedAdapter();
    const controller = createInboxController({
      adapter: script.adapter,
      clock: clockAt(LABEL_NOW),
      initialData: { page: page([]), unreadCount: null, now: LABEL_NOW },
    });

    const snapshot = controller.getSnapshot();
    expect(snapshot.state.listStatus).toBe('ready');
    expect(snapshot.state.countStatus).toBe('idle');
    expect(snapshot.state.unreadCount).toBeNull();
    expect(snapshot.view.list.empty).toBe(true);
    expect(snapshot.view.counter.known).toBe(false);
  });

  it('still confirms a seeded first paint with the adapter on start', async () => {
    const script = createScriptedAdapter();
    const controller = createInboxController({
      adapter: script.adapter,
      clock: clockAt(LABEL_NOW),
      config: { locale: 'en', timeZone: 'UTC' },
      initialData: { page: page([note('seed')]), unreadCount: 2, now: LABEL_NOW },
    });

    controller.start();
    expect(script.calls.lists).toHaveLength(1);
    expect(script.calls.counts).toHaveLength(1);
    // A live refresh keeps the seeded rows until the server answers.
    expect(controller.getSnapshot().state.order).toEqual(['seed']);
    expect(controller.getSnapshot().state.listStatus).toBe('loading');

    script.lists[0].resolve(page([note('live')]));
    script.counts[0].resolve({ unreadCount: 1 });
    await flush();

    const snapshot = controller.getSnapshot();
    expect(snapshot.state.order).toEqual(['live']);
    expect(snapshot.state.unreadCount).toBe(1);
    expect(snapshot.state.listStatus).toBe('ready');
  });

  it('spends the seed anchor when the binding asks for live time', () => {
    const script = createScriptedAdapter();
    const controller = createInboxController({
      adapter: script.adapter,
      clock: clockAt(LABEL_NOW + 3_600_000),
      config: { locale: 'en', timeZone: 'UTC' },
      initialData: { page: page([note('a')]), unreadCount: 1, now: LABEL_NOW },
    });

    expect(controller.getSnapshot().view.list.items[0]?.timeLabel).toBe('5 minutes ago');

    controller.refreshTime();

    expect(controller.getSnapshot().view.list.items[0]?.timeLabel).toBe('1 hour ago');
  });

  it('rejects a malformed seed instead of rendering an unpageable list', () => {
    const script = createScriptedAdapter();

    expect(() =>
      createInboxController({
        adapter: script.adapter,
        clock: clockAt(LABEL_NOW),
        initialData: {
          page: { items: [{ id: 'broken' }], nextCursor: null } as unknown as InboxPage,
          unreadCount: 1,
          now: LABEL_NOW,
        },
      }),
    ).toThrow(RangeError);

    expect(() =>
      createInboxController({
        adapter: script.adapter,
        clock: clockAt(LABEL_NOW),
        initialData: { page: page([]), unreadCount: -1, now: LABEL_NOW },
      }),
    ).toThrow(RangeError);

    expect(() =>
      createInboxController({
        adapter: script.adapter,
        clock: clockAt(LABEL_NOW),
        initialData: { page: page([]), unreadCount: 0, now: Number.NaN },
      }),
    ).toThrow(RangeError);
  });
});

describe('start and stop', () => {
  it('loads the first page and the counter in parallel', async () => {
    const script = createScriptedAdapter();
    const controller = createInboxController({ adapter: script.adapter, clock: clockAt(NOW) });

    controller.start();

    expect(script.calls.lists).toHaveLength(1);
    expect(script.calls.counts).toHaveLength(1);
    expect(script.calls.lists[0]?.cursor).toBeNull();
    expect(script.calls.lists[0]?.filter).toBe('all');
    expect(script.calls.lists[0]?.context).toEqual(DEFAULT_INBOX_CONTEXT);
    expect(script.calls.lists[0]?.signal.aborted).toBe(false);
    expect(controller.getSnapshot().state.listStatus).toBe('loading');
    expect(controller.getSnapshot().state.countStatus).toBe('loading');

    script.lists[0].resolve(page([note('a'), note('b', { read: true })], 'next'));
    script.counts[0].resolve({ unreadCount: 1 });
    await flush();

    const snapshot = controller.getSnapshot();
    expect(snapshot.state.order).toEqual(['a', 'b']);
    expect(snapshot.state.nextCursor).toBe('next');
    expect(snapshot.state.listStatus).toBe('ready');
    expect(snapshot.state.countStatus).toBe('ready');
    expect(snapshot.state.unreadCount).toBe(1);
    expect(snapshot.view.list.items.map((item) => item.id)).toEqual(['a', 'b']);
    expect(snapshot.view.counter.label).toBe('1 unread notification');
    expect(snapshot.view.page.hasMore).toBe(true);
  });

  it('is idempotent while started and reloads after a stop', async () => {
    const script = createScriptedAdapter();
    const controller = createInboxController({ adapter: script.adapter, clock: clockAt(NOW) });

    controller.start();
    controller.start();
    expect(script.calls.lists).toHaveLength(1);
    expect(script.calls.counts).toHaveLength(1);

    script.lists[0].resolve(page([note('a')]));
    script.counts[0].resolve({ unreadCount: 1 });
    await flush();
    expect(controller.getSnapshot().state.order).toEqual(['a']);

    controller.stop();
    controller.stop();

    controller.start();
    expect(script.calls.lists).toHaveLength(2);
    expect(script.calls.counts).toHaveLength(2);

    script.lists[1].resolve(page([note('b')]));
    script.counts[1].resolve({ unreadCount: 2 });
    await flush();

    const snapshot = controller.getSnapshot();
    expect(snapshot.state.order).toEqual(['b']);
    expect(snapshot.state.unreadCount).toBe(2);
    expect(snapshot.state.listStatus).toBe('ready');
  });

  it('drops a late answer after stop and never reports a cancellation', async () => {
    const onError = vi.fn();
    const script = createScriptedAdapter();
    const controller = createInboxController({
      adapter: script.adapter,
      clock: clockAt(NOW),
      callbacks: { onError },
    });

    controller.start();
    controller.stop();

    expect(script.calls.lists[0]?.signal.aborted).toBe(true);
    script.lists[0].resolve(page([note('late')]));
    script.counts[0].resolve({ unreadCount: 9 });
    await flush();

    const snapshot = controller.getSnapshot();
    expect(snapshot.state.order).toEqual([]);
    expect(snapshot.state.unreadCount).toBeNull();
    expect(onError).not.toHaveBeenCalled();
  });

  it('ignores the answer of a request superseded by a newer refresh', async () => {
    const script = createScriptedAdapter();
    const controller = createInboxController({ adapter: script.adapter, clock: clockAt(NOW) });

    controller.start();
    const first = controller.actions.refresh();
    const second = controller.actions.refresh();

    expect(script.calls.lists).toHaveLength(3);
    expect(script.calls.lists[1]?.signal.aborted).toBe(true);
    expect(script.calls.lists[2]?.signal.aborted).toBe(false);

    script.lists[1].resolve(page([note('stale')]));
    script.counts[1].resolve({ unreadCount: 99 });
    script.lists[2].resolve(page([note('fresh')]));
    script.counts[2].resolve({ unreadCount: 1 });
    script.lists[0].resolve(page([note('first')]));
    script.counts[0].resolve({ unreadCount: 50 });
    await Promise.all([first, second]);

    const snapshot = controller.getSnapshot();
    expect(snapshot.state.order).toEqual(['fresh']);
    expect(snapshot.state.unreadCount).toBe(1);
  });
});

describe('refresh and independent failures', () => {
  it('keeps the old rows while refreshing and replaces the chain on success', async () => {
    const script = createScriptedAdapter();
    const controller = createInboxController({ adapter: script.adapter, clock: clockAt(NOW) });

    controller.start();
    script.lists[0].resolve(page([note('a'), note('b')], 'cursor-1'));
    script.counts[0].resolve({ unreadCount: 2 });
    await flush();

    const refreshing = controller.actions.refresh();
    expect(controller.getSnapshot().state.order).toEqual(['a', 'b']);
    expect(controller.getSnapshot().state.listStatus).toBe('loading');

    script.lists[1].resolve(page([note('c')]));
    script.counts[1].resolve({ unreadCount: 1 });
    await refreshing;

    const snapshot = controller.getSnapshot();
    expect(snapshot.state.order).toEqual(['c']);
    expect(snapshot.state.byId.a).toBeUndefined();
    expect(snapshot.state.byId.b).toBeUndefined();
    expect(snapshot.state.nextCursor).toBeNull();
    expect(snapshot.state.listStatus).toBe('ready');
    expect(snapshot.state.unreadCount).toBe(1);
  });

  it('keeps the shown rows when a refresh fails and retries it', async () => {
    const onError = vi.fn();
    const script = createScriptedAdapter();
    const controller = createInboxController({
      adapter: script.adapter,
      clock: clockAt(NOW),
      callbacks: { onError },
    });

    controller.start();
    script.lists[0].resolve(page([note('a')], 'cursor-1'));
    script.counts[0].resolve({ unreadCount: 1 });
    await flush();

    const refreshing = controller.actions.refresh();
    script.lists[1].reject(
      new InboxError({ code: 'ADAPTER_FAILURE', message: 'The list is down' }),
    );
    script.counts[1].resolve({ unreadCount: 2 });
    await refreshing;

    let snapshot = controller.getSnapshot();
    expect(snapshot.state.order).toEqual(['a']);
    expect(snapshot.state.nextCursor).toBe('cursor-1');
    expect(snapshot.state.listStatus).toBe('error');
    expect(snapshot.state.listError?.code).toBe('ADAPTER_FAILURE');
    expect(snapshot.state.countStatus).toBe('ready');
    expect(snapshot.state.unreadCount).toBe(2);
    expect(onError).toHaveBeenCalledTimes(1);

    const retry = controller.actions.refresh();
    expect(script.calls.lists).toHaveLength(3);
    script.lists[2].resolve(page([note('a'), note('b')]));
    script.counts[2].resolve({ unreadCount: 2 });
    await retry;

    snapshot = controller.getSnapshot();
    expect(snapshot.state.order).toEqual(['a', 'b']);
    expect(snapshot.state.listStatus).toBe('ready');
    expect(snapshot.state.listError).toBeNull();
  });

  it('repeats only the failed load and leaves the successful one alone', async () => {
    const script = createScriptedAdapter();
    const controller = createInboxController({ adapter: script.adapter, clock: clockAt(NOW) });

    controller.start();
    script.lists[0].reject(new InboxError({ code: 'ADAPTER_FAILURE', message: 'No list' }));
    script.counts[0].resolve({ unreadCount: 4 });
    await flush();

    const retry = controller.actions.retry();
    expect(script.calls.lists).toHaveLength(2);
    expect(script.calls.counts).toHaveLength(1);

    script.lists[1].resolve(page([note('a')]));
    await retry;

    const snapshot = controller.getSnapshot();
    expect(snapshot.state.listStatus).toBe('ready');
    expect(snapshot.state.order).toEqual(['a']);
    expect(snapshot.state.unreadCount).toBe(4);

    // Nothing failed, so there is nothing to repeat.
    await controller.actions.retry();
    expect(script.calls.lists).toHaveLength(2);
    expect(script.calls.counts).toHaveLength(1);
  });

  it('repeats both failed loads but never a successful one', async () => {
    const script = createScriptedAdapter();
    const controller = createInboxController({ adapter: script.adapter, clock: clockAt(NOW) });

    controller.start();
    script.lists[0].reject(new InboxError({ code: 'ADAPTER_FAILURE', message: 'No list' }));
    script.counts[0].reject(new InboxError({ code: 'ADAPTER_FAILURE', message: 'No counter' }));
    await flush();

    const retry = controller.actions.retry();
    expect(script.calls.lists).toHaveLength(2);
    expect(script.calls.counts).toHaveLength(2);

    script.lists[1].resolve(page([note('a')]));
    script.counts[1].resolve({ unreadCount: 1 });
    await retry;

    const snapshot = controller.getSnapshot();
    expect(snapshot.state.listStatus).toBe('ready');
    expect(snapshot.state.countStatus).toBe('ready');
    expect(snapshot.state.unreadCount).toBe(1);
  });

  it('lets the list succeed while the counter fails, and the other way round', async () => {
    const script = createScriptedAdapter();
    const controller = createInboxController({ adapter: script.adapter, clock: clockAt(NOW) });

    controller.start();
    script.lists[0].resolve(page([note('a')]));
    script.counts[0].reject(new InboxError({ code: 'ADAPTER_FAILURE', message: 'No counter' }));
    await flush();

    let snapshot = controller.getSnapshot();
    expect(snapshot.state.listStatus).toBe('ready');
    expect(snapshot.state.order).toEqual(['a']);
    expect(snapshot.state.countStatus).toBe('error');
    expect(snapshot.state.unreadCount).toBeNull();
    expect(snapshot.view.counter.known).toBe(false);

    const refreshing = controller.actions.refresh();
    script.lists[1].reject(new InboxError({ code: 'ADAPTER_FAILURE', message: 'No list' }));
    script.counts[1].resolve({ unreadCount: 4 });
    await refreshing;

    snapshot = controller.getSnapshot();
    expect(snapshot.state.listStatus).toBe('error');
    expect(snapshot.state.order).toEqual(['a']);
    expect(snapshot.state.countStatus).toBe('ready');
    expect(snapshot.state.unreadCount).toBe(4);
  });

  it('keeps the last known counter when a later counter load fails', async () => {
    const script = createScriptedAdapter();
    const controller = createInboxController({ adapter: script.adapter, clock: clockAt(NOW) });

    controller.start();
    script.lists[0].resolve(page([note('a')]));
    script.counts[0].resolve({ unreadCount: 5 });
    await flush();

    const refreshing = controller.actions.refresh();
    script.lists[1].resolve(page([note('a')]));
    script.counts[1].reject(new InboxError({ code: 'UNAUTHORIZED', message: 'Expired' }));
    await refreshing;

    const snapshot = controller.getSnapshot();
    expect(snapshot.state.unreadCount).toBe(5);
    expect(snapshot.state.countStatus).toBe('error');
    expect(snapshot.state.countError?.code).toBe('UNAUTHORIZED');
  });

  it('turns an unusable payload into a contract violation without rejecting the action', async () => {
    const onError = vi.fn();
    const script = createScriptedAdapter();
    const controller = createInboxController({
      adapter: script.adapter,
      clock: clockAt(NOW),
      callbacks: { onError },
    });

    controller.start();
    script.lists[0].resolve({ items: [{} as InboxNotification], nextCursor: null });
    script.counts[0].resolve({ unreadCount: 1.5 });
    await flush();

    let snapshot = controller.getSnapshot();
    expect(snapshot.state.listStatus).toBe('error');
    expect(snapshot.state.listError?.code).toBe('ADAPTER_CONTRACT_VIOLATION');
    expect(snapshot.state.countStatus).toBe('error');
    expect(snapshot.state.countError?.code).toBe('ADAPTER_CONTRACT_VIOLATION');
    expect(onError).toHaveBeenCalledTimes(2);

    const retry = controller.actions.refresh();
    script.lists[1].resolve(page([]));
    script.counts[1].resolve({ unreadCount: 0 });
    await expect(retry).resolves.toBeUndefined();

    snapshot = controller.getSnapshot();
    expect(snapshot.state.listStatus).toBe('ready');
    expect(snapshot.state.countStatus).toBe('ready');
  });

  it('contains an exception thrown by the error callback', async () => {
    const onError = vi.fn(() => {
      throw new Error('The reporter is broken');
    });
    const script = createScriptedAdapter();
    const controller = createInboxController({
      adapter: script.adapter,
      clock: clockAt(NOW),
      callbacks: { onError },
    });

    controller.start();
    script.lists[0].reject(new Error('Network down'));
    script.counts[0].resolve({ unreadCount: 1 });
    await flush();

    expect(onError).toHaveBeenCalledTimes(1);
    let snapshot = controller.getSnapshot();
    expect(snapshot.state.listStatus).toBe('error');
    expect(snapshot.state.listError?.code).toBe('ADAPTER_FAILURE');
    expect(script.calls.lists).toHaveLength(1);

    const retry = controller.actions.refresh();
    expect(script.calls.lists).toHaveLength(2);
    script.lists[1].resolve(page([]));
    script.counts[1].resolve({ unreadCount: 1 });
    await expect(retry).resolves.toBeUndefined();

    snapshot = controller.getSnapshot();
    expect(snapshot.state.listStatus).toBe('ready');
  });
});

describe('context and adapter changes', () => {
  it('abandons the previous context and drops its late answer', async () => {
    const script = createScriptedAdapter();
    const controller = createInboxController({
      adapter: script.adapter,
      context: { key: 'user-1' },
      clock: clockAt(NOW),
    });

    controller.start();
    const oldSignal = script.calls.lists[0].signal;
    controller.actions.setContext({ key: 'user-2' });

    expect(oldSignal.aborted).toBe(true);
    expect(script.calls.lists).toHaveLength(2);
    expect(script.calls.lists[1]?.context.key).toBe('user-2');
    expect(controller.getSnapshot().state.contextKey).toBe('user-2');
    expect(controller.getSnapshot().state.order).toEqual([]);

    script.lists[0].resolve(page([note('old')]));
    script.counts[0].resolve({ unreadCount: 9 });
    script.lists[1].resolve(page([note('new')]));
    script.counts[1].resolve({ unreadCount: 1 });
    await flush();

    const snapshot = controller.getSnapshot();
    expect(snapshot.state.order).toEqual(['new']);
    expect(snapshot.state.unreadCount).toBe(1);
    expect(snapshot.state.contextKey).toBe('user-2');
  });

  it('keeps the data when only the context data changes', async () => {
    const script = createScriptedAdapter();
    const controller = createInboxController({
      adapter: script.adapter,
      context: { key: 'user-1', data: { token: 'old' } },
      clock: clockAt(NOW),
    });

    controller.start();
    script.lists[0].resolve(page([note('a')]));
    script.counts[0].resolve({ unreadCount: 1 });
    await flush();

    const before = controller.getSnapshot();
    controller.actions.setContext({ key: 'user-1', data: { token: 'new' } });

    expect(script.calls.lists).toHaveLength(1);
    expect(controller.getSnapshot()).toBe(before);

    const refreshing = controller.actions.refresh();
    expect(script.calls.lists[1]?.context.data).toEqual({ token: 'new' });
    script.lists[1].resolve(page([note('a')]));
    script.counts[1].resolve({ unreadCount: 1 });
    await refreshing;
  });

  it('reloads from the replacement adapter and drops the previous answer', async () => {
    const first = createScriptedAdapter();
    const second = createScriptedAdapter();
    const controller = createInboxController({ adapter: first.adapter, clock: clockAt(NOW) });

    controller.start();
    const oldSignal = first.calls.lists[0].signal;
    controller.actions.setAdapter(second.adapter);

    expect(oldSignal.aborted).toBe(true);
    expect(first.calls.lists).toHaveLength(1);
    expect(second.calls.lists).toHaveLength(1);
    expect(second.calls.counts).toHaveLength(1);

    first.lists[0].resolve(page([note('old')]));
    first.counts[0].resolve({ unreadCount: 9 });
    second.lists[0].resolve(page([note('new')]));
    second.counts[0].resolve({ unreadCount: 1 });
    await flush();

    const snapshot = controller.getSnapshot();
    expect(snapshot.state.order).toEqual(['new']);
    expect(snapshot.state.unreadCount).toBe(1);
  });

  it('ignores the same adapter and uses a new one on the next start', async () => {
    const first = createScriptedAdapter();
    const second = createScriptedAdapter();
    const controller = createInboxController({ adapter: first.adapter, clock: clockAt(NOW) });

    controller.actions.setAdapter(first.adapter);
    controller.actions.setAdapter(second.adapter);
    expect(first.calls.lists).toHaveLength(0);
    expect(second.calls.lists).toHaveLength(0);

    controller.start();
    expect(second.calls.lists).toHaveLength(1);
    expect(first.calls.lists).toHaveLength(0);

    second.lists[0].resolve(page([note('a')]));
    second.counts[0].resolve({ unreadCount: 1 });
    await flush();
    expect(controller.getSnapshot().state.order).toEqual(['a']);
  });

  it('rejects an empty context key instead of silently loading the wrong scope', () => {
    const script = createScriptedAdapter();
    const controller = createInboxController({ adapter: script.adapter, clock: clockAt(NOW) });

    expect(() => controller.actions.setContext({ key: '' })).toThrow(RangeError);
    expect(() =>
      createInboxController({ adapter: script.adapter, context: { key: '' } as InboxContext }),
    ).toThrow(RangeError);
  });
});

describe('filtering and paging', () => {
  it('appends pages in the server order, folds duplicates and stops at the end', async () => {
    const script = createScriptedAdapter();
    const controller = createInboxController({ adapter: script.adapter, clock: clockAt(NOW) });

    controller.start();
    script.lists[0].resolve(page([note('a'), note('b')], 'cursor-1'));
    script.counts[0].resolve({ unreadCount: 27 });
    await flush();

    expect(controller.getSnapshot().view.page.canLoadMore).toBe(true);

    const more = controller.actions.loadMore();
    expect(script.calls.lists).toHaveLength(2);
    expect(script.calls.lists[1]?.cursor).toBe('cursor-1');
    expect(script.calls.lists[1]?.filter).toBe('all');
    expect(controller.getSnapshot().state.pageStatus).toBe('loading');

    script.lists[1].resolve(page([note('b'), note('c')], 'cursor-2'));
    await more;

    let snapshot = controller.getSnapshot();
    expect(snapshot.state.order).toEqual(['a', 'b', 'c']);
    expect(snapshot.state.nextCursor).toBe('cursor-2');
    expect(snapshot.state.pageStatus).toBe('idle');
    expect(snapshot.view.list.count).toBe(3);
    // Three loaded rows under a counter of 27: the two numbers are independent.
    expect(snapshot.state.unreadCount).toBe(27);
    expect(snapshot.view.page.hasMore).toBe(true);

    const last = controller.actions.loadMore();
    expect(script.calls.lists[2]?.cursor).toBe('cursor-2');
    script.lists[2].resolve(page([note('d')], null));
    await last;

    snapshot = controller.getSnapshot();
    expect(snapshot.state.order).toEqual(['a', 'b', 'c', 'd']);
    expect(snapshot.state.nextCursor).toBeNull();
    expect(snapshot.view.page.hasMore).toBe(false);
    expect(snapshot.view.page.canLoadMore).toBe(false);

    await controller.actions.loadMore();
    expect(script.calls.lists).toHaveLength(3);
  });

  it('runs one page request at a time and treats an empty last page as the end', async () => {
    const script = createScriptedAdapter();
    const controller = createInboxController({ adapter: script.adapter, clock: clockAt(NOW) });

    controller.start();
    script.lists[0].resolve(page([note('a')], 'cursor-1'));
    script.counts[0].resolve({ unreadCount: 1 });
    await flush();

    const first = controller.actions.loadMore();
    const second = controller.actions.loadMore();
    expect(script.calls.lists).toHaveLength(2);
    await expect(second).resolves.toBeUndefined();

    script.lists[1].resolve(page([], null));
    await first;

    const snapshot = controller.getSnapshot();
    expect(snapshot.state.order).toEqual(['a']);
    expect(snapshot.state.nextCursor).toBeNull();
    expect(snapshot.state.pageStatus).toBe('idle');
    expect(snapshot.state.listStatus).toBe('ready');
    expect(snapshot.view.page.canLoadMore).toBe(false);

    await controller.actions.loadMore();
    expect(script.calls.lists).toHaveLength(2);
  });

  it('keeps the shown rows and retries the same page after a failure', async () => {
    const onError = vi.fn();
    const script = createScriptedAdapter();
    const controller = createInboxController({
      adapter: script.adapter,
      clock: clockAt(NOW),
      callbacks: { onError },
    });

    controller.start();
    script.lists[0].resolve(page([note('a')], 'cursor-1'));
    script.counts[0].resolve({ unreadCount: 1 });
    await flush();

    const failed = controller.actions.loadMore();
    script.lists[1].reject(
      new InboxError({ code: 'ADAPTER_FAILURE', message: 'The page is down' }),
    );
    await failed;

    let snapshot = controller.getSnapshot();
    expect(snapshot.state.order).toEqual(['a']);
    expect(snapshot.state.nextCursor).toBe('cursor-1');
    expect(snapshot.state.listStatus).toBe('ready');
    expect(snapshot.state.pageStatus).toBe('error');
    expect(snapshot.state.pageError?.code).toBe('ADAPTER_FAILURE');
    expect(snapshot.view.actions.canRetryPage).toBe(true);
    expect(onError).toHaveBeenCalledTimes(1);

    const retry = controller.actions.loadMore();
    expect(script.calls.lists).toHaveLength(3);
    expect(script.calls.lists[2]?.cursor).toBe('cursor-1');

    script.lists[2].resolve(page([note('b')], null));
    await retry;

    snapshot = controller.getSnapshot();
    expect(snapshot.state.order).toEqual(['a', 'b']);
    expect(snapshot.state.nextCursor).toBeNull();
    expect(snapshot.state.pageStatus).toBe('idle');
    expect(snapshot.state.pageError).toBeNull();
  });

  it('repeats a failed page through retry() without reloading the list or counter', async () => {
    const script = createScriptedAdapter();
    const controller = createInboxController({ adapter: script.adapter, clock: clockAt(NOW) });

    controller.start();
    script.lists[0].resolve(page([note('a')], 'cursor-1'));
    script.counts[0].resolve({ unreadCount: 3 });
    await flush();

    const failed = controller.actions.loadMore();
    script.lists[1].reject(new InboxError({ code: 'ADAPTER_FAILURE', message: 'No page' }));
    await failed;

    const retrying = controller.actions.retry();
    expect(script.calls.lists).toHaveLength(3);
    expect(script.calls.lists[2]?.cursor).toBe('cursor-1');
    expect(script.calls.counts).toHaveLength(1);

    script.lists[2].resolve(page([note('b')], null));
    await retrying;

    const snapshot = controller.getSnapshot();
    expect(snapshot.state.order).toEqual(['a', 'b']);
    expect(snapshot.state.unreadCount).toBe(3);
    expect(snapshot.state.pageStatus).toBe('idle');
  });

  it('ends the chain when a page repeats a cursor it has already requested', async () => {
    const script = createScriptedAdapter();
    const controller = createInboxController({ adapter: script.adapter, clock: clockAt(NOW) });

    controller.start();
    script.lists[0].resolve(page([note('a')], 'cursor-1'));
    script.counts[0].resolve({ unreadCount: 1 });
    await flush();

    const second = controller.actions.loadMore();
    script.lists[1].resolve(page([note('b')], 'cursor-2'));
    await second;

    const third = controller.actions.loadMore();
    expect(script.calls.lists[2]?.cursor).toBe('cursor-2');
    // `cursor-1` was requested earlier in this chain, so accepting it again
    // would let a buggy adapter walk in a cycle.
    script.lists[2].resolve(page([note('c')], 'cursor-1'));
    await third;

    const snapshot = controller.getSnapshot();
    expect(snapshot.state.order).toEqual(['a', 'b', 'c']);
    expect(snapshot.state.nextCursor).toBeNull();
    expect(snapshot.view.page.canLoadMore).toBe(false);

    await controller.actions.loadMore();
    expect(script.calls.lists).toHaveLength(3);
  });

  it('replaces the rows and the cursor on a filter change but keeps the counter', async () => {
    const script = createScriptedAdapter();
    const controller = createInboxController({ adapter: script.adapter, clock: clockAt(NOW) });

    controller.start();
    script.lists[0].resolve(page([note('a'), note('b', { read: true })], 'cursor-1'));
    script.counts[0].resolve({ unreadCount: 1 });
    await flush();

    controller.actions.setFilter('unread');

    expect(script.calls.lists).toHaveLength(2);
    expect(script.calls.lists[1]?.filter).toBe('unread');
    expect(script.calls.lists[1]?.cursor).toBeNull();
    expect(script.calls.counts).toHaveLength(1);

    let snapshot = controller.getSnapshot();
    expect(snapshot.state.filter).toBe('unread');
    expect(snapshot.state.order).toEqual([]);
    expect(snapshot.state.nextCursor).toBeNull();
    expect(snapshot.state.listStatus).toBe('loading');
    expect(snapshot.state.unreadCount).toBe(1);
    expect(snapshot.state.countStatus).toBe('ready');
    expect(snapshot.view.settings.filter).toBe('unread');
    expect(snapshot.view.list.empty).toBe(false);

    script.lists[1].resolve(page([note('c')], 'cursor-2'));
    await flush();

    snapshot = controller.getSnapshot();
    expect(snapshot.state.order).toEqual(['c']);
    expect(snapshot.state.nextCursor).toBe('cursor-2');
    expect(snapshot.state.unreadCount).toBe(1);
    expect(snapshot.view.list.empty).toBe(false);
  });

  it('drops the answers of filters the visitor has already left', async () => {
    const script = createScriptedAdapter();
    const controller = createInboxController({ adapter: script.adapter, clock: clockAt(NOW) });

    controller.start();
    controller.actions.setFilter('unread');
    controller.actions.setFilter('all');

    expect(script.calls.lists.map((call) => call.filter)).toEqual(['all', 'unread', 'all']);
    expect(script.calls.lists[0]?.signal.aborted).toBe(true);
    expect(script.calls.lists[1]?.signal.aborted).toBe(true);
    expect(script.calls.lists[2]?.signal.aborted).toBe(false);

    script.lists[0].resolve(page([note('stale-all')], 'stale-1'));
    script.lists[1].resolve(page([note('stale-unread')], 'stale-2'));
    script.lists[2].resolve(page([note('fresh')], null));
    script.counts[0].resolve({ unreadCount: 2 });
    await flush();

    const snapshot = controller.getSnapshot();
    expect(snapshot.state.filter).toBe('all');
    expect(snapshot.state.order).toEqual(['fresh']);
    expect(snapshot.state.byId['stale-all']).toBeUndefined();
    expect(snapshot.state.byId['stale-unread']).toBeUndefined();
    expect(snapshot.state.unreadCount).toBe(2);
  });

  it('abandons the page of the filter that is being replaced', async () => {
    const script = createScriptedAdapter();
    const controller = createInboxController({ adapter: script.adapter, clock: clockAt(NOW) });

    controller.start();
    script.lists[0].resolve(page([note('a')], 'cursor-1'));
    script.counts[0].resolve({ unreadCount: 1 });
    await flush();

    const more = controller.actions.loadMore();
    controller.actions.setFilter('unread');

    expect(script.calls.lists[1]?.signal.aborted).toBe(true);
    expect(script.calls.lists[2]?.filter).toBe('unread');

    script.lists[1].resolve(page([note('stale-page')], 'cursor-9'));
    script.lists[2].resolve(page([note('fresh-unread')], null));
    await more;
    await flush();

    const snapshot = controller.getSnapshot();
    expect(snapshot.state.order).toEqual(['fresh-unread']);
    expect(snapshot.state.byId['stale-page']).toBeUndefined();
    expect(snapshot.state.nextCursor).toBeNull();
  });

  it('lets a refresh replace the chain while a page is loading', async () => {
    const script = createScriptedAdapter();
    const controller = createInboxController({ adapter: script.adapter, clock: clockAt(NOW) });

    controller.start();
    script.lists[0].resolve(page([note('a')], 'cursor-1'));
    script.counts[0].resolve({ unreadCount: 1 });
    await flush();

    const more = controller.actions.loadMore();
    const refreshing = controller.actions.refresh();
    expect(script.calls.lists[1]?.signal.aborted).toBe(true);

    script.lists[1].resolve(page([note('stale-page')], 'cursor-9'));
    script.lists[2].resolve(page([note('fresh')], null));
    script.counts[1].resolve({ unreadCount: 1 });
    await Promise.all([more, refreshing]);

    const snapshot = controller.getSnapshot();
    expect(snapshot.state.order).toEqual(['fresh']);
    expect(snapshot.state.byId['stale-page']).toBeUndefined();
    expect(snapshot.state.nextCursor).toBeNull();
    expect(snapshot.state.pageStatus).toBe('idle');
  });

  it('applies a filter chosen before start and rejects an unknown one', () => {
    const script = createScriptedAdapter();
    const controller = createInboxController({ adapter: script.adapter, clock: clockAt(NOW) });

    expect(() => controller.actions.setFilter('later' as InboxFilter)).toThrow(RangeError);

    controller.actions.setFilter('unread');
    expect(script.calls.lists).toHaveLength(0);
    expect(controller.getSnapshot().state.filter).toBe('unread');

    controller.start();
    expect(script.calls.lists[0]?.filter).toBe('unread');
  });

  it('pages through the mock feed and recovers from a failed second page', async () => {
    const clock = clockAt(NOW);
    const notifications = [
      note('n1', { createdAt: '2026-10-18T12:05:00Z' }),
      note('n2', { createdAt: '2026-10-18T12:04:00Z' }),
      note('n3', { createdAt: '2026-10-18T12:03:00Z' }),
      note('n4', { createdAt: '2026-10-18T12:02:00Z' }),
      note('n5', { createdAt: '2026-10-18T12:01:00Z' }),
    ];
    const adapter = createMockAdapter({
      clock,
      pageSize: 2,
      contexts: [{ context: DEFAULT_INBOX_CONTEXT, notifications }],
    });
    const controller = createInboxController({ adapter, clock });

    controller.start();
    await flush();

    let snapshot = controller.getSnapshot();
    expect(snapshot.state.order).toEqual(['n1', 'n2']);
    expect(snapshot.state.unreadCount).toBe(5);
    expect(snapshot.view.page.canLoadMore).toBe(true);

    await controller.actions.loadMore();
    snapshot = controller.getSnapshot();
    expect(snapshot.state.order).toEqual(['n1', 'n2', 'n3', 'n4']);
    expect(snapshot.state.nextCursor).not.toBeNull();
    expect(snapshot.state.unreadCount).toBe(5);

    const cursor = snapshot.state.nextCursor;
    adapter.failNext('getNotifications');
    await controller.actions.loadMore();

    snapshot = controller.getSnapshot();
    expect(snapshot.state.order).toEqual(['n1', 'n2', 'n3', 'n4']);
    expect(snapshot.state.nextCursor).toBe(cursor);
    expect(snapshot.state.pageStatus).toBe('error');

    await controller.actions.loadMore();
    snapshot = controller.getSnapshot();
    expect(snapshot.state.order).toEqual(['n1', 'n2', 'n3', 'n4', 'n5']);
    expect(snapshot.state.nextCursor).toBeNull();
    expect(snapshot.state.pageStatus).toBe('idle');
    expect(snapshot.state.listStatus).toBe('ready');
    expect(snapshot.state.unreadCount).toBe(5);
  });
});

describe('individual read operations', () => {
  async function loadedController(
    script: ReturnType<typeof createScriptedAdapter>,
    options: {
      filter?: InboxFilter;
      notifications?: InboxNotification[];
      unreadCount?: number;
    } = {},
  ) {
    const controller = createInboxController({
      adapter: script.adapter,
      clock: clockAt(NOW),
    });
    if (options.filter !== undefined) controller.actions.setFilter(options.filter);
    controller.start();
    script.lists[0].resolve(page(options.notifications ?? [note('a'), note('b')]));
    script.counts[0].resolve({ unreadCount: options.unreadCount ?? 2 });
    await flush();
    return controller;
  }

  it('shows the desired state and the projected counter before the server answers', async () => {
    const script = createScriptedAdapter();
    const controller = await loadedController(script);

    const marking = controller.actions.setRead('a', true);

    expect(script.calls.reads).toHaveLength(1);
    expect(script.calls.reads[0]).toMatchObject({ id: 'a', read: true });
    expect(script.calls.reads[0]?.context.key).toBe('default');

    let snapshot = controller.getSnapshot();
    expect(snapshot.state.pending.readOrder).toEqual(['a']);
    expect(snapshot.view.list.items[0]?.read).toBe(true);
    expect(snapshot.view.list.items[0]?.pending).toBe(true);
    expect(snapshot.view.actions.busy).toBe(true);
    // The state keeps the server number; the view projects the queued change.
    expect(snapshot.state.unreadCount).toBe(2);
    expect(snapshot.view.counter.unreadCount).toBe(1);

    script.reads[0].resolve({
      notification: { ...note('a'), read: true },
      unreadCount: 1,
    });
    await marking;

    snapshot = controller.getSnapshot();
    expect(snapshot.state.pending.readOrder).toEqual([]);
    expect(snapshot.state.byId.a?.read).toBe(true);
    expect(snapshot.state.unreadCount).toBe(1);
    expect(snapshot.view.counter.unreadCount).toBe(1);
    expect(snapshot.view.list.items[0]?.pending).toBe(false);
    expect(snapshot.view.actions.busy).toBe(false);
  });

  it('sends one mutation at a time and keeps the queue order', async () => {
    const script = createScriptedAdapter();
    const controller = await loadedController(script);

    const first = controller.actions.setRead('a', true);
    const opposite = controller.actions.setRead('a', false);
    const repeat = controller.actions.setRead('b', true);
    const second = controller.actions.setRead('b', true);

    // Only the first has left; the opposite click on `a` and the repeat of the
    // desired state on `b` are ignored.
    expect(script.calls.reads).toHaveLength(1);
    expect(script.calls.reads[0]).toMatchObject({ id: 'a', read: true });
    expect(script.calls.reads[0]?.context.key).toBe('default');

    expect(controller.getSnapshot().state.pending.readOrder).toEqual(['a', 'b']);
    expect(controller.getSnapshot().view.counter.unreadCount).toBe(0);

    script.reads[0].resolve({ notification: { ...note('a'), read: true }, unreadCount: 1 });
    await first;

    // The second row is sent only after the first settled.
    expect(script.calls.reads).toHaveLength(2);
    expect(script.calls.reads[1]).toMatchObject({ id: 'b', read: true });
    script.reads[1].resolve({ notification: { ...note('b'), read: true }, unreadCount: 0 });
    await second;
    await opposite;
    await repeat;

    const snapshot = controller.getSnapshot();
    expect(snapshot.state.pending.readOrder).toEqual([]);
    expect(snapshot.view.counter.unreadCount).toBe(0);
    expect(snapshot.state.byId.a?.read).toBe(true);
    expect(snapshot.state.byId.b?.read).toBe(true);
  });

  it('does not send a request for the state the notification already has', async () => {
    const script = createScriptedAdapter();
    const controller = await loadedController(script, {
      notifications: [note('a', { read: true }), note('b')],
      unreadCount: 1,
    });

    await controller.actions.setRead('a', true);
    await controller.actions.setRead('b', false);
    await controller.actions.setRead('missing', true);

    expect(script.calls.reads).toHaveLength(0);
  });

  it('rolls back only the refused operation and keeps a newer event', async () => {
    const onError = vi.fn();
    const script = createScriptedAdapter();
    const controller = createInboxController({
      adapter: script.adapter,
      clock: clockAt(NOW),
      callbacks: { onError },
    });
    controller.start();
    script.lists[0].resolve(page([note('a'), note('b')]));
    script.counts[0].resolve({ unreadCount: 2 });
    await flush();

    const marking = controller.actions.setRead('a', true);
    // A newer event arrives while the change is in flight. A refresh replaces
    // the chain and the counter without touching the optimistic layer.
    const refreshing = controller.actions.refresh();
    script.lists[1].resolve(page([note('a'), note('b'), note('c')]));
    script.counts[1].resolve({ unreadCount: 3 });
    await refreshing;

    expect(controller.getSnapshot().view.list.items.map((item) => item.id)).toEqual([
      'a',
      'b',
      'c',
    ]);

    script.reads[0].reject(
      new InboxError({ code: 'CONFLICT', phase: 'mutation', message: 'The row moved on' }),
    );
    await marking;

    const snapshot = controller.getSnapshot();
    expect(snapshot.state.pending.readOrder).toEqual([]);
    expect(snapshot.state.byId.a?.read).toBe(false);
    expect(snapshot.view.list.items.map((item) => item.id)).toEqual(['a', 'b', 'c']);
    expect(snapshot.state.unreadCount).toBe(3);
    expect(snapshot.view.counter.unreadCount).toBe(3);
    expect(snapshot.state.actionError).toMatchObject({ scope: 'read', id: 'a' });
    expect(snapshot.view.list.items[0]?.actionError).toBe('The notification could not be updated');
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0]?.[0]?.outcome).toBe('rejected');
  });

  it('keeps a lost answer as unknown, reconciles and never repeats the mutation', async () => {
    const onError = vi.fn();
    const script = createScriptedAdapter();
    const controller = createInboxController({
      adapter: script.adapter,
      clock: clockAt(NOW),
      callbacks: { onError },
    });
    controller.start();
    script.lists[0].resolve(page([note('a'), note('b')]));
    script.counts[0].resolve({ unreadCount: 2 });
    await flush();

    const marking = controller.actions.setRead('a', true);
    script.reads[0].reject(new Error('The connection dropped mid-flight'));
    await flush();

    // The transport error is not a refusal: the row stays in the unknown state
    // and the controller asks the server for the confirmed data instead.
    let snapshot = controller.getSnapshot();
    expect(snapshot.view.list.items[0]?.unknown).toBe(true);
    expect(snapshot.view.list.items[0]?.read).toBe(true);
    expect(snapshot.view.actions.busy).toBe(true);
    expect(script.calls.reads).toHaveLength(1);
    expect(script.calls.lists).toHaveLength(2);
    expect(onError.mock.calls[0]?.[0]?.outcome).toBe('unknown');

    script.lists[1].resolve(page([note('a', { read: true }), note('b')]));
    script.counts[1].resolve({ unreadCount: 1 });
    await marking;

    snapshot = controller.getSnapshot();
    expect(snapshot.state.pending.readOrder).toEqual([]);
    expect(snapshot.view.list.items[0]?.unknown).toBe(false);
    expect(snapshot.view.list.items[0]?.read).toBe(true);
    expect(snapshot.state.unreadCount).toBe(1);
    expect(script.calls.reads).toHaveLength(1);
  });

  it('keeps the unknown state when the reconciliation fails and resolves it on a later one', async () => {
    const script = createScriptedAdapter();
    const controller = createInboxController({ adapter: script.adapter, clock: clockAt(NOW) });
    controller.start();
    script.lists[0].resolve(page([note('a')]));
    script.counts[0].resolve({ unreadCount: 1 });
    await flush();

    const marking = controller.actions.setRead('a', true);
    script.reads[0].reject(
      new InboxError({
        code: 'UNKNOWN',
        phase: 'mutation',
        outcome: 'unknown',
        message: 'No answer',
      }),
    );
    await flush();

    script.lists[1].reject(new InboxError({ code: 'ADAPTER_FAILURE', message: 'Still down' }));
    script.counts[1].reject(new InboxError({ code: 'ADAPTER_FAILURE', message: 'Still down' }));
    await marking;

    expect(controller.getSnapshot().view.list.items[0]?.unknown).toBe(true);

    const reconciling = controller.actions.reconcile();
    script.lists[2].resolve(page([note('a', { read: true })]));
    script.counts[2].resolve({ unreadCount: 0 });
    await reconciling;

    const snapshot = controller.getSnapshot();
    expect(snapshot.state.pending.readOrder).toEqual([]);
    expect(snapshot.view.list.items[0]?.unknown).toBe(false);
    expect(snapshot.view.list.items[0]?.read).toBe(true);
    expect(snapshot.state.unreadCount).toBe(0);
  });

  it('drops a counter answer that the confirmed mutation supersedes', async () => {
    const script = createScriptedAdapter();
    const controller = createInboxController({ adapter: script.adapter, clock: clockAt(NOW) });
    controller.start();
    script.lists[0].resolve(page([note('a'), note('b')]));
    script.counts[0].resolve({ unreadCount: 2 });
    await flush();

    const refreshing = controller.actions.refresh();
    const marking = controller.actions.setRead('a', true);

    script.reads[0].resolve({ notification: { ...note('a'), read: true }, unreadCount: 1 });
    await marking;

    expect(script.calls.counts[1]?.signal.aborted).toBe(true);
    expect(controller.getSnapshot().state.unreadCount).toBe(1);

    // The older counter request answers late; the mutation result already told
    // the state the newer truth. The list is asked again because it started
    // before the confirmed change, even though its answer already agrees.
    script.counts[1].resolve({ unreadCount: 2 });
    script.lists[1].resolve(page([note('a', { read: true }), note('b')]));
    await flush();
    expect(script.calls.lists).toHaveLength(3);
    script.lists[2].resolve(page([note('a', { read: true }), note('b')]));
    await refreshing;

    const snapshot = controller.getSnapshot();
    expect(snapshot.state.unreadCount).toBe(1);
    expect(snapshot.state.byId.a?.read).toBe(true);
  });

  it('does not let a first page requested before a confirmed read restore the old row', async () => {
    const script = createScriptedAdapter();
    const controller = createInboxController({ adapter: script.adapter, clock: clockAt(NOW) });
    controller.start();
    script.lists[0].resolve(page([note('a')]));
    script.counts[0].resolve({ unreadCount: 1 });
    await flush();

    const refreshing = controller.actions.refresh();
    const marking = controller.actions.setRead('a', true);

    script.reads[0].resolve({ notification: { ...note('a'), read: true }, unreadCount: 0 });
    await marking;

    // The list request started before the mutation and answers last with the
    // server state as it was before the read. It must not undo the confirmed
    // row; the controller asks for a fresh first page instead.
    script.lists[1].resolve(page([note('a')]));
    script.counts[1].resolve({ unreadCount: 1 });
    await flush();

    let snapshot = controller.getSnapshot();
    expect(snapshot.state.listStatus).toBe('loading');
    expect(snapshot.state.byId.a?.read).toBe(true);
    expect(snapshot.state.unreadCount).toBe(0);
    expect(script.calls.lists).toHaveLength(3);

    script.lists[2].resolve(page([note('a', { read: true })]));
    await refreshing;

    snapshot = controller.getSnapshot();
    expect(snapshot.state.listStatus).toBe('ready');
    expect(snapshot.state.byId.a?.read).toBe(true);
    expect(snapshot.state.unreadCount).toBe(0);
    expect(script.calls.reads).toHaveLength(1);
  });

  it('settles unknown operations when retry recovers both failed loads', async () => {
    const script = createScriptedAdapter();
    const controller = createInboxController({ adapter: script.adapter, clock: clockAt(NOW) });
    controller.start();
    script.lists[0].resolve(page([note('a'), note('b')]));
    script.counts[0].resolve({ unreadCount: 2 });
    await flush();

    const marking = controller.actions.setRead('a', true);
    script.reads[0].reject(new Error('The connection dropped mid-flight'));
    await flush();

    // The automatic reconciliation fails on both halves, so the row stays
    // unknown and the actions stay blocked until the visitor retries.
    script.lists[1].reject(new InboxError({ code: 'ADAPTER_FAILURE', message: 'Still down' }));
    script.counts[1].reject(new InboxError({ code: 'ADAPTER_FAILURE', message: 'Still down' }));
    await marking;

    let snapshot = controller.getSnapshot();
    expect(snapshot.view.list.items[0]?.unknown).toBe(true);
    expect(snapshot.view.actions.busy).toBe(true);
    expect(snapshot.state.pending.readOrder).toEqual(['a']);

    const retrying = controller.actions.retry();
    expect(script.calls.lists).toHaveLength(3);
    expect(script.calls.counts).toHaveLength(3);

    script.lists[2].resolve(page([note('a', { read: true }), note('b')]));
    script.counts[2].resolve({ unreadCount: 1 });
    await retrying;

    snapshot = controller.getSnapshot();
    expect(snapshot.state.pending.readOrder).toEqual([]);
    expect(snapshot.view.list.items[0]?.unknown).toBe(false);
    expect(snapshot.view.list.items[0]?.read).toBe(true);
    expect(snapshot.view.actions.busy).toBe(false);
    expect(snapshot.state.unreadCount).toBe(1);
    // Reconciliation reads the server; it never repeats the lost mutation.
    expect(script.calls.reads).toHaveLength(1);
  });

  it('abandons the mutation and the queue when the context changes', async () => {
    const script = createScriptedAdapter();
    const controller = createInboxController({
      adapter: script.adapter,
      context: { key: 'user-1' },
      clock: clockAt(NOW),
    });
    controller.start();
    script.lists[0].resolve(page([note('a'), note('b')]));
    script.counts[0].resolve({ unreadCount: 2 });
    await flush();

    const first = controller.actions.setRead('a', true);
    const queued = controller.actions.setRead('b', true);
    controller.actions.setContext({ key: 'user-2' });

    // The queue is dropped with the previous context; only the request that
    // already left exists, and its answer must not move the new state.
    expect(script.calls.reads).toHaveLength(1);
    await first;
    await queued;

    script.lists[1].resolve(page([note('fresh')]));
    script.counts[1].resolve({ unreadCount: 5 });
    await flush();

    script.reads[0].resolve({ notification: { ...note('a'), read: true }, unreadCount: 0 });
    await flush();

    const snapshot = controller.getSnapshot();
    expect(snapshot.state.contextKey).toBe('user-2');
    expect(snapshot.state.order).toEqual(['fresh']);
    expect(snapshot.state.unreadCount).toBe(5);
    expect(snapshot.state.pending.readOrder).toEqual([]);
  });

  it('removes a read row from the unread filter and brings it back on rollback', async () => {
    const script = createScriptedAdapter();
    const controller = createInboxController({ adapter: script.adapter, clock: clockAt(NOW) });
    controller.actions.setFilter('unread');
    controller.start();
    script.lists[0].resolve(page([note('a'), note('b')]));
    script.counts[0].resolve({ unreadCount: 2 });
    await flush();

    expect(controller.getSnapshot().view.list.items.map((item) => item.id)).toEqual(['a', 'b']);

    const marking = controller.actions.setRead('a', true);
    expect(controller.getSnapshot().view.list.items.map((item) => item.id)).toEqual(['b']);
    expect(controller.getSnapshot().view.counter.unreadCount).toBe(1);

    script.reads[0].reject(
      new InboxError({ code: 'ADAPTER_FAILURE', phase: 'mutation', message: 'Refused' }),
    );
    await marking;

    expect(controller.getSnapshot().view.list.items.map((item) => item.id)).toEqual(['a', 'b']);
    expect(controller.getSnapshot().view.counter.unreadCount).toBe(2);
  });

  it('uses the server row and counter as the confirmation, not the requested values', async () => {
    const script = createScriptedAdapter();
    const controller = await loadedController(script);

    const marking = controller.actions.setRead('a', true);
    script.reads[0].resolve({
      notification: { ...note('a'), read: false, title: 'Changed elsewhere' },
      unreadCount: 5,
    });
    await marking;

    const snapshot = controller.getSnapshot();
    expect(snapshot.state.pending.readOrder).toEqual([]);
    expect(snapshot.view.list.items[0]?.read).toBe(false);
    expect(snapshot.view.list.items[0]?.title).toBe('Changed elsewhere');
    expect(snapshot.state.unreadCount).toBe(5);
    expect(snapshot.view.counter.unreadCount).toBe(5);
  });

  it('reconciles a lost answer against a server that already applied it', async () => {
    const clock = clockAt(NOW);
    const onError = vi.fn();
    const adapter = createMockAdapter({
      clock,
      contexts: [{ context: DEFAULT_INBOX_CONTEXT, notifications: [note('a'), note('b')] }],
    });
    const controller = createInboxController({ adapter, clock, callbacks: { onError } });

    controller.start();
    await flush();
    expect(controller.getSnapshot().state.unreadCount).toBe(2);

    adapter.failNext('setReadStatus', { apply: true, outcome: 'unknown' });
    await controller.actions.setRead('a', true);

    const snapshot = controller.getSnapshot();
    expect(snapshot.state.pending.readOrder).toEqual([]);
    expect(snapshot.state.byId.a?.read).toBe(true);
    expect(snapshot.state.unreadCount).toBe(1);
    expect(snapshot.view.list.items[0]?.unknown).toBe(false);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0]?.[0]?.outcome).toBe('unknown');
  });
});

describe('the server-side “mark all read” operation', () => {
  it('marks rows that were never loaded and keeps the server order', async () => {
    const clock = clockAt(NOW);
    const notifications = Array.from({ length: 27 }, (_, index) =>
      note(`n${String(index).padStart(2, '0')}`, {
        createdAt: new Date(NOW - index * 60_000).toISOString(),
        read: index === 3,
      }),
    );
    const adapter = createMockAdapter({
      clock,
      pageSize: 10,
      contexts: [{ context: DEFAULT_INBOX_CONTEXT, notifications }],
    });
    const controller = createInboxController({ adapter, clock });

    controller.start();
    await flush();

    let snapshot = controller.getSnapshot();
    expect(snapshot.state.order).toHaveLength(10);
    expect(snapshot.state.unreadCount).toBe(26);
    expect(snapshot.view.list.items.map((item) => item.id)).toEqual(
      notifications.slice(0, 10).map((item) => item.id),
    );

    await controller.actions.markAllRead();

    snapshot = controller.getSnapshot();
    expect(snapshot.state.pending.bulk).toBeNull();
    expect(snapshot.state.order).toEqual(notifications.slice(0, 10).map((item) => item.id));
    expect(snapshot.view.list.items.every((item) => item.read)).toBe(true);
    expect(snapshot.state.unreadCount).toBe(0);
    expect(snapshot.view.counter.unreadCount).toBe(0);

    // The proof goes through the mock store, not through the loaded page: the
    // 17 rows that were never requested are read as well.
    const { unreadCount } = await adapter.getUnreadCount({
      context: DEFAULT_INBOX_CONTEXT,
      signal: new AbortController().signal,
    });
    expect(unreadCount).toBe(0);
  });

  it('keeps an event created after the server boundary unread', async () => {
    const clock = clockAt(NOW);
    const adapter = createMockAdapter({
      clock,
      contexts: [{ context: DEFAULT_INBOX_CONTEXT, notifications: [note('a'), note('b')] }],
    });
    const controller = createInboxController({ adapter, clock });

    controller.start();
    await flush();
    await controller.actions.markAllRead();

    expect(controller.getSnapshot().state.unreadCount).toBe(0);

    adapter.addNotification(
      DEFAULT_INBOX_CONTEXT,
      note('after', { createdAt: '2026-10-18T13:05:00Z' }),
    );
    await controller.actions.refresh();

    const snapshot = controller.getSnapshot();
    expect(snapshot.state.order).toEqual(['after', 'a', 'b']);
    expect(snapshot.view.list.items[0]?.read).toBe(false);
    expect(snapshot.view.list.items[0]?.unread).toBe(true);
    expect(snapshot.state.unreadCount).toBe(1);
  });

  it('includes an event stored before the boundary and never loaded first', async () => {
    const clock = clockAt(NOW);
    const adapter = createMockAdapter({
      clock,
      contexts: [{ context: DEFAULT_INBOX_CONTEXT, notifications: [note('a'), note('b')] }],
    });
    adapter.setLatency((operation) => (operation === 'markAllRead' ? 20 : 0));
    const controller = createInboxController({ adapter, clock });

    controller.start();
    await flush();

    const marking = controller.actions.markAllRead();
    expect(controller.getSnapshot().state.pending.bulk?.status).toBe('pending');
    expect(controller.getSnapshot().view.counter.unreadCount).toBe(0);

    // Created after the click but before the mock reads its boundary: the server
    // covers it, even though the page on screen never held it.
    adapter.addNotification(
      DEFAULT_INBOX_CONTEXT,
      note('early', { createdAt: '2026-10-18T12:58:00Z' }),
    );
    await marking;

    const snapshot = controller.getSnapshot();
    expect(snapshot.state.order[0]).toBe('early');
    expect(snapshot.view.list.items[0]?.read).toBe(true);
    expect(snapshot.state.unreadCount).toBe(0);
  });

  it('applies the confirmed boundary before the refreshed first page replaces the chain', async () => {
    const script = createScriptedAdapter();
    const controller = createInboxController({ adapter: script.adapter, clock: clockAt(NOW) });
    controller.start();
    script.lists[0].resolve(
      page([
        note('early', { createdAt: '2026-10-18T12:50:00Z' }),
        note('late', { createdAt: '2026-10-18T12:56:00Z' }),
        note('already', { createdAt: '2026-10-18T12:40:00Z', read: true }),
      ]),
    );
    script.counts[0].resolve({ unreadCount: 27 });
    await flush();

    const marking = controller.actions.markAllRead();

    expect(script.calls.marksAll).toHaveLength(1);
    let snapshot = controller.getSnapshot();
    expect(snapshot.state.pending.bulk?.status).toBe('pending');
    expect(snapshot.view.list.items.every((item) => item.read)).toBe(true);
    expect(snapshot.view.counter.unreadCount).toBe(0);
    expect(snapshot.state.unreadCount).toBe(27);
    expect(snapshot.view.actions.canMarkAllRead).toBe(false);

    script.marks[0].resolve({ boundary: '2026-10-18T12:55:00Z', unreadCount: 4 });
    await flush();

    // The boundary settles the loaded rows; the first page that follows is what
    // shows what the boundary left unread.
    snapshot = controller.getSnapshot();
    expect(snapshot.state.pending.bulk).toBeNull();
    expect(snapshot.state.byId.early?.read).toBe(true);
    expect(snapshot.state.byId.already?.read).toBe(true);
    expect(snapshot.state.byId.late?.read).toBe(false);
    expect(snapshot.state.unreadCount).toBe(4);
    expect(script.calls.lists).toHaveLength(2);

    script.lists[1].resolve(
      page([
        note('late', { createdAt: '2026-10-18T12:56:00Z' }),
        note('early', { createdAt: '2026-10-18T12:50:00Z', read: true }),
        note('after', { createdAt: '2026-10-18T12:57:00Z' }),
      ]),
    );
    script.counts[1].resolve({ unreadCount: 2 });
    await marking;

    snapshot = controller.getSnapshot();
    expect(snapshot.state.order).toEqual(['late', 'early', 'after']);
    expect(snapshot.view.list.items.map((item) => item.read)).toEqual([false, true, false]);
    expect(snapshot.state.unreadCount).toBe(2);
    expect(snapshot.view.actions.busy).toBe(false);
  });

  it('reconciles a lost answer against a server that already applied it', async () => {
    const clock = clockAt(NOW);
    const onError = vi.fn();
    const adapter = createMockAdapter({
      clock,
      contexts: [{ context: DEFAULT_INBOX_CONTEXT, notifications: [note('a'), note('b')] }],
    });
    const controller = createInboxController({ adapter, clock, callbacks: { onError } });

    controller.start();
    await flush();
    adapter.failNext('markAllRead', { apply: true, outcome: 'unknown' });

    await controller.actions.markAllRead();

    const snapshot = controller.getSnapshot();
    expect(snapshot.state.pending.bulk).toBeNull();
    expect(snapshot.view.list.items.every((item) => item.read)).toBe(true);
    expect(snapshot.state.unreadCount).toBe(0);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0]?.[0]?.outcome).toBe('unknown');

    const { unreadCount } = await adapter.getUnreadCount({
      context: DEFAULT_INBOX_CONTEXT,
      signal: new AbortController().signal,
    });
    expect(unreadCount).toBe(0);
  });

  it('rolls the whole layer back on a confirmed refusal', async () => {
    const onError = vi.fn();
    const script = createScriptedAdapter();
    const controller = createInboxController({
      adapter: script.adapter,
      clock: clockAt(NOW),
      callbacks: { onError },
    });
    controller.start();
    script.lists[0].resolve(page([note('a'), note('b')]));
    script.counts[0].resolve({ unreadCount: 2 });
    await flush();

    const marking = controller.actions.markAllRead();
    script.marks[0].reject(
      new InboxError({ code: 'CONFLICT', phase: 'mutation', message: 'The context moved on' }),
    );
    await marking;

    const snapshot = controller.getSnapshot();
    expect(snapshot.state.pending.bulk).toBeNull();
    expect(snapshot.view.list.items.every((item) => item.read)).toBe(false);
    expect(snapshot.state.unreadCount).toBe(2);
    expect(snapshot.view.counter.unreadCount).toBe(2);
    expect(snapshot.state.actionError).toMatchObject({ scope: 'bulk' });
    expect(snapshot.view.actions.bulkError).toBe('The notifications could not be marked read');
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0]?.[0]?.outcome).toBe('rejected');
  });

  it('reconciles a lost answer and never repeats the bulk request', async () => {
    const onError = vi.fn();
    const script = createScriptedAdapter();
    const controller = createInboxController({
      adapter: script.adapter,
      clock: clockAt(NOW),
      callbacks: { onError },
    });
    controller.start();
    script.lists[0].resolve(page([note('a'), note('b')]));
    script.counts[0].resolve({ unreadCount: 2 });
    await flush();

    const marking = controller.actions.markAllRead();
    script.marks[0].reject(new Error('The connection dropped mid-flight'));
    await flush();

    let snapshot = controller.getSnapshot();
    expect(snapshot.state.pending.bulk?.status).toBe('unknown');
    // The lost answer is not projected as a confirmed zero.
    expect(snapshot.view.counter.unreadCount).toBe(2);
    expect(script.calls.lists).toHaveLength(2);
    expect(script.calls.marksAll).toHaveLength(1);
    expect(onError.mock.calls[0]?.[0]?.outcome).toBe('unknown');

    script.lists[1].resolve(page([note('a', { read: true }), note('b', { read: true })]));
    script.counts[1].resolve({ unreadCount: 0 });
    await marking;

    snapshot = controller.getSnapshot();
    expect(snapshot.state.pending.bulk).toBeNull();
    expect(snapshot.view.list.items.every((item) => item.read)).toBe(true);
    expect(snapshot.state.unreadCount).toBe(0);
    expect(script.calls.marksAll).toHaveLength(1);
  });

  it('is refused while the individual queue is busy and refuses individual changes while it runs', async () => {
    const script = createScriptedAdapter();
    const controller = createInboxController({ adapter: script.adapter, clock: clockAt(NOW) });
    controller.start();
    script.lists[0].resolve(page([note('a'), note('b')]));
    script.counts[0].resolve({ unreadCount: 2 });
    await flush();

    const reading = controller.actions.setRead('a', true);
    const busy = controller.actions.markAllRead();
    expect(script.calls.marksAll).toHaveLength(0);

    script.reads[0].resolve({ notification: { ...note('a'), read: true }, unreadCount: 1 });
    await reading;
    await busy;

    const marking = controller.actions.markAllRead();
    expect(script.calls.marksAll).toHaveLength(1);

    // The bulk operation owns the context: a click on one row is ignored.
    await controller.actions.setRead('b', true);
    expect(script.calls.reads).toHaveLength(1);

    script.marks[0].resolve({ boundary: '2026-10-18T13:00:00Z', unreadCount: 0 });
    await flush();
    script.lists[1].resolve(page([note('a', { read: true }), note('b', { read: true })]));
    script.counts[1].resolve({ unreadCount: 0 });
    await marking;

    expect(controller.getSnapshot().state.pending.bulk).toBeNull();
    expect(controller.getSnapshot().state.pending.reads).toEqual({});
  });

  it('does nothing while the counter is unknown or zero', async () => {
    const script = createScriptedAdapter();
    const controller = createInboxController({ adapter: script.adapter, clock: clockAt(NOW) });

    // Before `start` the counter is unknown.
    await controller.actions.markAllRead();
    expect(script.calls.marksAll).toHaveLength(0);

    controller.start();
    script.lists[0].resolve(page([note('a', { read: true })]));
    script.counts[0].resolve({ unreadCount: 0 });
    await flush();

    await controller.actions.markAllRead();
    expect(script.calls.marksAll).toHaveLength(0);
  });

  it('drops an answer that arrives after the context changed', async () => {
    const script = createScriptedAdapter();
    const controller = createInboxController({
      adapter: script.adapter,
      context: { key: 'user-1' },
      clock: clockAt(NOW),
    });
    controller.start();
    script.lists[0].resolve(page([note('a'), note('b')]));
    script.counts[0].resolve({ unreadCount: 2 });
    await flush();

    const marking = controller.actions.markAllRead();
    controller.actions.setContext({ key: 'user-2' });

    expect(controller.getSnapshot().state.pending.bulk).toBeNull();

    script.lists[1].resolve(page([note('fresh')]));
    script.counts[1].resolve({ unreadCount: 5 });
    await flush();

    script.marks[0].resolve({ boundary: '2026-10-18T13:00:00Z', unreadCount: 0 });
    await marking;

    const snapshot = controller.getSnapshot();
    expect(snapshot.state.contextKey).toBe('user-2');
    expect(snapshot.state.order).toEqual(['fresh']);
    expect(snapshot.state.unreadCount).toBe(5);
    expect(snapshot.state.pending.bulk).toBeNull();
  });
});

describe('external updates', () => {
  it('opens one subscription in start, releases it in stop and ignores a late event', async () => {
    const script = createScriptedAdapter({ subscribe: true });
    const controller = createInboxController({ adapter: script.adapter, clock: clockAt(NOW) });

    controller.start();
    expect(script.calls.subscriptions).toHaveLength(1);
    expect(script.calls.subscriptions[0]?.context).toEqual(DEFAULT_INBOX_CONTEXT);

    // A second start does not open a second subscription.
    controller.start();
    expect(script.calls.subscriptions).toHaveLength(1);

    script.lists[0].resolve(page([note('a')]));
    script.counts[0].resolve({ unreadCount: 1 });
    await flush();

    const late = script.subscriptions[0]?.query.onInvalidate as () => void;

    controller.stop();
    expect(script.activeSubscriptions()).toBe(0);

    // A transport can deliver one more event after the unsubscribe; it is ignored.
    late();
    expect(controller.getSnapshot().state.updatesAvailable).toBe(false);
    expect(script.calls.counts).toHaveLength(1);

    controller.start();
    expect(script.calls.subscriptions).toHaveLength(2);
    expect(script.activeSubscriptions()).toBe(1);
  });

  it('coalesces a burst, refreshes the counter and keeps the list until showUpdates', async () => {
    const script = createScriptedAdapter({ subscribe: true });
    const controller = createInboxController({ adapter: script.adapter, clock: clockAt(NOW) });

    controller.start();
    script.lists[0].resolve(page([note('a', { read: true })]));
    script.counts[0].resolve({ unreadCount: 1 });
    await flush();

    script.emitInvalidation();
    script.emitInvalidation();
    script.emitInvalidation();

    // The flag is raised at once; the counter read is coalesced into one request.
    let snapshot = controller.getSnapshot();
    expect(snapshot.state.updatesAvailable).toBe(true);
    expect(snapshot.view.updates).toEqual({ available: true, label: 'Show updates' });
    expect(snapshot.view.actions.canShowUpdates).toBe(true);

    await flush();
    expect(script.calls.counts).toHaveLength(2);
    script.counts[1].resolve({ unreadCount: 4 });
    await flush();

    snapshot = controller.getSnapshot();
    expect(snapshot.state.unreadCount).toBe(4);
    // The open list is exactly the one the visitor was reading.
    expect(snapshot.state.order).toEqual(['a']);
    expect(script.calls.lists).toHaveLength(1);

    const showing = controller.actions.showUpdates();
    expect(script.calls.lists).toHaveLength(2);
    script.lists[1].resolve(page([note('b'), note('a', { read: true })]));
    script.counts[2].resolve({ unreadCount: 3 });
    await showing;

    snapshot = controller.getSnapshot();
    expect(snapshot.state.order).toEqual(['b', 'a']);
    expect(snapshot.state.updatesAvailable).toBe(false);
    expect(snapshot.view.updates.available).toBe(false);
  });

  it('does nothing on showUpdates when no update is pending', async () => {
    const script = createScriptedAdapter({ subscribe: true });
    const controller = createInboxController({ adapter: script.adapter, clock: clockAt(NOW) });

    controller.start();
    script.lists[0].resolve(page([note('a')]));
    script.counts[0].resolve({ unreadCount: 1 });
    await flush();

    await controller.actions.showUpdates();
    expect(script.calls.lists).toHaveLength(1);
    expect(script.calls.counts).toHaveLength(1);
  });

  it('does not lose an event that arrives while the counter is being read', async () => {
    const script = createScriptedAdapter({ subscribe: true });
    const controller = createInboxController({ adapter: script.adapter, clock: clockAt(NOW) });

    controller.start();
    script.lists[0].resolve(page([note('a')]));
    script.counts[0].resolve({ unreadCount: 1 });
    await flush();

    script.emitInvalidation();
    await flush();
    expect(script.calls.counts).toHaveLength(2);

    // The second event arrives while the first read is in flight: the answer of
    // that read cannot be trusted for it, so the controller asks again.
    script.emitInvalidation();
    script.counts[1].resolve({ unreadCount: 5 });
    await flush();
    expect(script.calls.counts).toHaveLength(3);

    script.counts[2].resolve({ unreadCount: 6 });
    await flush();

    const snapshot = controller.getSnapshot();
    expect(snapshot.state.unreadCount).toBe(6);
    expect(snapshot.state.updatesAvailable).toBe(true);
  });

  it('keeps the flag when an event arrives during the refresh it asked for', async () => {
    const script = createScriptedAdapter({ subscribe: true });
    const controller = createInboxController({ adapter: script.adapter, clock: clockAt(NOW) });

    controller.start();
    script.lists[0].resolve(page([note('a')]));
    script.counts[0].resolve({ unreadCount: 1 });
    await flush();

    script.emitInvalidation();
    await flush();

    const showing = controller.actions.showUpdates();
    expect(script.calls.lists).toHaveLength(2);

    // The first page and the counter were requested before this event, so the
    // new list is applied but the flag survives for a later acknowledgement.
    script.emitInvalidation();
    script.lists[1].resolve(page([note('b'), note('a')]));
    script.counts[2].resolve({ unreadCount: 2 });
    await showing;

    let snapshot = controller.getSnapshot();
    expect(snapshot.state.order).toEqual(['b', 'a']);
    expect(snapshot.state.updatesAvailable).toBe(true);
    expect(snapshot.view.actions.canShowUpdates).toBe(true);

    await flush();
    expect(script.calls.counts).toHaveLength(4);
    script.counts[3].resolve({ unreadCount: 3 });
    await flush();

    snapshot = controller.getSnapshot();
    expect(snapshot.state.unreadCount).toBe(3);
  });

  it('reads the counter again when an event arrives during an individual mutation', async () => {
    const script = createScriptedAdapter({ subscribe: true });
    const controller = createInboxController({ adapter: script.adapter, clock: clockAt(NOW) });

    controller.start();
    script.lists[0].resolve(page([note('a')]));
    script.counts[0].resolve({ unreadCount: 2 });
    await flush();

    const reading = controller.actions.setRead('a', true);
    script.emitInvalidation();
    script.reads[0].resolve({ notification: { ...note('a'), read: true }, unreadCount: 1 });
    await reading;
    await flush();

    // The mutation's counter may predate the external event, so it is not trusted
    // as the answer for it.
    expect(script.calls.counts.length).toBeGreaterThanOrEqual(2);
    const lastCount = script.counts[script.counts.length - 1];
    expect(script.calls.counts.length).toBe(3);
    lastCount?.resolve({ unreadCount: 2 });
    await flush();

    expect(controller.getSnapshot().state.unreadCount).toBe(2);
  });

  it('contains a subscription failure and retries it on the next refresh', async () => {
    const script = createScriptedAdapter();
    let attempts = 0;
    script.adapter.subscribe = () => {
      attempts += 1;
      if (attempts === 1) throw new Error('The socket is down');
      return () => {};
    };
    const onError = vi.fn();
    const controller = createInboxController({
      adapter: script.adapter,
      clock: clockAt(NOW),
      callbacks: { onError },
    });

    controller.start();
    expect(script.calls.lists).toHaveLength(1);
    expect(script.calls.counts).toHaveLength(1);
    expect(onError).toHaveBeenCalledTimes(1);
    const failure = onError.mock.calls[0]?.[0];
    expect(failure.code).toBe('ADAPTER_FAILURE');
    expect(failure.phase).toBe('load');

    script.lists[0].resolve(page([note('a')]));
    script.counts[0].resolve({ unreadCount: 1 });
    await flush();

    const reload = controller.actions.refresh();
    expect(attempts).toBe(2);
    script.lists[1].resolve(page([note('a')]));
    script.counts[1].resolve({ unreadCount: 1 });
    await reload;

    expect(onError).toHaveBeenCalledTimes(1);
  });

  it('works without an invalidation transport and ignores the flag', async () => {
    const script = createScriptedAdapter();
    const controller = createInboxController({ adapter: script.adapter, clock: clockAt(NOW) });

    controller.start();
    script.lists[0].resolve(page([note('a')]));
    script.counts[0].resolve({ unreadCount: 1 });
    await flush();

    expect(script.calls.subscriptions).toHaveLength(0);
    expect(controller.getSnapshot().state.updatesAvailable).toBe(false);
  });

  it('re-subscribes on a context change and ignores the old callback', async () => {
    const script = createScriptedAdapter({ subscribe: true });
    const controller = createInboxController({
      adapter: script.adapter,
      context: { key: 'user-1' },
      clock: clockAt(NOW),
    });

    controller.start();
    script.lists[0].resolve(page([note('a')]));
    script.counts[0].resolve({ unreadCount: 1 });
    await flush();

    const old = script.subscriptions[0]?.query.onInvalidate as () => void;

    controller.actions.setContext({ key: 'user-2' });
    expect(script.calls.subscriptions).toHaveLength(2);
    expect(script.calls.subscriptions[1]?.context.key).toBe('user-2');
    expect(script.activeSubscriptions()).toBe(1);

    // The released transport reports one more event; it belongs to the old scope.
    old();
    expect(script.calls.counts).toHaveLength(2);

    script.lists[1].resolve(page([note('fresh')]));
    script.counts[1].resolve({ unreadCount: 5 });
    await flush();

    expect(controller.getSnapshot().state.contextKey).toBe('user-2');
    expect(controller.getSnapshot().state.order).toEqual(['fresh']);
  });

  it('re-subscribes when the adapter is replaced and ignores the old callback', async () => {
    const first = createScriptedAdapter({ subscribe: true });
    const second = createScriptedAdapter({ subscribe: true });
    const controller = createInboxController({ adapter: first.adapter, clock: clockAt(NOW) });

    controller.start();
    first.lists[0].resolve(page([note('a')]));
    first.counts[0].resolve({ unreadCount: 1 });
    await flush();

    const old = first.subscriptions[0]?.query.onInvalidate as () => void;

    controller.actions.setAdapter(second.adapter);
    expect(first.activeSubscriptions()).toBe(0);
    expect(second.calls.subscriptions).toHaveLength(1);

    old();
    expect(second.calls.counts).toHaveLength(1);

    second.lists[0].resolve(page([note('b')]));
    second.counts[0].resolve({ unreadCount: 2 });
    await flush();

    const snapshot = controller.getSnapshot();
    expect(snapshot.state.order).toEqual(['b']);
    expect(snapshot.state.unreadCount).toBe(2);
  });

  it('applies an event that arrives during the bulk operation with its refresh', async () => {
    const script = createScriptedAdapter({ subscribe: true });
    const controller = createInboxController({ adapter: script.adapter, clock: clockAt(NOW) });

    controller.start();
    script.lists[0].resolve(page([note('a'), note('b')]));
    script.counts[0].resolve({ unreadCount: 2 });
    await flush();

    const marking = controller.actions.markAllRead();
    // Another client creates an event while the server-side operation runs.
    script.emitInvalidation();
    expect(controller.getSnapshot().state.updatesAvailable).toBe(true);

    script.marks[0].resolve({ boundary: '2026-10-18T13:00:00Z', unreadCount: 1 });
    await flush();

    // The confirmed answer refreshes the first page, which was requested after
    // the invalidation, so it shows the new event and clears the flag.
    script.lists[1].resolve(
      page([note('c'), note('a', { read: true }), note('b', { read: true })]),
    );
    script.counts[2].resolve({ unreadCount: 1 });
    await marking;

    const snapshot = controller.getSnapshot();
    expect(script.calls.counts).toHaveLength(3);
    expect(snapshot.state.order).toEqual(['c', 'a', 'b']);
    expect(snapshot.state.unreadCount).toBe(1);
    expect(snapshot.state.updatesAvailable).toBe(false);
  });

  it('keeps the readable list in place and applies new events from the mock', async () => {
    const adapter = createMockAdapter({
      clock: clockAt(NOW),
      contexts: [
        {
          context: DEFAULT_INBOX_CONTEXT,
          notifications: [note('a', { createdAt: '2026-10-18T12:00:00Z', read: true })],
        },
      ],
    });
    const controller = createInboxController({ adapter, clock: clockAt(NOW) });

    controller.start();
    await flush();
    expect(controller.getSnapshot().state.order).toEqual(['a']);

    adapter.addNotification(
      DEFAULT_INBOX_CONTEXT,
      note('b', { createdAt: '2026-10-18T12:59:00Z' }),
    );
    adapter.invalidate(DEFAULT_INBOX_CONTEXT);
    await flush();

    // The counter follows the external change; the readable list does not move.
    let snapshot = controller.getSnapshot();
    expect(snapshot.state.unreadCount).toBe(1);
    expect(snapshot.state.order).toEqual(['a']);
    expect(snapshot.state.updatesAvailable).toBe(true);

    await controller.actions.showUpdates();

    snapshot = controller.getSnapshot();
    expect(snapshot.state.order).toEqual(['b', 'a']);
    expect(snapshot.state.updatesAvailable).toBe(false);
  });
});

describe('configuration and time', () => {
  it('resolves the initial configuration and ignores an equal replacement', () => {
    const script = createScriptedAdapter();
    const controller = createInboxController({
      adapter: script.adapter,
      clock: clockAt(NOW),
      config: { locale: 'ru', timeZone: 'Europe/Moscow' },
    });

    const first = controller.getSnapshot();
    expect(first.view.settings).toEqual({
      locale: 'ru',
      timeZone: 'Europe/Moscow',
      filter: 'all',
      contextKey: 'default',
    });
    expect(first.view.list.label).toBe('Уведомления');

    controller.updateConfig({ locale: 'ru', timeZone: 'Europe/Moscow' });
    expect(controller.getSnapshot()).toBe(first);
  });

  it('updates the presentation without touching the loaded data', async () => {
    const script = createScriptedAdapter();
    const controller = createInboxController({ adapter: script.adapter, clock: clockAt(NOW) });

    controller.start();
    script.lists[0].resolve(page([note('a')]));
    script.counts[0].resolve({ unreadCount: 1 });
    await flush();

    const before = controller.getSnapshot();
    controller.updateConfig({
      locale: 'en-GB',
      timeZone: 'UTC',
      messages: { listLabel: 'Alerts' },
    });
    const after = controller.getSnapshot();

    expect(after).not.toBe(before);
    expect(after.revision).toBeGreaterThan(before.revision);
    expect(after.state).toBe(before.state);
    expect(after.state.order).toEqual(['a']);
    expect(after.view.settings.locale).toBe('en-GB');
    expect(after.view.list.label).toBe('Alerts');
  });

  it('changes which calendar day a row belongs to when the zone changes', async () => {
    const script = createScriptedAdapter();
    const clock = clockAt(Date.parse('2026-10-18T22:00:00Z'));
    const controller = createInboxController({
      adapter: script.adapter,
      clock,
      config: { locale: 'en-GB', timeZone: 'UTC' },
    });

    controller.start();
    script.lists[0].resolve(page([note('a', { createdAt: '2026-10-18T20:00:00Z' })]));
    script.counts[0].resolve({ unreadCount: 1 });
    await flush();

    expect(controller.getSnapshot().view.list.groups[0]?.label).toBe('Today');

    controller.updateConfig({ locale: 'en-GB', timeZone: 'Europe/Moscow' });
    expect(controller.getSnapshot().view.list.groups[0]?.label).toBe('Yesterday');
  });

  it('derives labels from the injected clock and announces a new minute', async () => {
    const script = createScriptedAdapter();
    const clock = clockAt(NOW);
    const controller = createInboxController({ adapter: script.adapter, clock });

    controller.start();
    script.lists[0].resolve(page([note('a', { createdAt: '2026-10-18T12:55:00Z' })]));
    script.counts[0].resolve({ unreadCount: 1 });
    await flush();

    const first = controller.getSnapshot();
    expect(first.view.list.items[0]?.timeLabel).toBe('5 minutes ago');

    const listener = vi.fn();
    controller.subscribe(listener);

    clock.set(NOW + 60_000);
    controller.refreshTime();
    expect(listener).toHaveBeenCalledTimes(1);

    const second = controller.getSnapshot();
    expect(second).not.toBe(first);
    expect(second.view.list.items[0]?.timeLabel).toBe('6 minutes ago');

    clock.set(NOW + 61_000);
    controller.refreshTime();
    expect(listener).toHaveBeenCalledTimes(1);
    expect(controller.getSnapshot()).toBe(second);
  });
});
