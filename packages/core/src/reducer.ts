/**
 * The inbox state machine.
 *
 * Pure and synchronous: it never reads the clock, never touches the DOM and
 * never performs I/O. The controller owns requests, cancellation, the request
 * generations and the serialised mutation queue; everything here is a
 * deterministic transition that a test can replay, and `inboxReducer()` returns
 * the very same object when a transition changes nothing, so a snapshot stays
 * stable between real changes.
 *
 * Three ideas carry the design:
 *
 * - **Confirmed data is server data.** `byId` and `order` hold the notifications
 *   exactly as the adapter reported them, in the server's order and without
 *   duplicate ids. The reducer never sorts them, and merging a page is additive:
 *   the first occurrence of an id keeps both its place and its content, so a
 *   page that overlaps the previous one cannot move rows around.
 * - **The optimistic layer is separate.** `pending` describes what the visitor
 *   asked for and where that request stands. It never writes `byId`, never
 *   changes `unreadCount` and never resurrects a row: rolling a rejected
 *   operation back simply drops the layer, and the confirmed data shows through
 *   untouched.
 * - **Every request carries a generation.** A load stores the token it was
 *   started with, and a terminal action whose token no longer matches the state
 *   is dropped, so an answer to a superseded request cannot move the state.
 */
import { DEFAULT_CONTEXT_KEY, DEFAULT_FILTER } from './context';
import type { InboxError } from './errors';
import type { InboxFilter, InboxNotification, InboxPage } from './types';

/* -------------------------------------------------------------------------- */
/*  Statuses                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Where a load stands.
 *
 * `idle` means nothing was requested, `ready` means the last request answered,
 * and `error` means it failed while whatever was already loaded stays on screen:
 * a failed refresh keeps the list it was refreshing, and a failed counter keeps
 * the previous value — or `null`, the honest "unknown".
 */
export type InboxLoadStatus = 'idle' | 'loading' | 'ready' | 'error';

/**
 * Where appending the next page stands.
 *
 * A successful merge returns the status to `idle`; the list as a whole is
 * described by {@link InboxState.listStatus}.
 */
export type InboxPageStatus = 'idle' | 'loading' | 'error';

/** Where one individual read operation stands. */
export type InboxPendingReadStatus = 'pending' | 'unknown';

/* -------------------------------------------------------------------------- */
/*  The optimistic layer                                                      */
/* -------------------------------------------------------------------------- */

/**
 * One individual read operation, kept apart from the confirmed notification it
 * targets.
 *
 * `previousRead` is the confirmed state the operation started from. It is what a
 * rollback and a correction of the displayed counter are based on, and it is
 * deliberately captured here instead of being read back from `byId`, so the
 * baseline cannot be confused with an optimistic value.
 *
 * The three possible outcomes are represented without a third field: a confirmed
 * operation leaves no entry at all (the confirmed row, not the layer, is what
 * the binding then shows), a rejected one leaves no entry either (rolling the
 * optimistic value back and reporting the failure through `onError`), and an
 * operation whose answer was lost stays with `status: 'unknown'` until the
 * application reconciles.
 */
export interface InboxPendingRead {
  /** The generation of the request that carries this operation. */
  token: number;
  /** Desired state: what the visitor asked for, never a toggle. */
  read: boolean;
  /** Confirmed server state the operation started from. */
  previousRead: boolean;
  /** `pending` while it is queued or in flight; `unknown` when the answer was lost. */
  status: InboxPendingReadStatus;
}

/**
 * The bulk “mark all read” operation.
 *
 * It runs outside the queue of individual changes, so it has its own generation
 * and its own entry in the layer. Until the server answers, every loaded row is
 * shown as read and the displayed counter is projected to zero: the request
 * covers the whole context, including the rows that were never loaded. The
 * confirmed answer replaces that guess with the server's boundary and counter,
 * which is what keeps an event created after the boundary unread.
 */
export interface InboxPendingBulk {
  /** The generation of the `markAllRead` request that carries this operation. */
  token: number;
  /** `pending` while the operation runs; `unknown` when its answer was lost. */
  status: InboxPendingReadStatus;
}

/**
 * Everything the visitor asked for but the server has not confirmed.
 *
 * `reads` holds at most one operation per notification id and `readOrder` is the
 * order they were queued in, which is the order the controller sends them in:
 * individual mutations are serialised, so at most one of them is in flight at a
 * time.
 */
