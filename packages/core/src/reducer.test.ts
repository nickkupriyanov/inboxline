/**
 * The transition table of the reducer.
 *
 * Every check drives the state the way the controller will and asserts what a
 * binding can then observe: the rows and their server order, the cursor, the
 * statuses, the counter and the optimistic layer. The reducer is pure, so a
 * whole scenario is a sequence of calls and nothing else.
 */
import { describe, expect, expectTypeOf, it } from 'vitest';
import { InboxError } from './errors';
import { createInboxState, inboxReducer } from './reducer';
import type { InboxAction, InboxPendingRead, InboxState } from './reducer';
import type { InboxNotification, InboxPage } from './types';

function note(
  id: string,
  overrides: Partial<Omit<InboxNotification, 'id'>> = {},
): InboxNotification {
  return {
    id,
    createdAt: '2026-10-18T09:00:00Z',
    title: `Notification ${id}`,
    read: false,
    ...overrides,
  };
}

function pageOf(items: InboxNotification[], nextCursor: string | null): InboxPage {
  return { items, nextCursor };
}

function failure(message = 'The request failed'): InboxError {
  return new InboxError({ code: 'ADAPTER_FAILURE', message });
}

/** A state with a first page of `a`, `b`, `c` already loaded. */
function loadedState(): InboxState {
  const empty = createInboxState();
  const loading = inboxReducer(empty, { type: 'listLoading', token: 1 });
  return inboxReducer(loading, {
    type: 'listLoaded',
    token: 1,
    page: pageOf([note('a'), note('b'), note('c')], 'cursor-1'),
  });
}

function ids(state: InboxState): readonly string[] {
  return state.order;
}

/** The state after the server reported `unreadCount`, the way the controller does it. */
function counted(state: InboxState, unreadCount: number, token = 1): InboxState {
  return inboxReducer(inboxReducer(state, { type: 'countLoading', token }), {
    type: 'countLoaded',
    token,
    unreadCount,
  });
}

describe('createInboxState', () => {
  it('starts empty, on the implicit context and the full list', () => {
    const state = createInboxState();

    expect(state.contextKey).toBe('default');
    expect(state.filter).toBe('all');
    expect(state.byId).toEqual({});
    expect(state.order).toEqual([]);
    expect(state.nextCursor).toBeNull();
    expect(state.listStatus).toBe('idle');
    expect(state.pageStatus).toBe('idle');
    expect(state.pending).toEqual({ reads: {}, readOrder: [], bulk: null });
    expect(state.updatesAvailable).toBe(false);
    expect(state.listToken).toBe(0);
    expect(state.pageToken).toBe(0);
    expect(state.countToken).toBe(0);
  });

  it('does not pretend to know the counter', () => {
    const state = createInboxState();

    expect(state.unreadCount).toBeNull();
    expect(state.countStatus).toBe('idle');
  });

  it('accepts a context and a filter', () => {
    const state = createInboxState({ contextKey: 'user-2', filter: 'unread' });

    expect(state.contextKey).toBe('user-2');
    expect(state.filter).toBe('unread');
  });
});

