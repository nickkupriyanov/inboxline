/**
 * The derived view model.
 *
 * Every scenario builds the state the way the controller will — through the
 * reducer — and then checks what a binding would render: the groups and rows,
 * the labels, the counter, the states and the action availability. The derivation
 * is pure, so the only other input is a fixed time anchor.
 */
import { describe, expect, it } from 'vitest';
import { resolveInboxConfig } from './config';
import { createInboxViewMemo, deriveInboxView, inboxViewKey } from './derive';
import type { InboxView } from './derive';
import { InboxError } from './errors';
import { createInboxState, inboxReducer } from './reducer';
import type { InboxState } from './reducer';
import { createInboxTimeAnchor } from './time';
import type { InboxFilter, InboxNotification } from './types';

const NOW = Date.parse('2026-10-18T12:00:00Z');
const ANCHOR = createInboxTimeAnchor(NOW, 'UTC');
const CONFIG = resolveInboxConfig({ locale: 'en-GB', timeZone: 'UTC' });
const RU = resolveInboxConfig({ locale: 'ru', timeZone: 'UTC' });

const FAILURE = new InboxError({ code: 'ADAPTER_FAILURE', message: 'The request failed' });

function note<TData = unknown>(
  id: string,
  overrides: Partial<Omit<InboxNotification<TData>, 'id'>> = {},
): InboxNotification<TData> {
  return {
    id,
    createdAt: '2026-10-18T09:00:00Z',
    title: `Notification ${id}`,
    read: false,
    ...overrides,
  };
}

function loaded<TData = unknown>(
  items: InboxNotification<TData>[],
  options: { nextCursor?: string | null; filter?: InboxFilter } = {},
): InboxState<TData> {
  const empty = createInboxState<TData>({ filter: options.filter ?? 'all' });
  const loading = inboxReducer(empty, { type: 'listLoading', token: 1 });
  return inboxReducer(loading, {
    type: 'listLoaded',
    token: 1,
    page: { items, nextCursor: options.nextCursor ?? null },
  });
}

function counted<TData>(
  state: InboxState<TData>,
  unreadCount: number,
  token = 1,
): InboxState<TData> {
  return inboxReducer(inboxReducer(state, { type: 'countLoading', token }), {
    type: 'countLoaded',
    token,
    unreadCount,
  });
}

function pendingRead<TData>(
  state: InboxState<TData>,
  id: string,
  read: boolean,
  token = 2,
): InboxState<TData> {
  return inboxReducer(state, {
    type: 'readPending',
    token,
    id,
    read,
    previousRead: state.byId[id]?.read ?? false,
  });
}