export interface InboxPendingState {
  /** Individual read operations, keyed by notification id. */
  reads: Readonly<Record<string, InboxPendingRead>>;
  /** The ids of `reads`, oldest first. */
  readOrder: readonly string[];
  /** The bulk operation, or `null` when none was requested. */
  bulk: InboxPendingBulk | null;
}

/* -------------------------------------------------------------------------- */
/*  State                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * The whole inbox as the core holds it: confirmed server data, the status of
 * each load, the optimistic layer and the request generations.
 *
 * @typeParam TData — Application data carried by every notification.
 */
export interface InboxState<TData = unknown> {
  /** The user/workspace this state belongs to; the scope of the counter. */
  contextKey: string;
  /** The filter the loaded rows belong to. The counter is filter-independent. */
  filter: InboxFilter;
  /** Confirmed notifications by id, exactly as the adapter reported them. */
  byId: Readonly<Record<string, InboxNotification<TData>>>;
  /** Ids of `byId` in the server's order, newest first, without duplicates. */
  order: readonly string[];
  /** Opaque cursor of the next page, or `null` at the end of the list. */
  nextCursor: string | null;
  /** Where the first page stands: the initial load and every refresh. */
  listStatus: InboxLoadStatus;
  /** Why the first page failed, or `null`. */
  listError: InboxError | null;
  /** Where appending the next page stands. */
  pageStatus: InboxPageStatus;
  /** Why the next page failed, or `null`. Rows already shown are kept. */
  pageError: InboxError | null;
  /**
   * The server counter, or `null` until the server reports one.
   *
   * `null` is deliberately not `0`: an unknown counter must not be presented as
   * a confirmed “nothing unread”.
   */
  unreadCount: number | null;
  /** Where the counter load stands. */
  countStatus: InboxLoadStatus;
  /** Why the counter load failed, or `null`. */
  countError: InboxError | null;
  /** The optimistic layer, deliberately separate from the confirmed rows. */
  pending: InboxPendingState;
  /**
   * An external change was reported and the loaded list has not absorbed it yet.
   *
   * The flag is raised by an invalidation from the adapter and cleared by the
   * first page that was requested after the latest invalidation. Until then the
   * open list stays exactly as it is, because new events must not shift a list
   * the visitor is reading.
   */
  updatesAvailable: boolean;
  /** Generation of the first-page request. A stale answer is dropped. */
  listToken: number;
  /** Generation of the next-page request. */
  pageToken: number;
  /** Generation of the counter request. */
  countToken: number;
}

/** What {@link createInboxState} may be given. */
export interface CreateInboxStateOptions {
  /** Default: the implicit context (`'default'`). */
  contextKey?: string;
  /** Default: `'all'`. */
  filter?: InboxFilter;
}

/**
 * The state of an inbox that has never loaded anything.
 *
 * Every counter is `null` or `idle`, the list is empty and no generation has
 * been used yet: creating a controller performs no request, and neither does
 * creating its state.
 */
export function createInboxState<TData = unknown>(
  options: CreateInboxStateOptions = {},
): InboxState<TData> {
  return {
    contextKey: options.contextKey ?? DEFAULT_CONTEXT_KEY,
    filter: options.filter ?? DEFAULT_FILTER,
    byId: {},
    order: [],
    nextCursor: null,
    listStatus: 'idle',
    listError: null,
    pageStatus: 'idle',
    pageError: null,
    unreadCount: null,
    countStatus: 'idle',
    countError: null,
    pending: { reads: {}, readOrder: [], bulk: null },
    updatesAvailable: false,
    listToken: 0,
    pageToken: 0,
    countToken: 0,
  };
}

/* -------------------------------------------------------------------------- */
/*  Actions                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Everything that can happen to the state.
 *
 * A load reports the token it was started with so that the reducer can drop an
 * answer to a superseded request; a mutation reports the token of the operation
 * it settles so that the same protection covers a change made for a context or
 * a filter the visitor has already left.
 *
 * @typeParam TData — Application data carried by every notification.
 */