describe('external updates', () => {
  it('raises the flag once and keeps the loaded rows', () => {
    const loaded = loadedState();
    const once = inboxReducer(loaded, { type: 'externalUpdate' });

    expect(once.updatesAvailable).toBe(true);
    expect(ids(once)).toEqual(['a', 'b', 'c']);
    expect(once.listStatus).toBe('ready');
    // A burst does not create a second snapshot.
    expect(inboxReducer(once, { type: 'externalUpdate' })).toBe(once);
  });

  it('clears the flag with a first page that was requested after the change', () => {
    const shown = inboxReducer(loadedState(), { type: 'externalUpdate' });
    const loading = inboxReducer(shown, { type: 'listLoading', token: 2 });
    const next = inboxReducer(loading, {
      type: 'listLoaded',
      token: 2,
      page: pageOf([note('z')], null),
      updatesAvailable: false,
    });

    expect(next.updatesAvailable).toBe(false);
    expect(ids(next)).toEqual(['z']);
  });

  it('keeps the flag when the page was requested before the change', () => {
    const loading = inboxReducer(loadedState(), { type: 'listLoading', token: 2 });
    const next = inboxReducer(loading, {
      type: 'listLoaded',
      token: 2,
      page: pageOf([note('z')], null),
      updatesAvailable: true,
    });

    expect(next.updatesAvailable).toBe(true);
  });

  it('keeps the flag when an action does not state it', () => {
    const shown = inboxReducer(loadedState(), { type: 'externalUpdate' });
    const loading = inboxReducer(shown, { type: 'listLoading', token: 2 });
    const next = inboxReducer(loading, {
      type: 'listLoaded',
      token: 2,
      page: pageOf([note('z')], null),
    });

    expect(next.updatesAvailable).toBe(true);
  });

  it('resets the flag together with the context', () => {
    const shown = inboxReducer(loadedState(), { type: 'externalUpdate' });
    const next = inboxReducer(shown, { type: 'contextChanged', contextKey: 'user-2' });

    expect(next.updatesAvailable).toBe(false);
  });
});

describe('loading the first page', () => {
  it('marks the load as running and keeps the rows it is refreshing', () => {
    const loaded = loadedState();
    const next = inboxReducer(loaded, { type: 'listLoading', token: 2 });

    expect(next.listStatus).toBe('loading');
    expect(next.listError).toBeNull();
    expect(next.listToken).toBe(2);
    expect(ids(next)).toEqual(['a', 'b', 'c']);
  });

  it('replaces the chain with the server order of the first page', () => {
    const state = inboxReducer(loadedState(), {
      type: 'listLoading',
      token: 2,
    });
    const next = inboxReducer(state, {
      type: 'listLoaded',
      token: 2,
      page: pageOf([note('z'), note('y')], 'cursor-2'),
    });

    expect(ids(next)).toEqual(['z', 'y']);
    expect(next.nextCursor).toBe('cursor-2');
    expect(next.listStatus).toBe('ready');
    expect(next.listError).toBeNull();
    expect(next.pageStatus).toBe('idle');
    expect(next.pageError).toBeNull();
  });

  it('keeps the server order instead of sorting', () => {
    const older = note('older', { createdAt: '2026-10-17T09:00:00Z' });
    const newer = note('newer', { createdAt: '2026-10-18T09:00:00Z' });
    const state = inboxReducer(createInboxState(), { type: 'listLoading', token: 1 });
    const next = inboxReducer(state, {
      type: 'listLoaded',
      token: 1,
      // Deliberately not newest first: the core never re-orders a page.
      page: pageOf([older, newer], null),
    });

    expect(ids(next)).toEqual(['older', 'newer']);
  });

  it('drops an id that a page repeats', () => {
    const state = inboxReducer(createInboxState(), { type: 'listLoading', token: 1 });
    const next = inboxReducer(state, {
      type: 'listLoaded',
      token: 1,
      page: pageOf([note('a'), note('b'), note('a')], null),
    });

    expect(ids(next)).toEqual(['a', 'b']);
  });

  it('keeps the rows it already had when the refresh fails', () => {
    const loaded = loadedState();
    const state = inboxReducer(loaded, { type: 'listLoading', token: 2 });
    const next = inboxReducer(state, { type: 'listFailed', token: 2, error: failure() });

    expect(ids(next)).toEqual(['a', 'b', 'c']);
    expect(next.listStatus).toBe('error');
    expect(next.listError?.code).toBe('ADAPTER_FAILURE');
  });

  it('ignores an answer to a superseded request', () => {
    const loading = inboxReducer(createInboxState(), { type: 'listLoading', token: 1 });
    const superseded = inboxReducer(loading, { type: 'listLoading', token: 2 });
    const next = inboxReducer(superseded, {
      type: 'listLoaded',
      token: 1,
      page: pageOf([note('a')], null),
    });

    expect(next).toBe(superseded);
  });

  it('ignores a failure that belongs to a superseded request', () => {
    const loading = inboxReducer(createInboxState(), { type: 'listLoading', token: 1 });
    const superseded = inboxReducer(loading, { type: 'listLoading', token: 2 });
    const next = inboxReducer(superseded, { type: 'listFailed', token: 1, error: failure() });

    expect(next).toBe(superseded);
  });
});