describe('settings, rows and groups', () => {
  const state = loaded([
    note('a', {
      title: 'Order shipped',
      author: { name: 'Ada Lovelace' },
      body: 'It is on the way',
      icon: 'https://example.test/box.png',
      createdAt: '2026-10-18T11:00:00Z',
      data: { orderId: '42' },
    }),
    note('b', { title: 'Payment received', createdAt: '2026-10-18T09:00:00Z', read: true }),
    note('c', { title: 'Weekly digest', createdAt: '2026-10-17T20:00:00Z' }),
  ]);

  it('exposes the configuration and the filter alongside the rows', () => {
    const view = deriveInboxView(state, CONFIG, ANCHOR);
    expect(view.settings).toEqual({
      locale: 'en-GB',
      timeZone: 'UTC',
      filter: 'all',
      contextKey: 'default',
    });
  });

  it('keeps the server order and groups consecutive rows by day', () => {
    const view = deriveInboxView(state, CONFIG, ANCHOR);
    expect(view.list.items.map((item) => item.id)).toEqual(['a', 'b', 'c']);
    expect(view.list.groups.map((group) => group.key)).toEqual(['2026-10-18', '2026-10-17']);
    expect(view.list.groups.map((group) => group.label)).toEqual(['Today', 'Yesterday']);
    expect(view.list.groups[0]?.items.map((item) => item.id)).toEqual(['a', 'b']);
    expect(view.list.groups[1]?.items.map((item) => item.id)).toEqual(['c']);
    expect(view.list.count).toBe(3);
  });

  it('formats time relatively inside today and as a date outside it', () => {
    const view = deriveInboxView(state, CONFIG, ANCHOR);
    expect(view.list.items.map((item) => item.timeLabel)).toEqual([
      '1 hour ago',
      '3 hours ago',
      '17 Oct',
    ]);
  });

  it('describes a row for a screen reader, with the unread state as a word', () => {
    const view = deriveInboxView(state, CONFIG, ANCHOR);
    expect(view.list.items[0]?.label).toBe('Order shipped. Ada Lovelace. 1 hour ago. Unread');
    expect(view.list.items[1]?.label).toBe('Payment received. 3 hours ago');
  });

  it('passes optional fields and application data through untouched', () => {
    const view = deriveInboxView(state, CONFIG, ANCHOR);
    const [first, second] = view.list.items;
    expect(first?.body).toBe('It is on the way');
    expect(first?.author).toEqual({ name: 'Ada Lovelace' });
    expect(first?.icon).toBe('https://example.test/box.png');
    expect(first?.data).toEqual({ orderId: '42' });
    expect(second?.body).toBeNull();
    expect(second?.author).toBeNull();
    expect(second?.icon).toBeNull();
    expect(second !== undefined && 'data' in second).toBe(false);
  });

  it('renders an id that collides with a prototype key as an ordinary row', () => {
    const view = deriveInboxView(loaded([note('__proto__'), note('constructor')]), CONFIG, ANCHOR);
    expect(view.list.items.map((item) => item.id)).toEqual(['__proto__', 'constructor']);
    expect(view.list.items[0]?.pending).toBe(false);
    expect(view.list.items[0]?.unknown).toBe(false);
  });
});

describe('the global counter', () => {
  it('is independent of the loaded page', () => {
    const state = counted(loaded([note('a'), note('b')]), 27);
    const view = deriveInboxView(state, CONFIG, ANCHOR);
    expect(view.list.count).toBe(2);
    expect(view.counter.unreadCount).toBe(27);
    expect(view.counter.known).toBe(true);
    expect(view.counter.label).toBe('27 unread notifications');
    expect(view.live.message).toBe('27 unread notifications');
  });

  it('selects the English plural form for 0, 1, 2, 5 and 21', () => {
    const label = (count: number) =>
      deriveInboxView(counted(loaded([]), count), CONFIG, ANCHOR).counter.label;
    expect(label(0)).toBe('0 unread notifications');
    expect(label(1)).toBe('1 unread notification');
    expect(label(2)).toBe('2 unread notifications');
    expect(label(5)).toBe('5 unread notifications');
    expect(label(21)).toBe('21 unread notifications');
  });

  it('selects the Russian plural form for 0, 1, 2, 5 and 21', () => {
    const label = (count: number) =>
      deriveInboxView(counted(loaded([]), count), RU, ANCHOR).counter.label;
    expect(label(0)).toBe('0 непрочитанных');
    expect(label(1)).toBe('1 непрочитанное');
    expect(label(2)).toBe('2 непрочитанных');
    expect(label(5)).toBe('5 непрочитанных');
    expect(label(21)).toBe('21 непрочитанное');
  });

  it('stays honestly unknown until the server reports a number', () => {
    const view = deriveInboxView(loaded([note('a')]), CONFIG, ANCHOR);
    expect(view.counter.unreadCount).toBeNull();
    expect(view.counter.known).toBe(false);
    expect(view.counter.label).toBeNull();
    expect(view.live.message).toBe('Unread count unknown');
    expect(view.actions.canMarkAllRead).toBe(false);
  });

  it('keeps the previous value when the counter fails', () => {
    const loading = inboxReducer(counted(loaded([]), 7), { type: 'countLoading', token: 2 });
    const failed = inboxReducer(loading, {
      type: 'countFailed',
      token: 2,
      error: FAILURE,
    });
    const view = deriveInboxView(failed, CONFIG, ANCHOR);
    expect(view.counter.unreadCount).toBe(7);
    expect(view.counter.error).toBe('The unread count could not be loaded');
  });
});

