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
  InboxMarkAllReadResult,
  InboxReadStatusResult,
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
}

/**
 * An adapter whose loads never settle until the test says so.
 *
 * The request signal is honoured only by the controller's identity check: the
 * scripted promises stay pending after an abort on purpose, which is the harder
 * case — a real adapter may resolve late even when it was cancelled.
 */
function createScriptedAdapter(): {
  adapter: InboxAdapter;
  calls: AdapterCalls;
  lists: Array<ReturnType<typeof deferred<InboxPage>>>;
  counts: Array<ReturnType<typeof deferred<InboxUnreadCount>>>;
} {
  const calls: AdapterCalls = { lists: [], counts: [] };
  const lists: Array<ReturnType<typeof deferred<InboxPage>>> = [];
  const counts: Array<ReturnType<typeof deferred<InboxUnreadCount>>> = [];

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
    setReadStatus(): Promise<InboxReadStatusResult<unknown>> {
      return Promise.reject(new Error('setReadStatus is not part of this scenario'));
    },
    markAllRead(): Promise<InboxMarkAllReadResult> {
      return Promise.reject(new Error('markAllRead is not part of this scenario'));
    },
  };

  return { adapter, calls, lists, counts };
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