describe('appending a page', () => {
  function withPage(): InboxState {
    const state = inboxReducer(loadedState(), { type: 'pageLoading', token: 1 });
    return inboxReducer(state, {
      type: 'pageLoaded',
      token: 1,
      page: pageOf([note('d'), note('e')], 'cursor-2'),
    });
  }

  it('appends after the rows that are already there', () => {
    const next = withPage();

    expect(ids(next)).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(next.nextCursor).toBe('cursor-2');
    expect(next.pageStatus).toBe('idle');
    expect(next.pageError).toBeNull();
    expect(next.listStatus).toBe('ready');
  });

  it('keeps the place and the data of an id the previous page already had', () => {
    const state = inboxReducer(loadedState(), { type: 'pageLoading', token: 1 });
    const returnedAgain = note('b', { read: true, title: 'A stale copy of b' });
    const next = inboxReducer(state, {
      type: 'pageLoaded',
      token: 1,
      page: pageOf([returnedAgain, note('d')], 'cursor-2'),
    });

    expect(ids(next)).toEqual(['a', 'b', 'c', 'd']);
    expect(next.byId.b.read).toBe(false);
    expect(next.byId.b.title).toBe('Notification b');
  });

  it('does not loop on a cursor that did not advance', () => {
    const state = inboxReducer(loadedState(), { type: 'pageLoading', token: 1 });
    const next = inboxReducer(state, {
      type: 'pageLoaded',
      token: 1,
      page: pageOf([note('d')], 'cursor-1'),
    });

    expect(ids(next)).toEqual(['a', 'b', 'c', 'd']);
    expect(next.nextCursor).toBeNull();
  });

  it('keeps the rows and the cursor when the page fails, so it can be retried', () => {
    const state = inboxReducer(loadedState(), { type: 'pageLoading', token: 1 });
    const failed = inboxReducer(state, { type: 'pageFailed', token: 1, error: failure() });

    expect(ids(failed)).toEqual(['a', 'b', 'c']);
    expect(failed.nextCursor).toBe('cursor-1');
    expect(failed.pageStatus).toBe('error');
    expect(failed.pageError?.message).toBe('The request failed');

    const retry = inboxReducer(failed, { type: 'pageLoading', token: 2 });
    const loaded = inboxReducer(retry, {
      type: 'pageLoaded',
      token: 2,
      page: pageOf([note('d')], 'cursor-2'),
    });

    expect(ids(loaded)).toEqual(['a', 'b', 'c', 'd']);
    expect(loaded.pageStatus).toBe('idle');
  });

  it('ignores a page that belongs to a superseded request', () => {
    const state = inboxReducer(loadedState(), { type: 'pageLoading', token: 1 });
    const superseded = inboxReducer(state, { type: 'pageLoading', token: 2 });
    const next = inboxReducer(superseded, {
      type: 'pageLoaded',
      token: 1,
      page: pageOf([note('d')], 'cursor-2'),
    });

    expect(next).toBe(superseded);
  });

  it('lets a refresh replace the whole chain', () => {
    const state = inboxReducer(withPage(), { type: 'listLoading', token: 2 });
    const next = inboxReducer(state, {
      type: 'listLoaded',
      token: 2,
      page: pageOf([note('fresh')], null),
    });

    expect(ids(next)).toEqual(['fresh']);
    expect(next.nextCursor).toBeNull();
  });
});

