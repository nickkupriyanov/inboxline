/**
 * A deterministic in-memory adapter.
 *
 * The mock implements the same {@link InboxAdapter} contract as a real backend,
 * so a test, a playground or a documentation example exercises the controller
 * without a network, a server or a browser. Every scenario is explicit:
 * notifications are passed as fixtures, time comes from an injected
 * {@link InboxClock}, and nothing is generated at random.
 *
 * The adapter also owns a small server simulator:
 *
 * - `addNotification()` stores a new event, the way another client would create
 *   one, without telling the core about it;
 * - `invalidate()` reports that the context changed, the way a WebSocket or an
 *   SSE transport would, so the subscription scenario is reproducible;
 * - `failNext()` queues one confirmed refusal or one lost answer, and the lost
 *   answer can be applied first, which is the difference between “the server
 *   said no” and “we never learned what the server did”;
 * - `setLatency()` controls how long a request takes, so an in-flight request
 *   can be cancelled or inspected.
 *
 * Loads honour the `AbortSignal` they receive and reject with an `AbortError`;
 * mutations have no signal, because cancelling one after the server received it
 * would create an unknown outcome. The store is per adapter instance and per
 * context key, so two adapters — or two contexts of one adapter — never see each
 * other's rows.
 */
import { isInboxNotification } from './adapter';
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
import { isInboxContext } from './context';
import { InboxError, createAbortError } from './errors';
import type {
  InboxClock,
  InboxContext,
  InboxErrorCode,
  InboxErrorOutcome,
  InboxNotification,
  InboxPage,
  InboxUnreadCount,
} from './types';

/** One operation of the adapter that can be delayed or made to fail. */
export type InboxMockOperation =
  'getNotifications' | 'getUnreadCount' | 'setReadStatus' | 'markAllRead';

/**
 * How long one mock request takes.
 *
 * A number applies to every operation; a function receives the operation, so a
 * test can keep the counter fast and make the list wait. The value is read when
 * the request starts, which makes `setLatency()` affect the next request.
 */
export type InboxMockLatency = number | ((operation: InboxMockOperation) => number);

/** Initial rows of one context. A context without a seed starts empty. */
export interface InboxMockContextSeed<TData = unknown, TContextData = unknown> {
  /** The user/workspace these rows belong to. */
  context: InboxContext<TContextData>;
  /** Explicit fixtures, newest first is not required: the mock orders them. */
  notifications?: readonly InboxNotification<TData>[];
}

/**
 * One injected failure.
 *
 * `apply` belongs to mutations only and applies the change before the failure is
 * thrown. Together with `outcome: 'unknown'` it models a lost response after the
 * server already changed the data; with the default `rejected` outcome the change
 * is not applied at all. A load has no change to apply and no unknown outcome.
 */
export interface InboxMockFailure {
  /** Default: `ADAPTER_FAILURE` for a refusal, `UNKNOWN` for a lost answer. */
  code?: InboxErrorCode;
  /** Default: `rejected`, the server confirmed that nothing changed. */
  outcome?: InboxErrorOutcome;
  /** Mutations only: apply the change before throwing. Requires `unknown`. */
  apply?: boolean;
  /** Default: a message naming the operation. */
  message?: string;
}

/** What `createMockAdapter()` accepts. */
export interface InboxMockOptions<TData = unknown, TContextData = unknown> {
  /** Injected time source. `markAllRead` derives its boundary from it. */
  clock: InboxClock;
  /** Rows per page. Default: 10. */
  pageSize?: number;
  /** Optional delay before an operation settles. Default: 0. */
  latencyMs?: InboxMockLatency;
  /** Initial rows, one entry per context. Omitted contexts start empty. */
  contexts?: readonly InboxMockContextSeed<TData, TContextData>[];
}

/**
 * The mock adapter and its controls.
 *
 * The controls belong to the simulator, not to the public adapter contract: a
 * controller receives the object as an ordinary {@link InboxAdapter}. They are
 * available on the same instance so a test can change the server between two
 * requests.
 */
export interface InboxMockAdapter<TData = unknown, TContextData = unknown> extends InboxAdapter<
  TData,
  TContextData