export type InboxAction<TData = unknown> =
  /** A different user/workspace: nothing of the previous context survives. */
  | { type: 'contextChanged'; contextKey: string }
  /** A different filter: the rows and the paging go, the counter stays. */
  | { type: 'setFilter'; filter: InboxFilter }
  /**
   * The adapter reported that the context changed. The open list stays put and
   * the flag invites the visitor to ask for the new first page explicitly.
   */
  | { type: 'externalUpdate' }
  | { type: 'listLoading'; token: number }
  | {
      type: 'listLoaded';
      token: number;
      page: InboxPage<TData>;
      /**
       * Whether the adapter reported another change after this request started.
       * Omitted means “keep the flag as it was”, which keeps a hand-built action
       * usable; the controller always states its answer.
       */
      updatesAvailable?: boolean;
    }
  | { type: 'listFailed'; token: number; error: InboxError }
  | { type: 'pageLoading'; token: number }
  | { type: 'pageLoaded'; token: number; page: InboxPage<TData> }
  | { type: 'pageFailed'; token: number; error: InboxError }
  | { type: 'countLoading'; token: number }
  | { type: 'countLoaded'; token: number; unreadCount: number }
  | { type: 'countFailed'; token: number; error: InboxError }
  | {
      type: 'readPending';
      token: number;
      id: string;
      read: boolean;
      previousRead: boolean;
    }
  | {
      type: 'readConfirmed';
      token: number;
      notification: InboxNotification<TData>;
      unreadCount: number;
    }
  | { type: 'readFailed'; token: number; id: string }
  | { type: 'readUnknown'; token: number; id: string }
  | { type: 'bulkPending'; token: number }
  /**
   * The server applied “mark all read” at `boundary`. Loaded rows created at or
   * before it become read, rows created after it keep their confirmed state, and
   * the server counter is installed as is — it is not necessarily zero.
   */
  | { type: 'bulkConfirmed'; token: number; boundary: string; unreadCount: number }
  | { type: 'bulkFailed'; token: number }
  | { type: 'bulkUnknown'; token: number }
  /**
   * A fresh authoritative page and counter have arrived, so the operations
   * whose answers were lost no longer have to be guessed: their rows now show
   * the server state. Queued and in-flight operations stay untouched.
   */
  | { type: 'readsReconciled' };

/* -------------------------------------------------------------------------- */
/*  Records                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Defines one own property of a record.
 *
 * `Object.defineProperty` rather than `record[key] = value` on purpose: a
 * notification id (or any other key of these records) may legally be
 * `__proto__`, and a plain assignment would walk the prototype chain instead of
 * storing the value. Copies use the object spread, which defines own properties
 * and is safe for the same reason.
 */
function defineKey<Value>(record: Record<string, Value>, key: string, value: Value): void {
  Object.defineProperty(record, key, {
    value,
    enumerable: true,
    writable: true,
    configurable: true,
  });
}

/** A copy of `record` with `key` set to `value`. */
function withKey<Value>(
  record: Readonly<Record<string, Value>>,
  key: string,
  value: Value,
): Record<string, Value> {
  const next: Record<string, Value> = { ...record };
  defineKey(next, key, value);
  return next;
}

/** A copy of `record` without `key`. */
function withoutKey<Value>(
  record: Readonly<Record<string, Value>>,
  key: string,
): Record<string, Value> {
  const next: Record<string, Value> = { ...record };
  delete next[key];
  return next;
}

/**
 * Indexes one page: the ids in the server's order and the rows by id.
 *
 * A page that repeats an id (or an item without one, which the boundary checks
 * reject before it gets here) contributes it once — the first occurrence.
 */
function indexPage<TData>(page: InboxPage<TData>): {
  byId: Record<string, InboxNotification<TData>>;
  order: string[];
} {
  const byId: Record<string, InboxNotification<TData>> = {};
  const order: string[] = [];
  for (const item of page.items) {
    if (Object.hasOwn(byId, item.id)) continue;
    defineKey(byId, item.id, item);
    order.push(item.id);
  }
  return { byId, order };
}

/** Removes the id from the queue of pending operations, keeping the order. */
function withoutQueuedId(readOrder: readonly string[], id: string): readonly string[] {
  return readOrder.filter((queued) => queued !== id);
}

/**
 * The confirmed rows after a successful `markAllRead`.
 *
 * The server reports the moment it applied the operation, not the ids it
 * touched: every notification created at or before that boundary is read and
 * everything created after it keeps the state the server gave. Only the rows
 * this state already holds are rewritten, and only the ones that actually
 * change, so an already-read row keeps the very object the adapter produced.
 */
function rowsReadAtBoundary<TData>(
  state: InboxState<TData>,
  boundary: string,
): Readonly<Record<string, InboxNotification<TData>>> {
  const boundaryMs = Date.parse(boundary);
  let byId: Record<string, InboxNotification<TData>> | null = null;

  for (const id of state.order) {
    const current = (byId ?? state.byId)[id];
    if (current === undefined || current.read) continue;
    if (Date.parse(current.createdAt) > boundaryMs) continue;

    byId ??= { ...state.byId };
    defineKey(byId, id, { ...current, read: true });
  }

  return byId ?? state.byId;
}

