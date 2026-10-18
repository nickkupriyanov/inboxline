/**
 * The notification source contract.
 *
 * An adapter answers four questions: which notifications a page of the list
 * holds, how many unread notifications the context has, what the read state of
 * one notification is after a change, and what happened to the whole context
 * when everything was marked read. The first two load data, the last two change
 * it, and all four receive the context, so an application that shows two
 * workspaces can serve both from the same object.
 *
 * What the core promises an adapter back:
 *
 * - A load is called with an `AbortSignal` that is aborted when the request is
 *   superseded — a changed filter, another context, a stopped controller. A real
 *   adapter passes it to `fetch`; a cancelled request is rejected and the
 *   library drops it without reporting a failure.
 * - The core keeps the server order of the page and removes duplicate ids. It
 *   never sorts, so an adapter that returns a deterministic order — newest
 *   first, ties ordered by the backend — keeps that order in the list.
 * - A mutation asks for a desired state (`read: true`) rather than for a toggle,
 *   so a retried or duplicated request cannot flip a row by accident. Mutations
 *   are not given a signal: cancelling one after the server received it would
 *   turn a known answer into an unknown outcome, which is exactly what the
 *   contract tries to avoid.
 * - The result of a mutation carries the confirmed state *and* the current
 *   server counter, because the two can change independently of each other.
 * - `getUnreadCount` covers the whole context and is independent of the filter
 *   and of the loaded pages. A page of 10 rows under a counter of 27 is a valid,
 *   expected answer.
 */
import { InboxError } from './errors';
import { isInboxTimestamp } from './time';
import type {
  InboxAuthor,
  InboxContext,
  InboxFilter,
  InboxNotification,
  InboxPage,
  InboxUnreadCount,
} from './types';

/* -------------------------------------------------------------------------- */
/*  Queries                                                                   */
/* -------------------------------------------------------------------------- */

/** What an adapter receives for one page of `getNotifications`. */
export interface InboxListQuery<TContextData = unknown> {
  /** The user/workspace to read. */
  context: InboxContext<TContextData>;
  /** The filter the visitor selected. */
  filter: InboxFilter;
  /** Opaque cursor of the requested page, or `null` for the first one. */
  cursor: string | null;
  /** Aborted when the request is superseded. Pass it to `fetch`. */
  signal: AbortSignal;
}

/** What an adapter receives for one `getUnreadCount` call. */
export interface InboxCountQuery<TContextData = unknown> {
  /** The user/workspace to read. */
  context: InboxContext<TContextData>;
  /** Aborted when the request is superseded. Pass it to `fetch`. */
  signal: AbortSignal;
}

/** What an adapter receives for one `setReadStatus` call. */
export interface InboxReadStatusQuery<TContextData = unknown> {
  /** The user/workspace whose counter and list are affected. */
  context: InboxContext<TContextData>;
  /** The notification to change. */
  id: string;
  /** The desired state, never a toggle. */
  read: boolean;
}

/** What an adapter receives for one `markAllRead` call. */
export interface InboxMarkAllQuery<TContextData = unknown> {
  /** The user/workspace whose notifications are marked read. */
  context: InboxContext<TContextData>;
}

/** What an adapter receives when it subscribes the core to invalidations. */
export interface InboxSubscriptionQuery<TContextData = unknown> {
  /** The user/workspace to watch. */
  context: InboxContext<TContextData>;
  /** Called when the adapter learns that this context's data changed. */
  onInvalidate: () => void;
}

/* -------------------------------------------------------------------------- */
/*  Results                                                                   */
/* -------------------------------------------------------------------------- */

/** The confirmed result of one `setReadStatus` call. */
export interface InboxReadStatusResult<TData = unknown> {
  /** The notification as the server now reports it, including its read state. */
  notification: InboxNotification<TData>;
  /** The current server counter for the context, the same scope as `getUnreadCount`. */
  unreadCount: number;
}

