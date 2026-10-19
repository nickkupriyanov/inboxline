/**
 * The inbox controller and the vocabulary an application speaks with it.
 *
 * Framework-free and free of I/O policy: the controller owns the reducer state,
 * the resolved configuration, the time reference and the requests, and exposes
 * all of that as one immutable snapshot for a binding to render.
 *
 * These rules shape it:
 *
 * - **Nothing happens at creation.** No request, no subscription, no timer and
 *   no callback. A binding calls `start()` when it is live and `stop()` when it
 *   goes away; both are idempotent, so a Strict Mode double mount is harmless.
 * - **Requests carry a generation.** Every load remembers the request object it
 *   belongs to, and despite the reducer's own token guards the controller also
 *   drops an answer whose request is no longer the active one. A changed
 *   context, a replaced adapter, a stopped controller and a newer refresh
 *   therefore cannot let an old response move the state.
 * - **Individual mutations are serialised.** At most one `setReadStatus` is in
 *   flight; the rest wait in queue order. The pending layer is recorded before
 *   the request goes out, so a row shows the desired state immediately, and a
 *   confirmed rejection retracts exactly that row. A lost answer keeps the row
 *   in the `unknown` state and triggers a reconciliation instead of a retry.
 * - **The list and the counter are independent.** They load in parallel, fail
 *   separately and keep their own statuses, because a page of ten rows under a
 *   counter of 27 is a normal answer and either call may fail on its own. A
 *   confirmed read carries a newer counter, so it supersedes a counter request
 *   that was started earlier.
 * - **One chain at a time.** A first page (a start, a refresh, another filter or
 *   another context) supersedes the pages appended before it, and a page load
 *   supersedes the next one only after it has settled. Duplicate rows are folded
 *   into the first occurrence, and a cursor the chain has already requested ends
 *   the list instead of looping.
 * - **Time is injected.** The snapshot is derived from the injected clock on
 *   every read; `refreshTime()` lets a binding announce that the wall clock
 *   moved, and the derivation is memoised by the minute so repeated reads in the
 *   same minute return the very same object.
 *
 * The controlled UI values are deliberately *not* part of this vocabulary. The
 * open state of the bell panel, the focus and the portal belong to the binding,
 * and the filter a visitor picked is a controlled value there
 * (`filter`/`defaultFilter`/`onFilterChange`). They reach the core through these
 * actions, which keeps one source of truth: the server data in the controller.
 */
import { assertInboxPage, assertInboxReadStatusResult, assertInboxUnreadCount } from './adapter';
import type { InboxAdapter, InboxReadStatusResult } from './adapter';
import { resolveInboxConfig } from './config';
import type { InboxConfig, InboxConfigInput } from './config';
import {
  DEFAULT_FILTER,
  DEFAULT_INBOX_CONTEXT,
  isInboxContext,
  isInboxFilter,
  isSameInboxContext,
} from './context';
import { createInboxViewMemo, inboxViewKey } from './derive';
import type { InboxView } from './derive';
import {
  InboxError,
  createUnknownOutcomeError,
  isAbortError,
  isInboxError,
  toInboxError,
} from './errors';
import { createInboxState, inboxReducer } from './reducer';
import type { InboxAction, InboxState } from './reducer';
import { createInboxTimeAnchor, systemInboxClock } from './time';
import type {
  InboxClock,
  InboxContext,
  InboxFilter,
  InboxNotification,
  InboxPage,
  InboxTimeAnchor,
} from './types';

/* -------------------------------------------------------------------------- */
/*  Public shape                                                               */
/* -------------------------------------------------------------------------- */

/** The immutable snapshot a binding renders: the raw state and the derived view. */
export interface InboxSnapshot<TData = unknown> {
  /** Bumped whenever the snapshot below changes; stable while nothing does. */
  revision: number;
  /** The reducer state, exactly as the last transition left it. */
  state: Readonly<InboxState<TData>>;
  /** The model a binding renders; see `deriveInboxView()`. */
  view: Readonly<InboxView<TData>>;
}

