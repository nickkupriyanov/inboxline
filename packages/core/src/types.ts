/**
 * The public domain model of Inboxline.
 *
 * Everything a binding needs in order to show a notification — its identity, its
 * creation time, its text, its author, the server read state and the
 * application's own data — plus the context, the filter and the error
 * vocabulary, is declared here and nowhere else.
 *
 * The module is pure types: no runtime code, no React and no DOM, so importing
 * it can never touch `window`. The runtime helpers that belong to this model
 * live next to it: `./context` for the context and the filter, `./time` for
 * timestamp checks, `./errors` for the error class, `./adapter` for the adapter
 * contract and `./controller` for the actions an application may call.
 */

/* -------------------------------------------------------------------------- */
/*  Notification                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Which notifications a list request may return.
 *
 * The filter narrows the list only. It never changes the meaning of the global
 * unread counter, which always covers the whole context — see
 * {@link InboxContext}.
 */
export type InboxFilter = 'all' | 'unread';

/**
 * The person or system a notification came from.
 *
 * Everything except `name` is optional: an adapter that only knows a display
 * name is a valid adapter, and the list renders without an avatar.
 */
export interface InboxAuthor {
  /** Stable id of the author inside the application, when the backend has one. */
  id?: string;
  /** Display name. Used as the accessible text of the avatar. */
  name: string;
  /** Avatar image URL. A missing or broken image falls back to initials. */
  avatarUrl?: string;
}

/**
 * One notification as the server reports it.
 *
 * `id` is the identity of the notification: deduplication, row keys and the read
 * status call all use it, and it must stay stable for the whole lifetime of the
 * record. It is never derived from the position in a page, from the title or
 * from `createdAt`, because two notifications may share any of those.
 *
 * `createdAt` is RFC 3339 with an explicit offset ([`isInboxTimestamp`](./time.ts)
 * checks it at the adapter boundary). An explicit offset is required so that the
 * same payload means the same instant on the server, in the browser and in a
 * test.
 *
 * `read` is the *server* state of the notification, not the optimistic layer:
 * the core keeps pending changes separately, so a queued mutation never rewrites
 * the confirmed value it started from.
 *
 * `data` carries whatever the application needs in order to react to a
 * notification — an order id, a deep link, a payload for an analytics call. The
 * library never reads it and never renders it as markup.
 *
 * @typeParam TData — Application data carried by every notification of one
 * adapter. `unknown` by default, and never `any`.
 */
export interface InboxNotification<TData = unknown> {
  /** Stable notification id. Unique inside the context. */
  id: string;
  /** Creation time, RFC 3339 with an explicit `Z` or `±HH:MM` offset. */
  createdAt: string;
  /** Human title. Rendered as text, never as markup. */
  title: string;
  /** Optional body text. Rendered as plain text. */
  body?: string;
  /** Author, shown when the backend knows one. */
  author?: InboxAuthor;
  /** Icon image URL for this notification. */
  icon?: string;
  /** Confirmed server read state. */
  read: boolean;
  /** Typed application data. The library never interprets it. */
  data?: TData;
}

/**
 * One cursor page of notifications.
 *
 * `nextCursor` is opaque: the core only passes it back to the adapter and never
 * parses, compares or sorts it. `null` means the server has no further rows for
 * the current filter, so a cursor is either `null` or a non-empty string, and a
 * cursor must never repeat itself — otherwise paging would loop.
 */
export interface InboxPage<TData = unknown> {
  /** The page in the server's order: newest first. */
  items: InboxNotification<TData>[];
  /** Opaque cursor of the next page, or `null` at the end of the list. */
  nextCursor: string | null;
}

/**
 * The global unread counter of one context.
 *
 * This value only ever comes from the server. The number of loaded rows, or the
 * number of unread rows the client happens to hold, is not the counter: a page
 * of 10 rows can perfectly well sit under a counter of 27.
 */
export interface InboxUnreadCount {
  /** Unread notifications in the whole context, as the server reports them. */
  unreadCount: number;
}

/* -------------------------------------------------------------------------- */
/*  Context                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * The scope a controller works against.
 *
 * `key` identifies the user and/or workspace, and with them the scope of the
 * unread counter. Two contexts with the same key address the same data even when
 * their `data` differs, which is why `data` may be replaced at runtime (a fresh
 * token, another locale) without resetting the list.
 *
 * `data` carries anything the adapter needs on every call — a tenant id, a
 * locale, a route prefix. Credentials belong to the application's own request
 * layer; the library never reads or stores them.
 *
 * @typeParam TContextData — Application data carried with the context.
 */
export interface InboxContext<TContextData = unknown> {
  /** Identity of the user/workspace. Defines the scope of the unread counter. */
  key: string;
  /** Typed context data handed to the adapter with every request. */
  data?: TContextData;
}

/* -------------------------------------------------------------------------- */
/*  Errors                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Every way a request can fail, in the order of the specification table.
 *
 * `ADAPTER_FAILURE` is the fallback for a failed request the library could not
 * classify further, `ADAPTER_CONTRACT_VIOLATION` means the application's adapter
 * resolved with something the library cannot use, and `UNKNOWN` is the last
 * resort when even the kind of failure is unknown — for instance when the
 * response was lost and the server may or may not have applied the change.
 */
export type InboxErrorCode =
  | 'ADAPTER_FAILURE'
  | 'ADAPTER_CONTRACT_VIOLATION'
  | 'UNAUTHORIZED'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'UNKNOWN';

/**
 * The phase of the flow that failed.
 *
 * `load` covers `getNotifications` and `getUnreadCount`, `mutation` covers
 * `setReadStatus` and `markAllRead`. A phase is what a binding needs in order to
 * decide whether it is refreshing a list or reporting a failed action.
 */
export type InboxErrorPhase = 'load' | 'mutation';

/**
 * Whether the server rejected the change or the library never learned the
 * outcome.
 *
 * `rejected` is a confirmed refusal: the server answered, and the change did not
 * happen. `unknown` means the request did not produce a usable answer — a lost
 * response, a timeout, a closed connection — so the change may or may not have
 * been applied and the client has to reconcile instead of assuming.
 */
export type InboxErrorOutcome = 'rejected' | 'unknown';