/**
 * The confirmed result of one `markAllRead` call.
 *
 * `boundary` is the moment the server applied the operation. Notifications
 * created at or before it are read; anything created after it stays unread,
 * which is why the counter in the same result is not guaranteed to be zero.
 * The boundary is what makes the operation repeatable in the application's own
 * terms after an unknown outcome: a later request is a new user action, and the
 * server applies it to the notifications that exist at that moment.
 */
export interface InboxMarkAllReadResult {
  /** Server moment of the operation, RFC 3339 with an explicit offset. */
  boundary: string;
  /** Counter the server reported after the operation. Not necessarily `0`. */
  unreadCount: number;
}

/* -------------------------------------------------------------------------- */
/*  Adapter                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * The notification source a controller works against.
 *
 * An adapter is an object of four methods, two of which read and two of which
 * write. It holds no state the core relies on: every call carries the context,
 * and every result is self-contained, so the same adapter can serve several
 * contexts and a plain function can be turned into one.
 *
 * `subscribe` is optional and only reports *that* the data changed. An adapter
 * for a REST backend typically leaves it out; one backed by a WebSocket, SSE or
 * an SDK implements it over that transport. The core never creates a connection
 * of its own.
 *
 * @typeParam TData — Application data carried by every notification.
 * @typeParam TContextData — Application data carried by the context.
 */
export interface InboxAdapter<TData = unknown, TContextData = unknown> {
  /**
   * One page of notifications for the context and filter, in the server's order.
   *
   * Return `nextCursor: null` on the last page. A cursor must be non-empty and
   * must advance: the same cursor may never be returned twice for the same
   * sequence, or paging would never end.
   */
  getNotifications(query: InboxListQuery<TContextData>): Promise<InboxPage<TData>>;
  /**
   * How many notifications are unread in the whole context, ignoring the filter
   * and the loaded pages.
   */
  getUnreadCount(query: InboxCountQuery<TContextData>): Promise<InboxUnreadCount>;
  /**
   * Sets one notification to the desired read state and answers with the
   * confirmed notification and the current server counter.
   */
  setReadStatus(query: InboxReadStatusQuery<TContextData>): Promise<InboxReadStatusResult<TData>>;
  /**
   * Marks every notification of the context read on the server and answers with
   * the boundary of the operation and the counter that followed it.
   */
  markAllRead(query: InboxMarkAllQuery<TContextData>): Promise<InboxMarkAllReadResult>;
  /**
   * Optional. Reports that the context's data changed and returns an
   * unsubscribe function. Events carry no delta: the core refreshes the counter
   * and offers the list update itself.
   */
  subscribe?(query: InboxSubscriptionQuery<TContextData>): () => void;
}

/* -------------------------------------------------------------------------- */
/*  Boundary checks                                                           */
/* -------------------------------------------------------------------------- */

/**
 * The checks below exist for adapter authors.
 *
 * A backend payload is untrusted input: a missing id, a timestamp without an
 * offset or a rolled-over date would otherwise reach the reducer and corrupt the
 * list in a way that is hard to trace back. Wrapping a payload in the matching
 * `assert…` turns that into an `InboxError` with the code
 * `ADAPTER_CONTRACT_VIOLATION`, raised where the payload was produced.
 */

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function contractViolation(message: string, phase: 'load' | 'mutation'): InboxError {
  return new InboxError({ code: 'ADAPTER_CONTRACT_VIOLATION', phase, message });
}

/** Whether a value is a usable `InboxAuthor`. */
export function isInboxAuthor(value: unknown): value is InboxAuthor {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as { id?: unknown; name?: unknown; avatarUrl?: unknown };
  if (!isNonEmptyString(candidate.name)) return false;
  if (candidate.id !== undefined && !isNonEmptyString(candidate.id)) return false;
  if (candidate.avatarUrl !== undefined && !isNonEmptyString(candidate.avatarUrl)) return false;
  return true;
}

/**
 * Whether a value is a usable notification.
 *
 * `data` is deliberately not inspected: it belongs to the application, and the
 * library has no way to know what a consumer puts there.
 */