describe('list and page states', () => {
  it('reports a first load that has not run yet as idle, not empty', () => {
    const view = deriveInboxView(createInboxState(), CONFIG, ANCHOR);
    expect(view.list.status).toBe('idle');
    expect(view.list.loading).toBe(false);
    expect(view.list.empty).toBe(false);
    expect(view.list.count).toBe(0);
  });

  it('reports a running first load', () => {
    const state = inboxReducer(createInboxState(), { type: 'listLoading', token: 1 });
    const view = deriveInboxView(state, CONFIG, ANCHOR);
    expect(view.list.loading).toBe(true);
    expect(view.actions.canRefresh).toBe(false);
  });

  it('keeps the rows and offers a retry when a refresh fails', () => {
    const state = inboxReducer(loaded([note('a')]), { type: 'listLoading', token: 2 });
    const failed = inboxReducer(state, { type: 'listFailed', token: 2, error: FAILURE });
    const view = deriveInboxView(failed, CONFIG, ANCHOR);
    expect(view.list.items).toHaveLength(1);
    expect(view.list.error).toBe('The notifications could not be loaded');
    expect(view.actions.canRetryList).toBe(true);
    expect(view.actions.canRefresh).toBe(true);
  });

  it('is empty only once the list has loaded and holds nothing', () => {
    const view = deriveInboxView(loaded([]), CONFIG, ANCHOR);
    expect(view.list.empty).toBe(true);
    expect(view.list.emptyLabel).toBe('No notifications yet');
  });

  it('uses the unread copy for an empty unread list', () => {
    const view = deriveInboxView(loaded([], { filter: 'unread' }), CONFIG, ANCHOR);
    expect(view.list.empty).toBe(true);
    expect(view.list.emptyLabel).toBe('No unread notifications');
  });

  it('offers the next page only while there is one and nothing is loading', () => {
    const state = loaded([note('a')], { nextCursor: 'c1' });
    const view = deriveInboxView(state, CONFIG, ANCHOR);
    expect(view.page.hasMore).toBe(true);
    expect(view.page.canLoadMore).toBe(true);
    expect(view.actions.canLoadMore).toBe(true);
    expect(view.page.label).toBe('Show more');

    const loading = inboxReducer(state, { type: 'pageLoading', token: 2 });
    expect(deriveInboxView(loading, CONFIG, ANCHOR).page.canLoadMore).toBe(false);
  });

  it('keeps the rows and offers a retry when the next page fails', () => {
    const state = loaded([note('a')], { nextCursor: 'c1' });
    const loading = inboxReducer(state, { type: 'pageLoading', token: 2 });
    const failed = inboxReducer(loading, { type: 'pageFailed', token: 2, error: FAILURE });
    const view = deriveInboxView(failed, CONFIG, ANCHOR);
    expect(view.list.items).toHaveLength(1);
    expect(view.page.error).toBe('The next notifications could not be loaded');
    expect(view.page.canLoadMore).toBe(true);
    expect(view.actions.canRetryPage).toBe(true);
    expect(view.page.retryLabel).toBe('Try again');
  });

  it('reports the end of the list', () => {
    const view = deriveInboxView(loaded([note('a')], { nextCursor: null }), CONFIG, ANCHOR);
    expect(view.page.hasMore).toBe(false);
    expect(view.page.canLoadMore).toBe(false);
    expect(view.actions.canLoadMore).toBe(false);
  });
});