> {
  /** Stores a new event in the context without notifying subscribers. */
  addNotification(
    context: InboxContext<TContextData>,
    notification: InboxNotification<TData>,
  ): void;
  /** Calls the subscribers of the context, modelling an external change. */
  invalidate(context: InboxContext<TContextData>): void;
  /** Queues one failure for the next call of the operation. */
  failNext(operation: InboxMockOperation, failure?: InboxMockFailure): void;
  /** Drops queued failures for one operation, or for every operation. */
  clearFailures(operation?: InboxMockOperation): void;
  /** Replaces the delay used by the following requests. */
  setLatency(latencyMs: InboxMockLatency): void;
  /** The mock always supports invalidation, so the subscription is not optional. */
  subscribe(query: InboxSubscriptionQuery<TContextData>): () => void;
}

const DEFAULT_PAGE_SIZE = 10;
const CURSOR_PREFIX = 'mock:';
const OPERATIONS: readonly InboxMockOperation[] = [
  'getNotifications',
  'getUnreadCount',
  'setReadStatus',
  'markAllRead',
];
const MUTATION_OPERATIONS: ReadonlySet<InboxMockOperation> = new Set<InboxMockOperation>([
  'setReadStatus',
  'markAllRead',
]);

interface MockContext<TData> {
  readonly byId: Map<string, InboxNotification<TData>>;
  readonly listeners: Set<() => void>;
}

interface MockCursor {
  readonly createdAt: string;
  readonly id: string;
}

function requireContextKey(context: InboxContext<unknown>): string {
  if (!isInboxContext(context)) {
    throw new RangeError('Inboxline mock: context.key must be a non-empty string');
  }
  return context.key;
}

function requirePageSize(value: number): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new RangeError('Inboxline mock: pageSize must be a positive integer');
  }
  return value;
}

function requireLatency(value: number): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError('Inboxline mock: latency must be a finite, non-negative number');
  }
  return value;
}

function requireOperation(operation: InboxMockOperation): InboxMockOperation {
  if (!OPERATIONS.includes(operation)) {
    throw new RangeError(`Inboxline mock: unknown operation ${String(operation)}`);
  }
  return operation;
}