describe('the unread counter', () => {
  it('is server data, not the number of loaded rows', () => {
    const ten = Array.from({ length: 10 }, (_, index) => note(`n-${index}`));
    const state = inboxReducer(createInboxState(), { type: 'listLoading', token: 1 });
    const loaded = inboxReducer(state, {
      type: 'listLoaded',
      token: 1,
      page: pageOf(ten, null),
    });
    const counted = inboxReducer(inboxReducer(loaded, { type: 'countLoading', token: 1 }), {
      type: 'countLoaded',
      token: 1,
      unreadCount: 27,
    });

    expect(ids(counted)).toHaveLength(10);
    expect(counted.unreadCount).toBe(27);
    expect(counted.countStatus).toBe('ready');
  });

  it('keeps the previous value when a counter load fails', () => {
    const known = counted(createInboxState(), 3);
    const state = inboxReducer(known, { type: 'countLoading', token: 2 });
    const next = inboxReducer(state, { type: 'countFailed', token: 2, error: failure() });

    expect(next.unreadCount).toBe(3);
    expect(next.countStatus).toBe('error');
    expect(next.countError?.code).toBe('ADAPTER_FAILURE');
  });

  it('never turns an unknown counter into a confirmed zero', () => {
    const state = inboxReducer(createInboxState(), { type: 'countLoading', token: 1 });
    const next = inboxReducer(state, { type: 'countFailed', token: 1, error: failure() });

    expect(next.unreadCount).toBeNull();
    expect(next.countStatus).toBe('error');
  });

  it('ignores a counter that belongs to a superseded request', () => {
    const state = inboxReducer(createInboxState(), { type: 'countLoading', token: 1 });
    const superseded = inboxReducer(state, { type: 'countLoading', token: 2 });
    const next = inboxReducer(superseded, {
      type: 'countLoaded',
      token: 1,
      unreadCount: 27,
    });

    expect(next).toBe(superseded);
  });

  it('does not move when the filter changes', () => {
    const countedState = counted(createInboxState(), 27);
    const next = inboxReducer(countedState, { type: 'setFilter', filter: 'unread' });

    expect(next.unreadCount).toBe(27);
    expect(next.countStatus).toBe('ready');
  });
});

describe('changing the filter', () => {
  it('empties the list, keeps the counter and keeps the optimistic layer', () => {
    const countedState = counted(loadedState(), 3);
    const pending = inboxReducer(countedState, {
      type: 'readPending',
      token: 1,
      id: 'a',
      read: true,
      previousRead: false,
    });
    const next = inboxReducer(pending, { type: 'setFilter', filter: 'unread' });

    expect(next.filter).toBe('unread');
    expect(ids(next)).toEqual([]);
    expect(next.byId).toEqual({});
    expect(next.nextCursor).toBeNull();
    expect(next.listStatus).toBe('idle');
    expect(next.pageStatus).toBe('idle');
    expect(next.unreadCount).toBe(3);
    expect(next.pending.reads.a.read).toBe(true);
  });

  it('is a no-op when the filter is the one already loaded', () => {
    const state = loadedState();
    expect(inboxReducer(state, { type: 'setFilter', filter: 'all' })).toBe(state);
  });

  it('supersedes the request of the previous filter', () => {
    const loading = inboxReducer(createInboxState(), { type: 'listLoading', token: 1 });
    const filtered = inboxReducer(loading, { type: 'setFilter', filter: 'unread' });
    const next = inboxReducer(filtered, {
      type: 'listLoaded',
      token: 1,
      page: pageOf([note('a')], null),
    });

    expect(next).toBe(filtered);
    expect(ids(next)).toEqual([]);
  });
});

describe('changing the context', () => {
  it('drops everything that belonged to the previous one', () => {
    const countedState = counted(loadedState(), 3);
    const pending = inboxReducer(countedState, {
      type: 'readPending',
      token: 1,
      id: 'a',
      read: true,
      previousRead: false,
    });
    const next = inboxReducer(pending, { type: 'contextChanged', contextKey: 'workspace-7' });

    expect(next.contextKey).toBe('workspace-7');
    expect(next.filter).toBe('all');
    expect(ids(next)).toEqual([]);
    expect(next.unreadCount).toBeNull();
    expect(next.countStatus).toBe('idle');
    expect(next.pending.reads).toEqual({});
    expect(next.listToken).toBe(0);
  });

  it('keeps the filter the visitor chose', () => {
    const filtered = inboxReducer(createInboxState(), { type: 'setFilter', filter: 'unread' });
    const next = inboxReducer(filtered, { type: 'contextChanged', contextKey: 'workspace-7' });

    expect(next.filter).toBe('unread');
  });

  it('is a no-op for the context it already works against', () => {
    const state = loadedState();
    expect(inboxReducer(state, { type: 'contextChanged', contextKey: 'default' })).toBe(state);
  });

  it('drops an answer that was in flight for the previous context', () => {
    const loading = inboxReducer(createInboxState(), { type: 'listLoading', token: 1 });
    const moved = inboxReducer(loading, { type: 'contextChanged', contextKey: 'workspace-7' });
    const next = inboxReducer(moved, {
      type: 'listLoaded',
      token: 1,
      page: pageOf([note('a')], null),
    });

    expect(next).toBe(moved);
    expect(ids(next)).toEqual([]);
  });
});