/**
 * The operations a controller exposes.
 *
 * Every action that talks to the server is safe to call at any time: a load that
 * is superseded by a newer one is abandoned, a mutation is queued behind the
 * mutations already in flight, and a bulk mark-all runs on its own rather than
 * inside that queue.
 *
 * The promises resolve once the operation has settled, successfully or not, and
 * never reject: a failure is reported through {@link InboxCallbacks.onError} and
 * through the snapshot, so a binding never has to attach a `.catch()` to keep a
 * console clean.
 *
 * Iterations 5 to 7 implement the lifecycle, paging and individual read
 * actions: `refresh()`, `retry()`, `setFilter()`, `loadMore()`, `setRead()` and
 * `reconcile()`, together with `setContext()` and `setAdapter()`. `markAllRead`
 * is still a no-op until Iteration 8.
 *
 * @typeParam TData — Application data carried by every notification.
 * @typeParam TContextData — Application data carried by the context.
 */
export interface InboxActions<TData = unknown, TContextData = unknown> {
  /**
   * Selects the filter of the list. The unread counter is not affected.
   *
   * A different filter abandons the request and the rows of the previous one and,
   * when the controller is started, loads its first page. Choosing the filter
   * that is already active does nothing.
   */
  setFilter(filter: InboxFilter): void;
  /** Reloads the first page and the counter, replacing the loaded list. */
  refresh(): Promise<void>;
  /**
   * Repeats exactly the loads that failed, leaving the successful ones alone.
   * A failed next page is retried from the same cursor; when the first page
   * itself failed, its successful retry replaces the chain instead. When nothing
   * failed it does nothing and resolves.
   */
  retry(): Promise<void>;
  /**
   * Appends the next page of the current filter and context, when there is one.
   *
   * A second call while a page is already loading is ignored and resolves. When
   * the previous page failed, this requests that same page again; the rows that
   * are already shown stay in place.
   */
  loadMore(): Promise<void>;
  /**
   * Sets one notification to the desired read state and keeps it in the queue
   * until the server confirms it. `read` is a state, not a toggle.
   *
   * Individual mutations are serialised: at most one request is in flight, and
   * the rows already asked for keep their order. A second request for the same
   * id is ignored while its operation is queued, in flight or waiting for
   * reconciliation, and a request for a state the notification already has is
   * not sent. Only a loaded notification can be changed, because the confirmed
   * state the operation starts from is what the optimistic counter is corrected
   * with.
   */
  setRead(id: string, read: boolean): Promise<void>;
  /**
   * Marks every notification of the context read on the server, including the
   * ones that were never loaded. Refused while individual mutations are queued.
   */
  markAllRead(): Promise<void>;
  /**
   * Reads the server state again after an unknown outcome, without retrying it.
   *
   * A successful refresh of the first page and the counter resolves operations
   * whose answers were lost: their rows then show the confirmed server state. A
   * failed one keeps them in the `unknown` state for a later attempt. With
   * nothing to reconcile the action does nothing.
   */
  reconcile(): Promise<void>;
  /** Replaces the context. In-flight work of the previous one is abandoned. */
  setContext(context: InboxContext<TContextData>): void;
  /** Replaces the adapter. In-flight work of the previous one is abandoned. */
  setAdapter(adapter: InboxAdapter<TData, TContextData>): void;
}

/**
 * The callbacks an application passes to a controller.
 *
 * They are invoked after the state has been updated, and an exception thrown
 * inside one is contained: it is not reported as a server failure and never
 * triggers a second mutation.
 *
 * @typeParam TData — Application data carried by every notification.
 */