export function isInboxNotification(value: unknown): value is InboxNotification<unknown> {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as {
    id?: unknown;
    createdAt?: unknown;
    title?: unknown;
    body?: unknown;
    author?: unknown;
    icon?: unknown;
    read?: unknown;
  };
  if (!isNonEmptyString(candidate.id)) return false;
  if (!isNonEmptyString(candidate.title)) return false;
  if (!isInboxTimestamp(candidate.createdAt)) return false;
  if (typeof candidate.read !== 'boolean') return false;
  if (candidate.body !== undefined && typeof candidate.body !== 'string') return false;
  if (candidate.icon !== undefined && !isNonEmptyString(candidate.icon)) return false;
  if (candidate.author !== undefined && !isInboxAuthor(candidate.author)) return false;
  return true;
}

/**
 * Whether a value is a usable page: a list of valid notifications and a
 * `nextCursor` that is either `null` or a non-empty string.
 */
export function isInboxPage(value: unknown): value is InboxPage<unknown> {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as { items?: unknown; nextCursor?: unknown };
  if (!Array.isArray(candidate.items)) return false;
  if (!candidate.items.every((item) => isInboxNotification(item))) return false;
  if (candidate.nextCursor !== null && !isNonEmptyString(candidate.nextCursor)) return false;
  return true;
}

/** Whether a value is a usable `{ unreadCount }` payload. */
export function isInboxUnreadCount(value: unknown): value is InboxUnreadCount {
  if (typeof value !== 'object' || value === null) return false;
  return isNonNegativeInteger((value as { unreadCount?: unknown }).unreadCount);
}

/** Whether a value is a usable `setReadStatus` result. */
export function isInboxReadStatusResult(value: unknown): value is InboxReadStatusResult<unknown> {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as { notification?: unknown; unreadCount?: unknown };
  return isInboxNotification(candidate.notification) && isNonNegativeInteger(candidate.unreadCount);
}

/** Whether a value is a usable `markAllRead` result. */
export function isInboxMarkAllReadResult(value: unknown): value is InboxMarkAllReadResult {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as { boundary?: unknown; unreadCount?: unknown };
  return isInboxTimestamp(candidate.boundary) && isNonNegativeInteger(candidate.unreadCount);
}

/**
 * Returns the page an adapter produced, or throws an `InboxError` with the code
 * `ADAPTER_CONTRACT_VIOLATION` when the payload cannot be used.
 *
 * ```ts
 * const raw: unknown = await response.json();
 * return assertInboxPage(raw);
 * ```
 */
export function assertInboxPage(value: unknown): InboxPage<unknown> {
  if (!isInboxPage(value)) {
    throw contractViolation(
      'Inboxline: getNotifications must resolve to { items, nextCursor } with valid notifications',
      'load',
    );
  }
  return value;
}

/** Returns the counter an adapter produced, or throws `ADAPTER_CONTRACT_VIOLATION`. */
export function assertInboxUnreadCount(value: unknown): InboxUnreadCount {
  if (!isInboxUnreadCount(value)) {
    throw contractViolation(
      'Inboxline: getUnreadCount must resolve to { unreadCount } with a non-negative integer',
      'load',
    );
  }
  return value;
}

/** Returns the `setReadStatus` result an adapter produced, or throws `ADAPTER_CONTRACT_VIOLATION`. */
export function assertInboxReadStatusResult(value: unknown): InboxReadStatusResult<unknown> {
  if (!isInboxReadStatusResult(value)) {
    throw contractViolation(
      'Inboxline: setReadStatus must resolve to { notification, unreadCount } with a valid notification',
      'mutation',
    );
  }
  return value;
}

/** Returns the `markAllRead` result an adapter produced, or throws `ADAPTER_CONTRACT_VIOLATION`. */
export function assertInboxMarkAllReadResult(value: unknown): InboxMarkAllReadResult {
  if (!isInboxMarkAllReadResult(value)) {
    throw contractViolation(
      'Inboxline: markAllRead must resolve to { boundary, unreadCount } with an RFC 3339 boundary',
      'mutation',
    );
  }
  return value;
}