describe('the optimistic layer', () => {
  function withRead(): InboxState {
    return inboxReducer(loadedState(), {
      type: 'readPending',
      token: 1,
      id: 'a',
      read: true,
      previousRead: false,
    });
  }

  it('records the desired state without touching confirmed data', () => {
    const loaded = loadedState();
    const next = inboxReducer(loaded, {
      type: 'readPending',
      token: 1,
      id: 'a',
      read: true,
      previousRead: false,
    });

    expect(next.pending.reads.a).toEqual({
      token: 1,
      read: true,
      previousRead: false,
      status: 'pending',
    });
    expect(next.pending.readOrder).toEqual(['a']);
    // The confirmed row and the counter are exactly as the server reported them.
    expect(next.byId.a).toBe(loaded.byId.a);
    expect(next.byId.a.read).toBe(false);
    expect(next.unreadCount).toBeNull();
  });

  it('queues the operations in the order they were asked for', () => {
    const first = withRead();
    const second = inboxReducer(first, {
      type: 'readPending',
      token: 2,
      id: 'c',
      read: true,
      previousRead: false,
    });
    const third = inboxReducer(second, {
      type: 'readPending',
      token: 3,
      id: 'b',
      read: true,
      previousRead: false,
    });

    expect(third.pending.readOrder).toEqual(['a', 'c', 'b']);
  });

  it('does not queue the same id twice', () => {
    const first = withRead();
    const second = inboxReducer(first, {
      type: 'readPending',
      token: 2,
      id: 'a',
      read: false,
      previousRead: true,
    });

    expect(second.pending.readOrder).toEqual(['a']);
    expect(second.pending.reads.a.read).toBe(false);
  });

  it('takes the confirmed row and counter on success and drops the operation', () => {
    const next = inboxReducer(withRead(), {
      type: 'readConfirmed',
      token: 1,
      notification: note('a', { read: true }),
      unreadCount: 2,
    });

    expect(next.byId.a.read).toBe(true);
    expect(next.unreadCount).toBe(2);
    expect(next.countStatus).toBe('ready');
    expect(next.pending.reads).toEqual({});
    expect(next.pending.readOrder).toEqual([]);
  });

  it('keeps the other operations when one succeeds', () => {
    const first = withRead();
    const second = inboxReducer(first, {
      type: 'readPending',
      token: 2,
      id: 'c',
      read: true,
      previousRead: false,
    });
    const next = inboxReducer(second, {
      type: 'readConfirmed',
      token: 1,
      notification: note('a', { read: true }),
      unreadCount: 2,
    });

    expect(next.pending.reads.c?.status).toBe('pending');
    expect(next.pending.readOrder).toEqual(['c']);
  });

  it('does not add a row the server never gave us', () => {
    const state = inboxReducer(loadedState(), { type: 'listLoading', token: 2 });
    const refreshed = inboxReducer(state, {
      type: 'listLoaded',
      token: 2,
      page: pageOf([note('b'), note('c')], null),
    });
    const pending = inboxReducer(refreshed, {
      type: 'readPending',
      token: 1,
      id: 'a',
      read: true,
      previousRead: false,
    });
    const next = inboxReducer(pending, {
      type: 'readConfirmed',
      token: 1,
      notification: note('a', { read: true }),
      unreadCount: 2,
    });

    expect(ids(next)).toEqual(['b', 'c']);
    expect(next.byId.a).toBeUndefined();
    expect(next.unreadCount).toBe(2);
    expect(next.pending.reads.a).toBeUndefined();
  });

  it('ignores a confirmation it never asked for', () => {
    const state = loadedState();
    const next = inboxReducer(state, {
      type: 'readConfirmed',
      token: 1,
      notification: note('a', { read: true }),
      unreadCount: 2,
    });

    expect(next).toBe(state);
  });

  it('rolls back only the refused operation', () => {
    const first = withRead();
    const second = inboxReducer(first, {
      type: 'readPending',
      token: 2,
      id: 'c',
      read: true,
      previousRead: false,
    });
    const next = inboxReducer(second, { type: 'readFailed', token: 1, id: 'a' });

    expect(next.pending.reads.a).toBeUndefined();
    expect(next.pending.readOrder).toEqual(['c']);
    expect(next.byId.a.read).toBe(false);
    expect(ids(next)).toEqual(['a', 'b', 'c']);
  });

  it('is a no-op for an operation it does not know', () => {
    const state = withRead();
    const next = inboxReducer(state, { type: 'readFailed', token: 9, id: 'a' });

    expect(next).toBe(state);
  });

  it('keeps an operation whose answer was lost, marked as unknown', () => {
    const next = inboxReducer(withRead(), { type: 'readUnknown', token: 1, id: 'a' });

    expect(next.pending.reads.a).toEqual({
      token: 1,
      read: true,
      previousRead: false,
      status: 'unknown',
    });
    expect(next.pending.readOrder).toEqual(['a']);
    expect(next.byId.a.read).toBe(false);
  });

  it('ignores a settle for a superseded operation', () => {
    const first = withRead();
    const superseded = inboxReducer(first, {
      type: 'readPending',
      token: 2,
      id: 'a',
      read: false,
      previousRead: true,
    });
    const confirmed = inboxReducer(superseded, {
      type: 'readConfirmed',
      token: 1,
      notification: note('a', { read: true }),
      unreadCount: 2,
    });

    expect(confirmed).toBe(superseded);
    const unknown = inboxReducer(superseded, { type: 'readUnknown', token: 1, id: 'a' });
    expect(unknown).toBe(superseded);
  });

  it('resolves only the operations whose answer was lost', () => {
    const unknown = inboxReducer(withRead(), { type: 'readUnknown', token: 1, id: 'a' });
    const both = inboxReducer(unknown, {
      type: 'readPending',
      token: 2,
      id: 'c',
      read: true,
      previousRead: false,
    });
    const next = inboxReducer(both, { type: 'readsReconciled' });

    expect(next.pending.reads.a).toBeUndefined();
    expect(next.pending.readOrder).toEqual(['c']);
    expect(next.pending.reads.c?.status).toBe('pending');
    expect(next.byId.a.read).toBe(false);
  });

  it('keeps a pending operation when reconciliation runs', () => {
    const state = withRead();
    const next = inboxReducer(state, { type: 'readsReconciled' });

    expect(next).toBe(state);
  });

  it('survives a refresh, because a refresh does not retract a request', () => {
    const state = inboxReducer(withRead(), { type: 'listLoading', token: 2 });
    const refreshed = inboxReducer(state, {
      type: 'listLoaded',
      token: 2,
      page: pageOf([note('a'), note('d')], null),
    });

    expect(refreshed.pending.reads.a?.read).toBe(true);
    expect(refreshed.byId.a.read).toBe(false);
  });
});