/* -------------------------------------------------------------------------- */
/*  Reducer                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Applies one action to the state.
 *
 * Returns `state` unchanged — the same object, not a copy — whenever the action
 * does not move the model, so `getSnapshot()` can keep handing out the object it
 * already has.
 */
export function inboxReducer<TData = unknown>(
  state: InboxState<TData>,
  action: InboxAction<TData>,
): InboxState<TData> {
  switch (action.type) {
    case 'externalUpdate': {
      // One flag per burst: an invalidation that arrives while the previous one
      // is still unacknowledged does not create a new snapshot.
      if (state.updatesAvailable) return state;
      return { ...state, updatesAvailable: true };
    }

    case 'contextChanged': {
      if (action.contextKey === state.contextKey) return state;
      // A different user/workspace: the rows, the counter, the paging and the
      // optimistic layer all belong to the previous one. The filter is kept —
      // which rows the visitor wants to see is their choice, not the context's —
      // and the generations restart, so every in-flight answer is dropped.
      return createInboxState<TData>({ contextKey: action.contextKey, filter: state.filter });
    }

    case 'setFilter': {
      if (action.filter === state.filter) return state;
      return {
        ...state,
        filter: action.filter,
        byId: {},
        order: [],
        nextCursor: null,
        listStatus: 'idle',
        listError: null,
        pageStatus: 'idle',
        pageError: null,
        // The counter is server data for the whole context, so the filter never
        // moves it. The generations move instead: an answer to the request of
        // the previous filter must not repopulate the list.
        listToken: state.listToken + 1,
        pageToken: state.pageToken + 1,
      };
    }

    case 'listLoading':
      return {
        ...state,
        listStatus: 'loading',
        listError: null,
        listToken: action.token,
      };

    case 'listLoaded': {
      if (action.token !== state.listToken) return state;
      // A refresh replaces the whole chain with a fresh first page: rows that
      // are no longer part of it are gone, and so is the paging of the old one.
      const { byId, order } = indexPage(action.page);
      return {
        ...state,
        byId,
        order,
        nextCursor: action.page.nextCursor,
        listStatus: 'ready',
        listError: null,
        pageStatus: 'idle',
        pageError: null,
        updatesAvailable: action.updatesAvailable ?? state.updatesAvailable,
      };
    }

    case 'listFailed': {
      if (action.token !== state.listToken) return state;
      // Whatever was already loaded stays: a failed refresh must not empty a
      // list the visitor is reading.
      return { ...state, listStatus: 'error', listError: action.error };
    }

    case 'pageLoading':
      return {
        ...state,
        pageStatus: 'loading',
        pageError: null,
        pageToken: action.token,
      };

    case 'pageLoaded': {
      if (action.token !== state.pageToken) return state;

      const byId: Record<string, InboxNotification<TData>> = { ...state.byId };
      const order = [...state.order];
      for (const item of action.page.items) {
        // Additive: an id that is already loaded keeps its place and its
        // content, so overlapping pages cannot reorder or rewind the list.
        if (Object.hasOwn(byId, item.id)) continue;
        defineKey(byId, item.id, item);
        order.push(item.id);
      }

      return {
        ...state,
        byId,
        order,
        // A cursor that did not advance would make paging loop forever, so the
        // end of the list is the honest answer to a repeated cursor.
        nextCursor: action.page.nextCursor === state.nextCursor ? null : action.page.nextCursor,
        pageStatus: 'idle',
        pageError: null,
      };
    }

    case 'pageFailed': {
      if (action.token !== state.pageToken) return state;
      // The rows and the cursor stay exactly as they were, so the same page can
      // be requested again.
      return { ...state, pageStatus: 'error', pageError: action.error };
    }

    case 'countLoading':
      return {
        ...state,
        countStatus: 'loading',
        countError: null,
        countToken: action.token,
      };

    case 'countLoaded': {
      if (action.token !== state.countToken) return state;
      return {
        ...state,
        unreadCount: action.unreadCount,
        countStatus: 'ready',
        countError: null,
      };
    }

    case 'countFailed': {
      if (action.token !== state.countToken) return state;
      // The previous value stays, and `null` stays `null`: a failed counter load
      // never turns “unknown” into a confirmed zero.
      return { ...state, countStatus: 'error', countError: action.error };
    }

    case 'readPending': {
      const queued = Object.hasOwn(state.pending.reads, action.id);
      return {
        ...state,
        pending: {
          ...state.pending,
          // The layer holds one desired state per id and never touches the
          // confirmed row or the counter.
          reads: withKey(state.pending.reads, action.id, {
            token: action.token,
            read: action.read,
            previousRead: action.previousRead,
            status: 'pending',
          }),
          readOrder: queued ? state.pending.readOrder : [...state.pending.readOrder, action.id],
        },
      };
    }

    case 'readConfirmed': {
      const operation = state.pending.reads[action.notification.id];
      // The layer settles the operations the controller started: an answer to a
      // superseded operation, or one nobody asked for, would carry a row and a
      // counter that belong to a state the visitor has already left.
      if (!operation || operation.token !== action.token) return state;

      const loaded = Object.hasOwn(state.byId, action.notification.id);
      return {
        ...state,
        // Only confirmed data is written here, and only for a row the server
        // already gave us: a notification that was never loaded must not appear
        // in the list because it was read.
        byId: loaded
          ? withKey(state.byId, action.notification.id, action.notification)
          : state.byId,
        unreadCount: action.unreadCount,
        countStatus: 'ready',
        countError: null,
        pending: {
          ...state.pending,
          reads: withoutKey(state.pending.reads, action.notification.id),
          readOrder: withoutQueuedId(state.pending.readOrder, action.notification.id),
        },
      };
    }

    case 'readFailed': {
      const operation = state.pending.reads[action.id];
      if (!operation || operation.token !== action.token) return state;
      // A confirmed refusal rolls back this operation only: the layer goes, the
      // confirmed data and every other operation stay.
      return {
        ...state,
        pending: {
          ...state.pending,
          reads: withoutKey(state.pending.reads, action.id),
          readOrder: withoutQueuedId(state.pending.readOrder, action.id),
        },
      };
    }

    case 'readUnknown': {
      const operation = state.pending.reads[action.id];
      if (!operation || operation.token !== action.token) return state;
      // The answer was lost, so the change may or may not have happened: the
      // operation stays visible until the application reconciles.
      return {
        ...state,
        pending: {
          ...state.pending,
          reads: withKey(state.pending.reads, action.id, {
            ...operation,
            status: 'unknown',
          }),
        },
      };
    }

    case 'readsReconciled': {
      const unknownIds = state.pending.readOrder.filter(
        (id) => state.pending.reads[id]?.status === 'unknown',
      );
      const bulk = state.pending.bulk;
      const dropBulk = bulk?.status === 'unknown';
      if (unknownIds.length === 0 && !dropBulk) return state;

      let reads = state.pending.reads;
      for (const id of unknownIds) reads = withoutKey(reads, id);

      return {
        ...state,
        pending: {
          ...state.pending,
          reads,
          // Only lost answers are settled here: an operation that is still
          // queued or in flight belongs to a request the controller has not
          // finished, and its own outcome will remove or keep it.
          readOrder: state.pending.readOrder.filter((id) => !unknownIds.includes(id)),
          bulk: dropBulk ? null : bulk,
        },
      };
    }

    case 'bulkPending':
      return {
        ...state,
        // The bulk operation is the whole layer for its duration. It never
        // writes a row or the counter: the derivation projects it, and dropping
        // the entry is the complete rollback.
        pending: {
          ...state.pending,
          bulk: { token: action.token, status: 'pending' },
        },
      };

    case 'bulkConfirmed': {
      if (state.pending.bulk?.token !== action.token) return state;

      return {
        ...state,
        byId: rowsReadAtBoundary(state, action.boundary),
        unreadCount: action.unreadCount,
        countStatus: 'ready',
        countError: null,
        pending: {
          ...state.pending,
          bulk: null,
        },
      };
    }

    case 'bulkFailed': {
      if (state.pending.bulk?.token !== action.token) return state;
      // A confirmed refusal retracts the whole optimistic layer; the confirmed
      // rows and the server counter were never touched.
      return {
        ...state,
        pending: {
          ...state.pending,
          bulk: null,
        },
      };
    }

    case 'bulkUnknown': {
      const bulk = state.pending.bulk;
      if (bulk?.token !== action.token) return state;
      // The operation may have happened: the layer stays visible until a
      // refreshed first page and counter reconcile it.
      return {
        ...state,
        pending: {
          ...state.pending,
          bulk: { ...bulk, status: 'unknown' },
        },
      };
    }

    default:
      return state;
  }
}
