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
 * Which ready-made composition a binding renders.
 *
 * `popover` is the compact bell and its panel — the default of the ready-made
 * widget. `feed` is the standalone list that can share the same provider and the
 * same server counter. The layout only chooses the composition and the width; it
 * never changes what the controller loads.
 */
export type InboxLayout = 'popover' | 'feed';

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

/* -------------------------------------------------------------------------- */
/*  Time reference                                                            */
/* -------------------------------------------------------------------------- */

/**
 * The time the core reasons about.
 *
 * Nothing in the core reads the wall clock directly: the controller holds an
 * anchor, a binding advances it, and the pure helpers of `./time` receive it
 * explicitly. `today` and `yesterday` are calendar days in the configured time
 * zone, so the day groups and the relative labels stay correct on both sides of
 * midnight and in any zone.
 */
export interface InboxTimeAnchor {
  /** Unix time in milliseconds the view is derived for. */
  nowMs: number;
  /** `YYYY-MM-DD` of `nowMs` in the configured time zone. */
  today: string;
  /** `YYYY-MM-DD` of the day before `today`, in the configured time zone. */
  yesterday: string;
}

/**
 * Injectable time source.
 *
 * A binding may use it to advance the anchor — relative labels grow stale as the
 * clock moves — and a test fixes it, so a scenario never depends on when it runs.
 */
export interface InboxClock {
  /** Unix time in milliseconds. */
  now(): number;
}

/* -------------------------------------------------------------------------- */
/*  Copy                                                                      */
/* -------------------------------------------------------------------------- */

/** A locale whose copy ships with the library. */
export type InboxLocale = 'en' | 'ru';

/**
 * One message with its plural forms.
 *
 * `other` is always present: it is the form a locale that lists no matching
 * category falls back to. A locale uses the categories its own
 * `Intl.PluralRules` reports — English `one`/`other`, Russian `one`/`few`/`many`
 * — and `selectPlural()` substitutes the single `{count}` placeholder.
 */
export interface InboxPluralMessage {
  /** Used by locales that have a `zero` category (Latvian, for instance). */
  zero?: string;
  /** `1`, and `21`, `31` … in Russian. */
  one?: string;
  /** `2` in Welsh. */
  two?: string;
  /** `2`–`4` in Russian. */
  few?: string;
  /** `5`–`20` in Russian. */
  many?: string;
  /** The form every locale has, and the fallback for an unlisted category. */
  other: string;
}

/**
 * Every piece of copy the core renders.
 *
 * Dictionaries hold plain text with `{placeholder}` markers and no markup, so a
 * message can never inject HTML. `resolveMessages()` merges a consumer's
 * overrides key by key over the built-in `en`/`ru` dictionary; an application
 * that passes its own dictionary replaces every key it names.
 */
export interface InboxMessages {
  /** Accessible name of the notification list. */
  listLabel: string;
  /** Accessible name of the control that closes the bell panel. */
  closeLabel: string;
  /** Counter text, for example `{count} unread notifications`. */
  countLabel: InboxPluralMessage;
  /** Shown instead of a number while the server has not reported a counter. */
  countUnknownLabel: string;
  /** The loaded list is empty under the “All” filter. */
  emptyLabel: string;
  /** The loaded list is empty under the “Unread” filter. */
  emptyUnreadLabel: string;
  /** The first page is being loaded. */
  loadingLabel: string;
  /** The first page failed. */
  listErrorLabel: string;
  /** The next page failed; the rows already shown stay on screen. */
  pageErrorLabel: string;
  /** The counter failed; the previous value, or “unknown”, stays. */
  countErrorLabel: string;
  /** Repeats the request that failed. */
  retryLabel: string;
  /** Loads the next page. */
  loadMoreLabel: string;
  /** Accessible name of the filter group. */
  filtersLabel: string;
  /** Filter that shows every notification. */
  filterAllLabel: string;
  /** Filter that shows only unread notifications. */
  filterUnreadLabel: string;
  /** Loads the first page after an external invalidation, for example “Show updates”. */
  showUpdatesLabel: string;
  /** Marks every notification of the context read on the server. */
  markAllReadLabel: string;
  /** Action that sets one loaded notification read. */
  markReadLabel: string;
  /** Action that sets one loaded notification unread. */
  markUnreadLabel: string;
  /** The individual read request is queued or in flight. */
  readPendingLabel: string;
  /** The individual read request lost its answer; the server is being reconciled. */
  readUnknownLabel: string;
  /** A confirmed refusal of an individual read request. */
  readErrorLabel: string;
  /** The bulk request is running. */
  bulkPendingLabel: string;
  /** The bulk request lost its answer; the server is being reconciled. */
  bulkUnknownLabel: string;
  /** A confirmed refusal of the bulk request. */
  bulkErrorLabel: string;
  /** Day group of the current day. */
  todayLabel: string;
  /** Day group of the previous day. */
  yesterdayLabel: string;
  /** Spoken after a row's time to mark it unread; the colour is not the only signal. */
  unreadMarkerLabel: string;
  /** Relative time of a notification younger than a minute. */
  timeNow: string;
  /** Relative time in minutes. */
  relativeMinute: InboxPluralMessage;
  /** Relative time in hours, inside the current day. */
  relativeHour: InboxPluralMessage;
}

/* -------------------------------------------------------------------------- */
/*  Stable class names                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Every customisable class slot of Inboxline.
 *
 * A slot is an extension point, not a DOM structure: the base class from
 * `IL_CLASS` marks the part, and the `classNames` prop adds the consumer's own
 * class alongside it rather than instead of it. The set stays aligned with the
 * parts the derived view actually describes — the feed and its filters arrive in
 * Iteration 13, the bell and its panel in Iteration 15, and replaceable parts
 * follow their components in Iteration 16.
 */
export type IlClassSlot =
  | 'root'
  | 'bell'
  | 'trigger'
  | 'badge'
  | 'panel'
  | 'panelClose'
  | 'header'
  | 'heading'
  | 'filters'
  | 'filter'
  | 'actions'
  | 'markAllRead'
  | 'status'
  | 'updates'
  | 'list'
  | 'group'
  | 'groupLabel'
  | 'item'
  | 'itemAvatar'
  | 'itemIcon'
  | 'itemContent'
  | 'itemTitle'
  | 'itemBody'
  | 'itemMeta'
  | 'itemTime'
  | 'itemActivate'
  | 'itemAction'
  | 'itemUnreadMarker'
  | 'empty'
  | 'loading'
  | 'error'
  | 'pageError'
  | 'loadMore'
  | 'live';