describe('the bulk “mark all read” operation', () => {
  /** A counted state whose rows have different creation times. */
  function timedState(): InboxState {
    const loading = inboxReducer(createInboxState(), { type: 'listLoading', token: 1 });
    const loaded = inboxReducer(loading, {
      type: 'listLoaded',
      token: 1,
      page: pageOf(
        [
          note('early', { createdAt: '2026-10-18T08:00:00Z' }),
          note('edge', { createdAt: '2026-10-18T09:00:00Z' }),
          note('late', { createdAt: '2026-10-18T10:00:00Z' }),
          note('already', { createdAt: '2026-10-18T07:00:00Z', read: true }),
        ],
        null,
      ),
    });
    return counted(loaded, 3);
  }

  it('records the request without touching the confirmed rows or the counter', () => {
    const state = timedState();
    const next = inboxReducer(state, { type: 'bulkPending', token: 7 });

    expect(next.pending.bulk).toEqual({ token: 7, status: 'pending' });
    expect(next.byId).toBe(state.byId);
    expect(next.unreadCount).toBe(3);
    expect(next.pending.reads).toEqual({});
  });

  it('applies the server boundary to loaded rows and installs its counter', () => {
    const state = inboxReducer(timedState(), { type: 'bulkPending', token: 7 });
    const next = inboxReducer(state, {
      type: 'bulkConfirmed',
      token: 7,
      boundary: '2026-10-18T09:00:00Z',
      unreadCount: 4,
    });

    // Everything at or before the boundary is read, including the row that was
    // already read; the event after it keeps the server's unread state.
    expect(next.byId.early?.read).toBe(true);
    expect(next.byId.edge?.read).toBe(true);
    expect(next.byId.late?.read).toBe(false);
    expect(next.byId.already?.read).toBe(true);
    // The result's counter is not necessarily zero: the late event is included.
    expect(next.unreadCount).toBe(4);
    expect(next.countStatus).toBe('ready');
    expect(next.pending.bulk).toBeNull();
  });

  it('keeps the rows and the counter when the server refuses', () => {
    const state = inboxReducer(timedState(), { type: 'bulkPending', token: 7 });
    const next = inboxReducer(state, { type: 'bulkFailed', token: 7 });

    expect(next.pending.bulk).toBeNull();
    expect(next.byId).toBe(state.byId);
    expect(next.unreadCount).toBe(3);
  });

  it('keeps a lost answer visible until reconciliation, then drops it', () => {
    const state = inboxReducer(timedState(), { type: 'bulkPending', token: 7 });
    const unknown = inboxReducer(state, { type: 'bulkUnknown', token: 7 });
    expect(unknown.pending.bulk).toEqual({ token: 7, status: 'unknown' });

    const reconciled = inboxReducer(unknown, { type: 'readsReconciled' });
    expect(reconciled.pending.bulk).toBeNull();
    expect(reconciled.byId).toBe(unknown.byId);
  });

  it('never reconciles a bulk operation that is still running', () => {
    const state = inboxReducer(timedState(), { type: 'bulkPending', token: 7 });
    expect(inboxReducer(state, { type: 'readsReconciled' })).toBe(state);
  });

  it('ignores an answer of a superseded bulk operation', () => {
    const state = inboxReducer(timedState(), { type: 'bulkPending', token: 7 });

    expect(
      inboxReducer(state, {
        type: 'bulkConfirmed',
        token: 6,
        boundary: '2026-10-18T09:00:00Z',
        unreadCount: 0,
      }),
    ).toBe(state);
    expect(inboxReducer(state, { type: 'bulkFailed', token: 6 })).toBe(state);
    expect(inboxReducer(state, { type: 'bulkUnknown', token: 6 })).toBe(state);
  });

  it('belongs to the context, not to the filter, and survives a filter change', () => {
    const state = inboxReducer(timedState(), { type: 'bulkPending', token: 7 });
    const filtered = inboxReducer(state, { type: 'setFilter', filter: 'unread' });

    expect(filtered.pending.bulk).toEqual({ token: 7, status: 'pending' });

    const changed = inboxReducer(filtered, { type: 'contextChanged', contextKey: 'user-2' });
    expect(changed.pending.bulk).toBeNull();
  });
});