export interface InboxCallbacks<TData = unknown> {
  /**
   * The visitor activated a notification. The application navigates from here —
   * the library never opens a link on its own — typically using the payload in
   * `notification.data`.
   */
  onNotificationClick?(notification: InboxNotification<TData>): void;
  /**
   * A request failed in a way the application may want to surface. A cancelled
   * request is not a failure and never arrives here.
   */
  onError?(error: InboxError): void;
}

/** Everything `createInboxController()` accepts. */
export interface InboxControllerOptions<TData = unknown, TContextData = unknown> {
  /** The notification source. Required: the inbox cannot know a list on its own. */
  adapter: InboxAdapter<TData, TContextData>;
  /** The user/workspace to read. Default: the implicit context (`'default'`). */
  context?: InboxContext<TContextData>;
  /** The filter the first page is loaded with. Default: `'all'`. */
  filter?: InboxFilter;
  /** Presentation settings: locale, time zone and message overrides. */
  config?: InboxConfigInput;
  /** Time source for the derived view. Default: {@link systemInboxClock}. */
  clock?: InboxClock;
  /** Application callbacks. Their exceptions are contained. */
  callbacks?: InboxCallbacks<TData>;
}

/** The inbox, as the application drives it. */
export interface InboxController<TData = unknown, TContextData = unknown> {
  /**
   * The current snapshot.
   *
   * The same object is returned until the model, the configuration or the
   * rendered minute actually changes, which is what lets a binding compare by
   * reference.
   */
  getSnapshot(): InboxSnapshot<TData>;
  /** Registers a listener. The returned function removes exactly that listener. */
  subscribe(listener: () => void): () => void;
  /** Starts the initial page and counter load. Idempotent. */
  start(): void;
  /** Stops listening to the outside world and cancels pending loads. Idempotent. */
  stop(): void;
  /**
   * Re-reads the clock and notifies listeners when the rendered time changed.
   *
   * Relative labels age while the page stays open; a binding calls this when the
   * tab becomes visible again or when its own minute ticker fires. It never
   * starts a request and never changes server data.
   */
  refreshTime(): void;
  /** Replaces the presentation configuration without touching the data. */
  updateConfig(config: InboxConfigInput): void;
  /** The operations a binding calls. */
  readonly actions: InboxActions<TData, TContextData>;
}

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                    */
/* -------------------------------------------------------------------------- */

interface ActiveRequest {
  readonly token: number;
  readonly controller: AbortController;
}

/**
 * One individual read operation of the controller.
 *
 * It is not the reducer's `InboxPendingRead`: that one is the visible layer,
 * while this one also carries the promise the action returns and the source the
 * request belongs to. `sourceRevision` is what makes an answer of a replaced
 * adapter or another context uninteresting even before the reducer sees it.
 */
interface QueuedRead {
  readonly id: string;
  readonly read: boolean;
  readonly previousRead: boolean;
  readonly token: number;
  readonly sourceRevision: number;
  settled: boolean;
  settle(): void;
}

function requireContext<TContextData>(context: InboxContext<TContextData>): void {
  if (!isInboxContext(context)) {
    throw new RangeError('Inboxline: context.key must be a non-empty string');
  }
}

function requireFilter(filter: InboxFilter): void {
  if (!isInboxFilter(filter)) {
    throw new RangeError('Inboxline: filter must be "all" or "unread"');
  }
}

function requireNotificationId(id: string): void {
  if (typeof id !== 'string' || id.length === 0) {
    throw new RangeError('Inboxline: a notification id must be a non-empty string');
  }
}

/**
 * Structural comparison of two resolved configurations, so re-supplying equal
 * values — which a binding does on every render — never invalidates a snapshot.
 */
function sameValue(a: unknown, b: unknown, depth = 0): boolean {
  if (a === b) return true;
  if (depth >= 8) return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((item, index) => sameValue(item, b[index], depth + 1));
  }
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  const left = a as Record<string, unknown>;
  const right = b as Record<string, unknown>;
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  for (const key of keys) {
    if (!sameValue(left[key], right[key], depth + 1)) return false;
  }
  return true;
}