function compareNotifications<TData>(
  a: InboxNotification<TData>,
  b: InboxNotification<TData>,
): number {
  const delta = Date.parse(b.createdAt) - Date.parse(a.createdAt);
  if (delta !== 0) return delta;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Whether a row comes after the cursor in the mock's order.
 *
 * The cursor stores the sort key of the last row of the previous page, not an
 * offset: inserting a newer event or removing a row from another page cannot
 * shift the continuation, and no row is returned twice.
 */
function isAfterCursor<TData>(notification: InboxNotification<TData>, cursor: MockCursor): boolean {
  const at = Date.parse(notification.createdAt);
  const cursorAt = Date.parse(cursor.createdAt);
  if (at !== cursorAt) return at < cursorAt;
  return notification.id > cursor.id;
}

function encodeCursor(notification: InboxNotification<unknown>): string {
  return `${CURSOR_PREFIX}${encodeURIComponent(notification.createdAt)}:${encodeURIComponent(
    notification.id,
  )}`;
}

function invalidCursor(cursor: string): InboxError {
  return new InboxError({
    code: 'ADAPTER_FAILURE',
    phase: 'load',
    message: `Inboxline mock: unknown cursor ${cursor}`,
  });
}

function decodeCursor(cursor: string): MockCursor {
  if (!cursor.startsWith(CURSOR_PREFIX)) throw invalidCursor(cursor);

  const payload = cursor.slice(CURSOR_PREFIX.length);
  const separator = payload.indexOf(':');
  if (separator <= 0) throw invalidCursor(cursor);

  let createdAt: string;
  let id: string;
  try {
    createdAt = decodeURIComponent(payload.slice(0, separator));
    id = decodeURIComponent(payload.slice(separator + 1));
  } catch {
    throw invalidCursor(cursor);
  }

  if (id.length === 0 || !Number.isFinite(Date.parse(createdAt))) throw invalidCursor(cursor);
  return { createdAt, id };
}

function countUnread<TData>(store: MockContext<TData>): number {
  let count = 0;
  for (const notification of store.byId.values()) {
    if (!notification.read) count += 1;
  }
  return count;
}

function sortedNotifications<TData>(store: MockContext<TData>): InboxNotification<TData>[] {
  return [...store.byId.values()].sort(compareNotifications);
}

function insertNotification<TData>(
  store: MockContext<TData>,
  notification: InboxNotification<TData>,
): void {
  if (!isInboxNotification(notification)) {
    throw new RangeError('Inboxline mock: a stored notification must satisfy InboxNotification');
  }
  if (store.byId.has(notification.id)) {
    throw new RangeError(`Inboxline mock: duplicate notification id ${notification.id}`);
  }
  store.byId.set(notification.id, notification);
}

function notFound(id: string): InboxError {
  return new InboxError({
    code: 'NOT_FOUND',
    phase: 'mutation',
    message: `Inboxline mock: notification ${id} does not exist in this context`,
  });
}

function applicationFailure(operation: InboxMockOperation, failure: InboxMockFailure): InboxError {
  const outcome = failure.outcome ?? 'rejected';
  const phase = MUTATION_OPERATIONS.has(operation) ? 'mutation' : 'load';
  const code = failure.code ?? (outcome === 'unknown' ? 'UNKNOWN' : 'ADAPTER_FAILURE');
  return new InboxError({
    code,
    phase,
    outcome,
    message: failure.message ?? `Inboxline mock: ${operation} did not produce a usable answer`,
  });
}

/**
 * Creates an independent mock adapter.
 *
 * ```ts
 * const adapter = createMockAdapter({
 *   clock: { now: () => Date.parse('2026-10-18T13:00:00Z') },
 *   pageSize: 10,
 *   contexts: [
 *     { context: { key: 'user-1' }, notifications: fixtures },
 *   ],
 * });
 * ```
 */
export function createMockAdapter<TData = unknown, TContextData = unknown>(
  options: InboxMockOptions<TData, TContextData>,
): InboxMockAdapter<TData, TContextData> {
  if (typeof options?.clock?.now !== 'function') {
    throw new TypeError('Inboxline mock: clock with now() is required');
  }

  const pageSize = requirePageSize(options.pageSize ?? DEFAULT_PAGE_SIZE);
  let latency: InboxMockLatency = options.latencyMs ?? 0;
  requireLatency(typeof latency === 'function' ? 0 : latency);

  const contexts = new Map<string, MockContext<TData>>();
  const failures: Record<InboxMockOperation, InboxMockFailure[]> = {
    getNotifications: [],
    getUnreadCount: [],
    setReadStatus: [],
    markAllRead: [],
  };

  function ensureContext(key: string): MockContext<TData> {
    let store = contexts.get(key);
    if (!store) {
      store = { byId: new Map(), listeners: new Set() };
      contexts.set(key, store);
    }
    return store;
  }

  function latencyFor(operation: InboxMockOperation): number {
    const value = typeof latency === 'function' ? latency(operation) : latency;
    return requireLatency(value);
  }

  function takeFailure(operation: InboxMockOperation): InboxMockFailure | undefined {
    return failures[operation].shift();
  }

  function readStatus(
    store: MockContext<TData>,
    id: string,
    read: boolean,
  ): InboxReadStatusResult<TData> {
    const current = store.byId.get(id);
    if (!current) throw notFound(id);

    if (current.read === read) {
      return { notification: current, unreadCount: countUnread(store) };
    }

    const confirmed = { ...current, read };
    store.byId.set(id, confirmed);
    return { notification: confirmed, unreadCount: countUnread(store) };
  }

  function markAllRead(store: MockContext<TData>): InboxMarkAllReadResult {
    const nowMs = options.clock.now();
    if (!Number.isFinite(nowMs)) {
      throw new RangeError('Inboxline mock: clock.now() must return a finite number');
    }

    const boundary = new Date(nowMs).toISOString();
    for (const [id, notification] of store.byId) {
      if (!notification.read && Date.parse(notification.createdAt) <= nowMs) {
        store.byId.set(id, { ...notification, read: true });
      }
    }

    return { boundary, unreadCount: countUnread(store) };
  }

  function wait(operation: InboxMockOperation, signal?: AbortSignal): Promise<void> {
    if (signal?.aborted) return Promise.reject(createAbortError());

    const ms = latencyFor(operation);
    if (ms === 0) return Promise.resolve();

    return new Promise<void>((resolve, reject) => {
      let settled = false;

      const finish = (): void => {
        if (settled) return;
        settled = true;
        if (signal) signal.removeEventListener('abort', onAbort);
        resolve();
      };

      const onAbort = (): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        signal?.removeEventListener('abort', onAbort);
        reject(createAbortError());
      };

      const timer = setTimeout(finish, ms);
      signal?.addEventListener('abort', onAbort, { once: true });
    });
  }

  async function getNotifications(query: InboxListQuery<TContextData>): Promise<InboxPage<TData>> {
    const key = requireContextKey(query.context);
    await wait('getNotifications', query.signal);
    if (query.signal.aborted) throw createAbortError();

    const failure = takeFailure('getNotifications');
    if (failure) throw applicationFailure('getNotifications', failure);

    const store = ensureContext(key);
    const rows = sortedNotifications(store).filter(
      (notification) => query.filter === 'all' || !notification.read,
    );
    const cursor = query.cursor === null ? null : decodeCursor(query.cursor);
    const firstIndex = cursor === null ? 0 : rows.findIndex((row) => isAfterCursor(row, cursor));
    const from = firstIndex === -1 ? rows.length : firstIndex;
    const items = rows.slice(from, from + pageSize);
    const hasMore = from + items.length < rows.length;
    const nextCursor = hasMore && items.length > 0 ? encodeCursor(items[items.length - 1]) : null;

    return { items, nextCursor };
  }

  async function getUnreadCount(query: InboxCountQuery<TContextData>): Promise<InboxUnreadCount> {
    const key = requireContextKey(query.context);
    await wait('getUnreadCount', query.signal);
    if (query.signal.aborted) throw createAbortError();

    const failure = takeFailure('getUnreadCount');
    if (failure) throw applicationFailure('getUnreadCount', failure);

    return { unreadCount: countUnread(ensureContext(key)) };
  }

  async function setReadStatus(
    query: InboxReadStatusQuery<TContextData>,
  ): Promise<InboxReadStatusResult<TData>> {
    const key = requireContextKey(query.context);
    await wait('setReadStatus');

    const failure = takeFailure('setReadStatus');
    const store = ensureContext(key);
    if (failure?.apply) readStatus(store, query.id, query.read);
    if (failure) throw applicationFailure('setReadStatus', failure);

    return readStatus(store, query.id, query.read);
  }

  async function markAllReadQuery(
    query: InboxMarkAllQuery<TContextData>,
  ): Promise<InboxMarkAllReadResult> {
    const key = requireContextKey(query.context);
    await wait('markAllRead');

    const failure = takeFailure('markAllRead');
    const store = ensureContext(key);
    if (failure?.apply) markAllRead(store);
    if (failure) throw applicationFailure('markAllRead', failure);

    return markAllRead(store);
  }

  function subscribe(query: InboxSubscriptionQuery<TContextData>): () => void {
    const key = requireContextKey(query.context);
    const store = ensureContext(key);
    const entry = (): void => query.onInvalidate();
    store.listeners.add(entry);

    return () => {
      store.listeners.delete(entry);
    };
  }

  const adapter: InboxMockAdapter<TData, TContextData> = {
    getNotifications,
    getUnreadCount,
    setReadStatus,
    markAllRead: markAllReadQuery,
    subscribe,

    addNotification(context, notification) {
      const key = requireContextKey(context);
      insertNotification(ensureContext(key), notification);
    },

    invalidate(context) {
      const key = requireContextKey(context);
      const store = contexts.get(key);
      if (!store) return;
      for (const listener of [...store.listeners]) listener();
    },

    failNext(operation, failure = {}) {
      const checked = requireOperation(operation);
      const outcome = failure.outcome ?? 'rejected';
      const isMutation = MUTATION_OPERATIONS.has(checked);

      if (!isMutation && (failure.apply === true || outcome === 'unknown')) {
        throw new RangeError(
          `Inboxline mock: ${checked} is a load and cannot apply a change or lose its outcome`,
        );
      }
      if (isMutation && failure.apply === true && outcome !== 'unknown') {
        throw new RangeError(
          `Inboxline mock: applying a rejected ${checked} would contradict the failure`,
        );
      }

      failures[checked].push({ ...failure, outcome });
    },

    clearFailures(operation) {
      if (operation === undefined) {
        for (const name of OPERATIONS) failures[name].length = 0;
        return;
      }
      failures[requireOperation(operation)].length = 0;
    },

    setLatency(latencyMs) {
      requireLatency(typeof latencyMs === 'function' ? 0 : latencyMs);
      latency = latencyMs;
    },
  };

  for (const seed of options.contexts ?? []) {
    const key = requireContextKey(seed.context);
    if (contexts.has(key)) {
      throw new RangeError(`Inboxline mock: duplicate context seed ${key}`);
    }
    const store = ensureContext(key);
    for (const notification of seed.notifications ?? []) {
      insertNotification(store, notification);
    }
  }

  return adapter;
}