describe('the optimistic layer in the view', () => {
  it('shows the desired state while the operation is queued', () => {
    const state = pendingRead(loaded([note('a')]), 'a', true);
    const view = deriveInboxView(state, CONFIG, ANCHOR);
    const item = view.list.items[0];
    expect(item?.read).toBe(true);
    expect(item?.unread).toBe(false);
    expect(item?.pending).toBe(true);
    expect(item?.unknown).toBe(false);
    expect(item?.label).toBe('Notification a. 3 hours ago');
  });

  it('shows a rollback when the operation is confirmed as rejected', () => {
    const pending = pendingRead(loaded([note('a')]), 'a', true);
    const rolledBack = inboxReducer(pending, { type: 'readFailed', token: 2, id: 'a' });
    const item = deriveInboxView(rolledBack, CONFIG, ANCHOR).list.items[0];
    expect(item?.read).toBe(false);
    expect(item?.unread).toBe(true);
    expect(item?.pending).toBe(false);
  });

  it('projects queued operations onto the displayed counter', () => {
    const base = counted(loaded([note('a'), note('b'), note('c')]), 3);
    const first = pendingRead(base, 'a', true);
    const second = pendingRead(first, 'b', true);

    expect(deriveInboxView(first, CONFIG, ANCHOR).counter.unreadCount).toBe(2);
    expect(deriveInboxView(second, CONFIG, ANCHOR).counter.unreadCount).toBe(1);
    // The confirmed number in the state is untouched by the projection.
    expect(second.unreadCount).toBe(3);
  });

  it('never projects a lost answer, which the reconciliation resolves', () => {
    const base = counted(loaded([note('a')]), 1);
    const pending = pendingRead(base, 'a', true);
    const unknown = inboxReducer(pending, { type: 'readUnknown', token: 2, id: 'a' });

    const view = deriveInboxView(unknown, CONFIG, ANCHOR);
    expect(view.list.items[0]?.unknown).toBe(true);
    expect(view.counter.unreadCount).toBe(1);
  });

  it('turns an unread request into a live selection', () => {
    const base = counted(loaded([note('a'), note('b')], { filter: 'unread' }), 2);
    const pending = pendingRead(base, 'a', true);
    const view = deriveInboxView(pending, CONFIG, ANCHOR);

    expect(view.list.items.map((item) => item.id)).toEqual(['b']);
    expect(view.list.count).toBe(1);
    expect(view.counter.unreadCount).toBe(1);

    const rolledBack = inboxReducer(pending, { type: 'readFailed', token: 2, id: 'a' });
    expect(deriveInboxView(rolledBack, CONFIG, ANCHOR).list.items.map((item) => item.id)).toEqual([
      'a',
      'b',
    ]);
  });

  it('marks an operation whose answer was lost as unknown', () => {
    const pending = pendingRead(loaded([note('a')]), 'a', true);
    const unknown = inboxReducer(pending, { type: 'readUnknown', token: 2, id: 'a' });
    const item = deriveInboxView(unknown, CONFIG, ANCHOR).list.items[0];
    expect(item?.read).toBe(true);
    expect(item?.pending).toBe(false);
    expect(item?.unknown).toBe(true);
    expect(deriveInboxView(unknown, CONFIG, ANCHOR).actions.busy).toBe(true);
  });

  it('shows every known row as read and projects the counter to zero while the bulk runs', () => {
    const base = counted(loaded([note('a'), note('b', { read: true }), note('c')]), 27);
    const bulk = inboxReducer(base, { type: 'bulkPending', token: 2 });
    const view = deriveInboxView(bulk, CONFIG, ANCHOR);

    expect(view.list.items.every((item) => item.read)).toBe(true);
    expect(view.counter.unreadCount).toBe(0);
    expect(view.counter.known).toBe(true);
    // The confirmed number in the state is untouched by the projection.
    expect(bulk.unreadCount).toBe(27);
    expect(view.actions.busy).toBe(true);
    expect(view.actions.canMarkAllRead).toBe(false);
  });

  it('keeps a lost bulk answer out of the counter projection', () => {
    const base = counted(loaded([note('a'), note('b')]), 2);
    const pending = inboxReducer(base, { type: 'bulkPending', token: 2 });
    expect(deriveInboxView(pending, CONFIG, ANCHOR).counter.unreadCount).toBe(0);

    const unknown = inboxReducer(pending, { type: 'bulkUnknown', token: 2 });
    const view = deriveInboxView(unknown, CONFIG, ANCHOR);
    expect(view.counter.unreadCount).toBe(2);
    expect(view.list.items.every((item) => item.read)).toBe(true);
    expect(view.actions.busy).toBe(true);
  });

  it('empties the unread selection while the bulk operation runs', () => {
    const base = counted(loaded([note('a'), note('b')], { filter: 'unread' }), 2);
    const bulk = inboxReducer(base, { type: 'bulkPending', token: 2 });
    const view = deriveInboxView(bulk, CONFIG, ANCHOR);

    expect(view.list.items).toEqual([]);
    expect(view.list.empty).toBe(true);
    expect(view.list.emptyLabel).toBe('No unread notifications');

    const refused = inboxReducer(bulk, { type: 'bulkFailed', token: 2 });
    expect(deriveInboxView(refused, CONFIG, ANCHOR).list.items.map((item) => item.id)).toEqual([
      'a',
      'b',
    ]);
  });
});