function sameConfig(a: InboxConfig, b: InboxConfig): boolean {
  return a.locale === b.locale && a.timeZone === b.timeZone && sameValue(a.messages, b.messages);
}

/* -------------------------------------------------------------------------- */
/*  Implementation                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Creates a controller. Creating one performs no request, no subscription and
 * no callback; the first side effect happens in `start()`.
 *
 * ```ts
 * const inbox = createInboxController({
 *   adapter,
 *   context: { key: 'user-1' },
 *   clock: { now: () => Date.now() },
 *   callbacks: { onError: (error) => report(error) },
 * });
 *
 * inbox.start();
 * await inbox.actions.refresh();
 * const { view } = inbox.getSnapshot();
 * ```
 */
export function createInboxController<TData = unknown, TContextData = unknown>(
  options: InboxControllerOptions<TData, TContextData>,
): InboxController<TData, TContextData> {
  let adapter = options.adapter;
  const clock = options.clock ?? systemInboxClock();
  const callbacks = options.callbacks ?? {};

  let context = (options.context ?? DEFAULT_INBOX_CONTEXT) as InboxContext<TContextData>;
  requireContext(context);
  const initialFilter = options.filter ?? DEFAULT_FILTER;
  requireFilter(initialFilter);

  let config = resolveInboxConfig(options.config);
  let state = createInboxState<TData>({
    contextKey: context.key,
    filter: initialFilter,
  });

  /* -- bookkeeping ---------------------------------------------------------- */

  const listeners = new Set<() => void>();
  const memo = createInboxViewMemo<TData>();
  let stateRevision = 0;
  let configRevision = 0;
  let snapshotRevision = 0;
  let cachedKey = '';
  let lastViewKey = '';
  let cached: InboxSnapshot<TData> | null = null;

  let started = false;
  let nextToken = 0;
  let activeList: ActiveRequest | null = null;
  let activePage: ActiveRequest | null = null;
  let activeCount: ActiveRequest | null = null;
  /**
   * The cursors of the current chain that have already been requested.
   *
   * A correct adapter never repeats a cursor for the same sequence, but the core
   * does not have to trust that: a cursor seen before is treated as the end of
   * the list. The chain starts over with every first page.
   */
  let requestedCursors = new Set<string>();

  /**
   * Which source the state belongs to.
   *
   * A changed context key or a replaced adapter makes the generation stale, so
   * an answer of the previous source is dropped before it can reach `apply()`.
   * A different filter or a replaced `context.data` under the same key keeps it:
   * both stay inside the same scope.
   */
  let sourceRevision = 0;
  /** Individual read operations waiting for the queue to reach them. */
  let readQueue: QueuedRead[] = [];
  /** The one read operation currently talking to the adapter, if any. */
  let activeRead: QueuedRead | null = null;
  /** Guards the drain loop against a second, concurrent loop. */
  let readDraining = false;
  /** Coalesces concurrent reconciliation attempts into one refresh. */
  let reconciliation: Promise<void> | null = null;

  function notify(): void {
    for (const listener of [...listeners]) listener();
  }

  /**
   * Runs one transition and tells everyone who is listening.
   *
   * The state changes before anyone is notified, so a listener always reads the
   * value that goes with the notification.
   */
  function apply(action: InboxAction<TData>): void {
    const previous = state;
    const next = inboxReducer(state, action);
    if (next === previous) return;

    state = next;
    stateRevision += 1;
    notify();
  }

  /**
   * Reports a failure after the snapshot already holds it.
   *
   * An exception thrown by the application is contained on purpose: a broken
   * reporter must not turn a settled request into a rejected action, and it must
   * not make the controller run the request again.
   */
  function reportError(error: InboxError): void {
    try {
      callbacks.onError?.(error);
    } catch {
      // The failure is already in the snapshot; the application's own error is
      // not a server error and must not reset or repeat anything here.
    }
  }

  function cancelLoads(): void {
    activeList?.controller.abort();
    activeList = null;
    activePage?.controller.abort();
    activePage = null;
    activeCount?.controller.abort();
    activeCount = null;
  }

  function cancelList(): void {
    activeList?.controller.abort();
    activeList = null;
  }

  function cancelPage(): void {
    activePage?.controller.abort();
    activePage = null;
  }

  /* -- snapshot ------------------------------------------------------------- */

  function anchorNow(): InboxTimeAnchor {
    const nowMs = clock.now();
    return createInboxTimeAnchor(Number.isFinite(nowMs) ? nowMs : 0, config.timeZone);
  }

  function snapshotKey(anchor: InboxTimeAnchor): string {
    return inboxViewKey(stateRevision, configRevision, anchor);
  }

  function getSnapshot(): InboxSnapshot<TData> {
    const anchor = anchorNow();
    const key = snapshotKey(anchor);
    lastViewKey = key;

    if (cached !== null && key === cachedKey) return cached;

    snapshotRevision += 1;
    cachedKey = key;
    cached = {
      revision: snapshotRevision,
      state,
      view: memo.get(key, state, config, anchor),
    };
    return cached;
  }

  /* -- loading -------------------------------------------------------------- */

  async function runList(request: ActiveRequest): Promise<boolean> {
    try {
      const page = assertInboxPage(
        await adapter.getNotifications({
          context,
          filter: state.filter,
          cursor: null,
          signal: request.controller.signal,
        }),
      ) as InboxPage<TData>;

      if (activeList !== request) return false;
      apply({ type: 'listLoaded', token: request.token, page });
      return true;
    } catch (error) {
      // A cancelled or superseded request is not a failure: it never reaches
      // `onError` and never moves the state.
      if (activeList !== request || request.controller.signal.aborted || isAbortError(error)) {
        return false;
      }

      const failure = toInboxError(error, 'ADAPTER_FAILURE', 'load');
      apply({ type: 'listFailed', token: request.token, error: failure });
      reportError(failure);
      return false;
    } finally {
      if (activeList === request) activeList = null;
    }
  }

  async function runPage(request: ActiveRequest, cursor: string): Promise<void> {
    try {
      const page = assertInboxPage(
        await adapter.getNotifications({
          context,
          filter: state.filter,
          cursor,
          signal: request.controller.signal,
        }),
      ) as InboxPage<TData>;

      if (activePage !== request) return;

      // A cursor this chain has already asked for would start a cycle: the rows
      // of the answer are still merged, but the list honestly ends there.
      const nextCursor =
        page.nextCursor !== null && requestedCursors.has(page.nextCursor) ? null : page.nextCursor;
      apply({
        type: 'pageLoaded',
        token: request.token,
        page: nextCursor === page.nextCursor ? page : { ...page, nextCursor },
      });
    } catch (error) {
      if (activePage !== request || request.controller.signal.aborted || isAbortError(error)) {
        return;
      }

      const failure = toInboxError(error, 'ADAPTER_FAILURE', 'load');
      apply({ type: 'pageFailed', token: request.token, error: failure });
      reportError(failure);
    } finally {
      if (activePage === request) activePage = null;
    }
  }

  async function runCount(request: ActiveRequest): Promise<boolean> {
    try {
      const { unreadCount } = assertInboxUnreadCount(
        await adapter.getUnreadCount({
          context,
          signal: request.controller.signal,
        }),
      );

      if (activeCount !== request) return false;
      apply({ type: 'countLoaded', token: request.token, unreadCount });
      return true;
    } catch (error) {
      if (activeCount !== request || request.controller.signal.aborted || isAbortError(error)) {
        return false;
      }

      const failure = toInboxError(error, 'ADAPTER_FAILURE', 'load');
      apply({ type: 'countFailed', token: request.token, error: failure });
      reportError(failure);
      return false;
    } finally {
      if (activeCount === request) activeCount = null;
    }
  }

  function loadList(): Promise<boolean> {
    if (!started) return Promise.resolve(false);

    // A first page supersedes both the previous first page and the page that was
    // being appended. The old requests are aborted and, even if the adapter
    // ignores the signal, their answers are dropped by the identity checks.
    cancelList();
    cancelPage();
    requestedCursors = new Set<string>();

    const request: ActiveRequest = {
      token: (nextToken += 1),
      controller: new AbortController(),
    };
    activeList = request;
    apply({ type: 'listLoading', token: request.token });

    if (activeList !== request || !started) return Promise.resolve(false);
    return runList(request);
  }

  function loadPage(): Promise<void> {
    if (!started) return Promise.resolve();
    if (state.listStatus !== 'ready') return Promise.resolve();
    if (state.pageStatus === 'loading') return Promise.resolve();

    const cursor = state.nextCursor;
    if (cursor === null) return Promise.resolve();

    const request: ActiveRequest = {
      token: (nextToken += 1),
      controller: new AbortController(),
    };
    activePage = request;
    requestedCursors.add(cursor);
    apply({ type: 'pageLoading', token: request.token });

    if (activePage !== request || !started) return Promise.resolve();
    return runPage(request, cursor);
  }

  function loadCount(): Promise<boolean> {
    if (!started) return Promise.resolve(false);

    activeCount?.controller.abort();
    const request: ActiveRequest = {
      token: (nextToken += 1),
      controller: new AbortController(),
    };
    activeCount = request;
    apply({ type: 'countLoading', token: request.token });

    if (activeCount !== request || !started) return Promise.resolve(false);
    return runCount(request);
  }

  /* -- individual read operations ------------------------------------------- */

  function hasUnknownReads(): boolean {
    return state.pending.readOrder.some((id) => state.pending.reads[id]?.status === 'unknown');
  }

  /** Resolves the promise an action returned, at most once. */
  function settleRead(operation: QueuedRead): void {
    if (operation.settled) return;
    operation.settled = true;
    operation.settle();
  }

  /**
   * Retracts the optimistic layer of one operation without reporting a failure.
   *
   * Used when the operation is abandoned — a replaced adapter, a cleared queue —
   * rather than refused by the server. The reducer drops the layer; the answer of
   * an in-flight request is then dropped by the source generation.
   */
  function retractRead(operation: QueuedRead): void {
    apply({ type: 'readFailed', token: operation.token, id: operation.id });
  }

  /** Drops the operations that have not reached the adapter yet. */
  function clearQueuedReads(): void {
    const queued = readQueue;
    readQueue = [];
    for (const operation of queued) {
      retractRead(operation);
      settleRead(operation);
    }
  }

  /**
   * Abandons every individual operation of the current source.
   *
   * The caller has already advanced `sourceRevision`, so the answer of the
   * in-flight request cannot reach the state even though the request itself
   * cannot be cancelled any more.
   */
  function abandonReads(): void {
    clearQueuedReads();
    if (activeRead === null) return;
    retractRead(activeRead);
    settleRead(activeRead);
  }

  /**
   * Sends the queued operations one at a time.
   *
   * The loop is the serialisation the contract asks for: a row is sent to the
   * adapter only after the previous operation settled, successfully or not. An
   * operation added while the loop runs is picked up by the same loop.
   */
  function drainReads(): void {
    if (readDraining || activeRead !== null) return;
    readDraining = true;

    void (async () => {
      try {
        while (readQueue.length > 0) {
          const operation = readQueue.shift() as QueuedRead;
          activeRead = operation;
          try {
            await runRead(operation);
          } finally {
            activeRead = null;
            settleRead(operation);
          }
        }
      } finally {
        readDraining = false;
      }
    })();
  }

  /**
   * Sends one read operation and settles its layer.
   *
   * A successful answer is the server's own row and counter, so the counter load
   * that was started earlier is superseded: it is aborted and its late answer is
   * dropped by the identity check, because the mutation result describes the
   * same scope more recently. A confirmed refusal rolls back this operation
   * only; a lost answer keeps it as `unknown` and reconciles instead of
   * repeating the mutation.
   */
  async function runRead(operation: QueuedRead): Promise<void> {
    const revision = operation.sourceRevision;

    try {
      const result = assertInboxReadStatusResult(
        await adapter.setReadStatus({
          context,
          id: operation.id,
          read: operation.read,
        }),
      ) as InboxReadStatusResult<TData>;

      if (revision !== sourceRevision) return;
      if (result.notification.id !== operation.id) {
        throw new InboxError({
          code: 'ADAPTER_CONTRACT_VIOLATION',
          phase: 'mutation',
          message: `Inboxline: setReadStatus answered about ${result.notification.id} instead of ${operation.id}`,
        });
      }

      const pending = state.pending.reads[operation.id];
      if (!pending || pending.token !== operation.token) return;

      activeCount?.controller.abort();
      activeCount = null;
      apply({
        type: 'readConfirmed',
        token: operation.token,
        notification: result.notification,
        unreadCount: result.unreadCount,
      });
    } catch (error) {
      if (revision !== sourceRevision) return;

      // An adapter that states its outcome is trusted. Anything else — a thrown
      // `TypeError` from `fetch`, a timeout, a closed connection — could have
      // happened after the server applied the change, so it is treated as
      // unknown instead of as a refusal the application might act on.
      const failure = isInboxError(error) ? error : createUnknownOutcomeError(error);

      if (failure.outcome === 'unknown') {
        apply({ type: 'readUnknown', token: operation.token, id: operation.id });
        reportError(failure);
        await reconcileReads();
        return;
      }

      apply({ type: 'readFailed', token: operation.token, id: operation.id });
      reportError(failure);
    }
  }

  function enqueueRead(id: string, read: boolean): Promise<void> {
    if (!started) return Promise.resolve();
    if (!Object.hasOwn(state.byId, id)) return Promise.resolve();

    const confirmed = state.byId[id];
    if (confirmed === undefined || confirmed.read === read) return Promise.resolve();
    // One operation per row: a repeated request for the desired state and an
    // opposite one are both ignored while the first is not settled.
    if (Object.hasOwn(state.pending.reads, id)) return Promise.resolve();

    let settle: () => void = () => {};
    const settled = new Promise<void>((resolve) => {
      settle = resolve;
    });
    const operation: QueuedRead = {
      id,
      read,
      previousRead: confirmed.read,
      token: (nextToken += 1),
      sourceRevision,
      settled: false,
      settle,
    };

    // The layer is visible before the request leaves, so the row and the
    // projected counter answer the click immediately.
    apply({
      type: 'readPending',
      token: operation.token,
      id,
      read,
      previousRead: confirmed.read,
    });
    readQueue.push(operation);
    drainReads();
    return settled;
  }

  /**
   * Reconciles operations whose answer was lost.
   *
   * It never repeats the mutation: a successful refresh of the first page and
   * the counter is what resolves the unknown rows, because those two answers are
   * the confirmed server state. Concurrent attempts share one refresh.
   */
  function reconcileReads(): Promise<void> {
    if (!started || !hasUnknownReads()) return Promise.resolve();
    if (reconciliation !== null) return reconciliation;

    const request = refresh().finally(() => {
      if (reconciliation === request) reconciliation = null;
    });
    reconciliation = request;
    return request;
  }

  async function refresh(): Promise<void> {
    if (!started) return;
    // The two calls answer different questions and may fail independently; the
    // action settles when both have, without rejecting either way.
    const revision = sourceRevision;
    const [listLoaded, countLoaded] = await Promise.all([loadList(), loadCount()]);
    // Two confirmed answers are authoritative: whatever an unknown operation did
    // on the server is now part of the loaded rows and the counter.
    if (listLoaded && countLoaded && revision === sourceRevision) {
      apply({ type: 'readsReconciled' });
    }
  }

  async function retry(): Promise<void> {
    if (!started) return;
    // Opposite of `refresh`: only the failed loads are repeated, so a successful
    // counter is not asked again just because the list failed (and vice versa).
    // A failed first page replaces the chain, so retrying the page of the old
    // chain at the same time would race with that replacement.
    const pending: Promise<boolean>[] = [];
    if (state.listStatus === 'error') {
      pending.push(loadList());
    } else if (state.pageStatus === 'error') {
      pending.push(loadPage().then(() => false));
    }
    if (state.countStatus === 'error') pending.push(loadCount());
    await Promise.all(pending);
  }

  /* -- the actions ---------------------------------------------------------- */

  const actions: InboxActions<TData, TContextData> = {
    setFilter(filter) {
      requireFilter(filter);
      if (filter === state.filter) return;

      // The rows, the cursor and both list requests belong to the filter the
      // visitor has left. The counter does not: it describes the whole context,
      // so its value and its in-flight request are left alone.
      cancelList();
      cancelPage();
      requestedCursors = new Set<string>();
      apply({ type: 'setFilter', filter });

      if (started) void loadList();
    },

    async refresh() {
      await refresh();
    },

    async retry() {
      await retry();
    },

    async loadMore() {
      await loadPage();
    },

    setRead(id, read) {
      requireNotificationId(id);
      if (typeof read !== 'boolean') return Promise.resolve();
      return enqueueRead(id, read);
    },

    async markAllRead() {
      // Iteration 8 owns the bulk operation.
    },

    async reconcile() {
      await reconcileReads();
    },

    setContext(next) {
      requireContext(next);

      if (isSameInboxContext(context, next)) {
        // The same user/workspace: `data` may carry a rotated token and has to be
        // used by the following requests, but the loaded rows, the counter and
        // the cursors still belong to this context. Nothing is reloaded.
        context = next;
        return;
      }

      // A different user/workspace: abandon the in-flight work before the state
      // is reset. The reducer's generations restart, so the controller's own
      // monotonic tokens and the active-request identity are what keep a late
      // answer out.
      cancelLoads();
      sourceRevision += 1;
      abandonReads();
      context = next;
      apply({ type: 'contextChanged', contextKey: next.key });

      if (started) void refresh();
    },

    setAdapter(next) {
      if (next === adapter) return;

      adapter = next;
      // Everything the previous adapter was asked for belongs to a source that
      // no longer exists, including the operations still in the queue.
      sourceRevision += 1;
      abandonReads();
      if (!started) return;

      // The list it already produced stays on screen until the new first page
      // arrives, and `refresh` aborts whatever load was in flight.
      void refresh();
    },
  };

  /* -- public API ----------------------------------------------------------- */

  return {
    getSnapshot,

    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    refreshTime() {
      const key = snapshotKey(anchorNow());
      if (key === lastViewKey) return;
      lastViewKey = key;
      notify();
    },

    updateConfig(next) {
      const resolved = resolveInboxConfig(next);
      if (sameConfig(config, resolved)) return;

      config = resolved;
      configRevision += 1;
      notify();
    },

    actions,

    start() {
      if (started) return;
      started = true;
      void refresh();
    },

    stop() {
      if (!started) return;
      started = false;
      cancelLoads();
      // A mutation that has already reached the adapter cannot be cancelled
      // without turning a known answer into an unknown outcome: it is left to
      // settle. The operations that have not left yet are dropped with their
      // optimistic layer, so stopping does not send work behind the UI's back.
      clearQueuedReads();
    },
  };
}