describe('the reducer itself', () => {
  it('never mutates the page or the notifications it is given', () => {
    const items = [note('a'), note('b')];
    const page: InboxPage = { items, nextCursor: 'cursor-1' };
    const loading = inboxReducer(createInboxState(), { type: 'listLoading', token: 1 });

    Object.freeze(items);
    Object.freeze(items[0]);
    Object.freeze(items[1]);
    Object.freeze(page);

    const next = inboxReducer(loading, { type: 'listLoaded', token: 1, page });

    expect(ids(next)).toEqual(['a', 'b']);
    // The confirmed row is the very object the adapter produced.
    expect(next.byId.a).toBe(items[0]);
  });

  it('stores a notification whose id collides with an object key', () => {
    const items = [note('__proto__'), note('toString')];
    const loading = inboxReducer(createInboxState(), { type: 'listLoading', token: 1 });
    const next = inboxReducer(loading, {
      type: 'listLoaded',
      token: 1,
      page: pageOf(items, null),
    });

    expect(ids(next)).toEqual(['__proto__', 'toString']);
    expect(Object.hasOwn(next.byId, '__proto__')).toBe(true);
    expect(next.byId['toString']?.id).toBe('toString');
    expect(Object.keys(next.byId).sort()).toEqual(['__proto__', 'toString']);
  });

  it('returns the same state when an action moves nothing', () => {
    const state = loadedState();
    const actions: InboxAction[] = [
      { type: 'setFilter', filter: 'all' },
      { type: 'contextChanged', contextKey: 'default' },
      { type: 'listLoaded', token: 9, page: pageOf([note('z')], null) },
      { type: 'countLoaded', token: 9, unreadCount: 1 },
    ];

    for (const action of actions) {
      expect(inboxReducer(state, action)).toBe(state);
    }
  });

  it('drives a whole scenario without a controller', () => {
    // The transition table a binding will observe, in order.
    let state: InboxState = createInboxState({ contextKey: 'user-1' });
    state = inboxReducer(state, { type: 'listLoading', token: 1 });
    state = inboxReducer(state, { type: 'countLoading', token: 1 });
    expect([state.listStatus, state.countStatus, state.unreadCount]).toEqual([
      'loading',
      'loading',
      null,
    ]);

    state = inboxReducer(state, {
      type: 'listLoaded',
      token: 1,
      page: pageOf([note('a'), note('b')], 'cursor-1'),
    });
    state = inboxReducer(state, { type: 'countLoaded', token: 1, unreadCount: 27 });
    expect([ids(state), state.unreadCount, state.nextCursor]).toEqual([['a', 'b'], 27, 'cursor-1']);

    state = inboxReducer(state, { type: 'pageLoading', token: 1 });
    state = inboxReducer(state, {
      type: 'pageLoaded',
      token: 1,
      page: pageOf([note('c')], null),
    });
    expect(ids(state)).toEqual(['a', 'b', 'c']);
    expect(state.nextCursor).toBeNull();

    state = inboxReducer(state, {
      type: 'readPending',
      token: 1,
      id: 'a',
      read: true,
      previousRead: false,
    });
    expect([state.pending.reads.a?.status, state.byId.a.read]).toEqual(['pending', false]);

    state = inboxReducer(state, {
      type: 'readConfirmed',
      token: 1,
      notification: note('a', { read: true }),
      unreadCount: 26,
    });
    expect([state.pending.reads.a, state.byId.a.read, state.unreadCount]).toEqual([
      undefined,
      true,
      26,
    ]);

    state = inboxReducer(state, { type: 'setFilter', filter: 'unread' });
    expect([ids(state), state.unreadCount, state.nextCursor]).toEqual([[], 26, null]);
  });
});

describe('the types of the state', () => {
  interface OrderData {
    orderId: number;
  }

  it('carries the application data of one adapter', () => {
    expectTypeOf<InboxState<OrderData>['byId']>().toEqualTypeOf<
      Readonly<Record<string, InboxNotification<OrderData>>>
    >();
  });

  it('flows the generic through the actions', () => {
    type Loaded = Extract<InboxAction<OrderData>, { type: 'listLoaded' }>;
    expectTypeOf<Loaded['page']>().toEqualTypeOf<InboxPage<OrderData>>();
  });

  it('keeps the counter honest about not being known', () => {
    expectTypeOf<InboxState['unreadCount']>().toEqualTypeOf<number | null>();
  });

  it('keeps the optimistic layer free of confirmed notifications', () => {
    expectTypeOf<InboxPendingRead>().not.toHaveProperty('notification');
    expectTypeOf<InboxPendingRead['previousRead']>().toEqualTypeOf<boolean>();
  });
});