describe('action availability', () => {
  it('allows “mark all read” only with a known non-zero counter and an idle queue', () => {
    const ready = counted(loaded([]), 3);
    expect(deriveInboxView(ready, CONFIG, ANCHOR).actions.canMarkAllRead).toBe(true);

    expect(deriveInboxView(counted(loaded([]), 0), CONFIG, ANCHOR).actions.canMarkAllRead).toBe(
      false,
    );

    const queued = pendingRead(ready, 'a', true);
    const queuedView = deriveInboxView(queued, CONFIG, ANCHOR);
    expect(queuedView.actions.canMarkAllRead).toBe(false);
    expect(queuedView.actions.busy).toBe(true);
  });

  it('blocks “mark all read” while a bulk operation runs', () => {
    const state = counted(loaded([]), 3);
    const bulk: InboxState = {
      ...state,
      pending: { ...state.pending, bulk: { token: 1, status: 'pending' } },
    };
    const view = deriveInboxView(bulk, CONFIG, ANCHOR);
    expect(view.actions.canMarkAllRead).toBe(false);
    expect(view.actions.busy).toBe(true);
  });
});

describe('memoisation', () => {
  it('returns the same view object for the same key', () => {
    const memo = createInboxViewMemo();
    const state = loaded([note('a')]);
    const key = inboxViewKey(1, 0, ANCHOR);
    const first = memo.get(key, state, CONFIG, ANCHOR);
    const second = memo.get(key, state, CONFIG, ANCHOR);
    expect(second).toBe(first);
  });

  it('recomputes when a revision changes, and the result is equal', () => {
    const memo = createInboxViewMemo();
    const state = loaded([note('a')]);
    const first = memo.get(inboxViewKey(1, 0, ANCHOR), state, CONFIG, ANCHOR);
    const second = memo.get(inboxViewKey(2, 0, ANCHOR), state, CONFIG, ANCHOR);
    expect(second).not.toBe(first);
    expect(second).toEqual(first);
  });

  it('keeps the key stable inside a minute and changes it with the day', () => {
    const sameBucket = createInboxTimeAnchor(NOW + 30_000, 'UTC');
    const nextBucket = createInboxTimeAnchor(NOW + 60_000, 'UTC');
    const nextDay = createInboxTimeAnchor(NOW + 86_400_000, 'UTC');

    expect(inboxViewKey(1, 0, sameBucket)).toBe(inboxViewKey(1, 0, ANCHOR));
    expect(inboxViewKey(1, 0, nextBucket)).not.toBe(inboxViewKey(1, 0, ANCHOR));
    expect(inboxViewKey(1, 0, nextDay)).not.toBe(inboxViewKey(1, 0, ANCHOR));
  });
});

describe('the view type', () => {
  interface OrderData {
    orderId: string;
  }

  it('flows the application data type through rows and groups', () => {
    const state = loaded<OrderData>([note<OrderData>('a', { data: { orderId: 'x' } })]);
    const view: InboxView<OrderData> = deriveInboxView(state, CONFIG, ANCHOR);
    expect(view.list.items[0]?.data?.orderId).toBe('x');
    expect(view.list.groups[0]?.items[0]?.data?.orderId).toBe('x');
  });
});
