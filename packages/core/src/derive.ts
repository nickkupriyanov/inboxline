/**
 * The derived view model.
 *
 * `deriveInboxView()` is pure: it receives the flow state, the resolved
 * configuration and the time reference it was given, and returns everything a
 * binding renders — the day groups and their rows, the list, page and counter
 * states, the labels a screen reader needs, and which actions are available.
 *
 * It never reads the clock, never touches the DOM and never calls an adapter, so
 * the controller's snapshot cache and both bindings work from one implementation
 * instead of formatting a date three times.
 *
 * The derivation is also where the optimistic layer becomes visible: a row shows
 * the state the visitor asked for while the operation is queued, and goes back to
 * the confirmed value when it is rolled back, without either value overwriting
 * the other in the state.
 */
import type { InboxConfig } from './config';
import { format, selectPlural } from './i18n';
import type {
  InboxLoadStatus,
  InboxPageStatus,
  InboxPendingReadStatus,
  InboxState,
} from './reducer';
import { dayKeyOfInstant, formatInboxDayLabel, formatInboxItemTime } from './time';
import type { InboxAuthor, InboxFilter, InboxNotification, InboxTimeAnchor } from './types';

/* -------------------------------------------------------------------------- */
/*  View model                                                                */
/* -------------------------------------------------------------------------- */

/** What the view reads from the configuration. */
export interface InboxSettingsView {
  locale: string;
  timeZone: string;
  /** The filter the loaded rows belong to. */
  filter: InboxFilter;
  /** The user/workspace the view shows. */
  contextKey: string;
}

/**
 * The global unread counter.
 *
 * `known` is `false` until the server reports a number: an unknown counter is
 * never presented as a confirmed zero, and `label` stays `null` so a binding has
 * nothing misleading to render. `unreadCount` is server data and is independent
 * of the loaded page — a page of ten rows under a counter of 27 is expected.
 */
export interface InboxCounterView {
  unreadCount: number | null;
  known: boolean;
  /** `{count} unread notifications`, or `null` while the counter is unknown. */
  label: string | null;
  status: InboxLoadStatus;
  loading: boolean;
  /** The counter failed; the previous value, or “unknown”, stays. */
  error: string | null;
}

/** One notification, with the optimistic layer already applied. */
export interface InboxItemView<TData = unknown> {
  id: string;
  createdAt: string;
  /** Calendar day in the configured zone; the group this row belongs to. */
  dayKey: string;
  title: string;
  body: string | null;
  author: InboxAuthor | null;
  icon: string | null;
  /**
   * The confirmed server object, passed through for application callbacks.
   *
   * `read` is the server state; the effective state — including the optimistic
   * layer — is {@link InboxItemView.read}. The library never rewrites this
   * object when the visitor asks for a change.
   */
  notification: InboxNotification<TData>;
  /** Effective state: the confirmed value unless an optimistic operation overrides it. */
  read: boolean;
  /** `!read`, exposed for styling and for the unread marker. */
  unread: boolean;
  /** An individual operation is queued or in flight for this row. */
  pending: boolean;
  /** The answer of this row's individual operation was lost. */
  unknown: boolean;
  /** A confirmed refusal of this row's operation, or `null`. */
  actionError: string | null;
  /** Relative while the row is from today, an absolute short date otherwise. */
  timeLabel: string;
  /** Accessible name: title, author, time and the unread marker. */
  label: string;
  /** Application data, passed through untouched. */
  data?: TData;
}

/** One calendar day of rows, in the server's order. */
export interface InboxGroupView<TData = unknown> {
  /** `YYYY-MM-DD` in the configured zone. */
  key: string;
  /** `Today`, `Yesterday`, or the formatted day. */
  label: string;
  items: InboxItemView<TData>[];
}

/** The loaded list: the first page and its refreshed replacements. */
export interface InboxListView<TData = unknown> {
  status: InboxLoadStatus;
  loading: boolean;
  /** The first page failed. Whatever was already loaded stays in `items`. */
  error: string | null;
  /** The list is loaded and holds nothing under the current filter. */
  empty: boolean;
  /** What to show while the list is empty: it depends on the filter. */
  emptyLabel: string;
  /** The first page is loading. */
  loadingLabel: string;
  /** Accessible name of the list. */
  label: string;
  /** How many rows are loaded. Not the counter. */
  count: number;
  items: InboxItemView<TData>[];
  groups: InboxGroupView<TData>[];
}

/** Appending the next page. */
export interface InboxPageView {
  status: InboxPageStatus;
  loading: boolean;
  /** The next page failed; the rows already shown stay. */
  error: string | null;
  /** The server has another page. */
  hasMore: boolean;
  /** The next page can be requested right now. */
  canLoadMore: boolean;
  /** Label of the “show more” control. */
  label: string;
  retryLabel: string;
}

/**
 * External invalidations the adapter reported.
 *
 * `available` is raised when the data changed outside this controller — another
 * client, a transport event, a server-side action — and the loaded list has not
 * absorbed the change yet. The list itself is deliberately kept as it is;
 * `label` is the text of the control that loads the new first page.
 */
export interface InboxUpdatesView {
  /** An invalidation arrived and the open list is waiting for an explicit reload. */
  available: boolean;
  /** Label of the control that applies the updates, for example “Show updates”. */
  label: string;
}

/**
 * What the visitor may do right now.
 *
 * `canMarkAllRead` is deliberately conservative: the bulk operation needs a
 * counter the server actually reported, something unread to change, no queued
 * individual operation (the contract disables it while that queue is busy) and no
 * bulk operation already running.
 */
export interface InboxActionsView {
  canRefresh: boolean;
  canLoadMore: boolean;
  canMarkAllRead: boolean;
  canRetryList: boolean;
  canRetryPage: boolean;
  /** The “updates available” control can load the new first page. */
  canShowUpdates: boolean;
  /** An individual mutation is queued or in flight, or a bulk operation runs. */
  busy: boolean;
  /** Where the bulk operation stands; `idle` when none was requested. */
  bulkStatus: InboxPendingReadStatus | 'idle';
  /** A confirmed refusal of the bulk operation, or `null`. */
  bulkError: string | null;
}

/** Everything a binding renders for one snapshot. */
export interface InboxView<TData = unknown> {
  settings: InboxSettingsView;
  counter: InboxCounterView;
  list: InboxListView<TData>;
  page: InboxPageView;
  updates: InboxUpdatesView;
  actions: InboxActionsView;
  /**
   * The polite announcement of the counter. It always describes the current
   * value; when the binding publishes it — and whether it publishes at all — is
   * the binding's decision, so a re-render never re-reads the whole list.
   */
  live: { message: string };
}

/* -------------------------------------------------------------------------- */
/*  Derivation                                                                */
/* -------------------------------------------------------------------------- */

function counterLabelOf(count: number, config: InboxConfig): string {
  return format(selectPlural(config.messages.countLabel, count, config.locale), { count });
}

function itemLabelOf(
  notification: InboxNotification<unknown>,
  timeLabel: string,
  unread: boolean,
  config: InboxConfig,
): string {
  const parts = [notification.title];
  if (notification.author) parts.push(notification.author.name);
  parts.push(timeLabel);
  if (unread) parts.push(config.messages.unreadMarkerLabel);
  return parts.join('. ');
}

/** Reads the optimistic layer without walking the prototype chain. */
function pendingOperationOf<TData>(
  state: InboxState<TData>,
  id: string,
): { read: boolean; status: InboxPendingReadStatus } | null {
  if (!Object.hasOwn(state.pending.reads, id)) return null;
  const operation = state.pending.reads[id];
  return operation ?? null;
}

/**
 * The counter a binding shows while operations are queued.
 *
 * The confirmed server number stays the baseline and is never rewritten by
 * arithmetic in the state. A pending bulk operation claims the whole context, so
 * it projects zero: the number of unloaded rows is not known, and the server's
 * own answer — including the events created after its boundary — replaces the
 * guess on confirmation. Individual operations are projected one step per row:
 * an operation that started from a known unread row and asks for read removes
 * one, and the reverse adds one. An operation whose answer was lost is
 * deliberately left out, which also applies to a bulk operation: it may already
 * be part of the last server number, and the reconciliation that follows is what
 * resolves it.
 */
function effectiveUnreadCountOf<TData>(state: InboxState<TData>): number | null {
  if (state.unreadCount === null) return null;

  if (state.pending.bulk?.status === 'pending') return 0;

  let projected = state.unreadCount;
  for (const id of state.pending.readOrder) {
    if (!Object.hasOwn(state.pending.reads, id)) continue;
    const operation = state.pending.reads[id];
    if (operation === undefined || operation.status !== 'pending') continue;
    if (operation.previousRead === operation.read) continue;
    projected += operation.read ? -1 : 1;
  }
  return Math.max(0, projected);
}

/**
 * Turns the state, the configuration and the time reference into the model a
 * binding renders.
 *
 * The rows follow `state.order`, so the server order is preserved and the day
 * groups are formed from consecutive rows of the same day rather than by
 * re-sorting anything.
 */
export function deriveInboxView<TData = unknown>(
  state: InboxState<TData>,
  config: InboxConfig,
  time: InboxTimeAnchor,
): InboxView<TData> {
  const { messages, locale, timeZone } = config;

  const bulk = state.pending.bulk;
  const bulkReadsKnownRows = bulk !== null;

  const items: InboxItemView<TData>[] = [];
  const groups: InboxGroupView<TData>[] = [];
  let group: InboxGroupView<TData> | null = null;

  for (const id of state.order) {
    const notification = state.byId[id];
    if (notification === undefined) continue;

    const operation = pendingOperationOf(state, id);
    // The bulk operation covers the whole context and is optimistic for every
    // row that is already known; an individual operation for the same row wins,
    // although the controller never lets the two overlap.
    const read = operation ? operation.read : bulkReadsKnownRows ? true : notification.read;
    const unread = !read;
    // The unread view is a live selection, not a snapshot of the request: a row
    // that becomes read — optimistically or after confirmation — leaves the
    // list immediately, and comes back if the operation is rolled back.
    if (state.filter === 'unread' && read) continue;

    const dayKey = dayKeyOfInstant(notification.createdAt, timeZone);
    const timeLabel = formatInboxItemTime(notification.createdAt, locale, timeZone, time, messages);

    const item: InboxItemView<TData> = {
      id: notification.id,
      createdAt: notification.createdAt,
      dayKey,
      title: notification.title,
      body: notification.body ?? null,
      author: notification.author ?? null,
      icon: notification.icon ?? null,
      notification,
      read,
      unread,
      pending: operation?.status === 'pending',
      unknown: operation?.status === 'unknown',
      actionError:
        state.actionError?.scope === 'read' && state.actionError.id === notification.id
          ? messages.readErrorLabel
          : null,
      timeLabel,
      label: itemLabelOf(notification, timeLabel, unread, config),
      ...(notification.data === undefined ? {} : { data: notification.data }),
    };
    items.push(item);

    if (group === null || group.key !== dayKey) {
      group = {
        key: dayKey,
        label: formatInboxDayLabel(dayKey, time, messages, locale),
        items: [],
      };
      groups.push(group);
    }
    group.items.push(item);
  }

  const listReady = state.listStatus === 'ready';
  const unreadCount = effectiveUnreadCountOf(state);
  const countLabel = unreadCount === null ? null : counterLabelOf(unreadCount, config);
  const hasMore = state.nextCursor !== null;

  return {
    settings: {
      locale,
      timeZone,
      filter: state.filter,
      contextKey: state.contextKey,
    },
    counter: {
      unreadCount,
      known: unreadCount !== null,
      label: countLabel,
      status: state.countStatus,
      loading: state.countStatus === 'loading',
      error: state.countError ? messages.countErrorLabel : null,
    },
    list: {
      status: state.listStatus,
      loading: state.listStatus === 'loading',
      error: state.listError ? messages.listErrorLabel : null,
      empty: listReady && items.length === 0,
      emptyLabel: state.filter === 'unread' ? messages.emptyUnreadLabel : messages.emptyLabel,
      loadingLabel: messages.loadingLabel,
      label: messages.listLabel,
      count: items.length,
      items,
      groups,
    },
    page: {
      status: state.pageStatus,
      loading: state.pageStatus === 'loading',
      error: state.pageError ? messages.pageErrorLabel : null,
      hasMore,
      canLoadMore: hasMore && listReady && state.pageStatus !== 'loading',
      label: messages.loadMoreLabel,
      retryLabel: messages.retryLabel,
    },
    updates: {
      available: state.updatesAvailable,
      label: messages.showUpdatesLabel,
    },
    actions: {
      canRefresh: state.listStatus !== 'loading',
      canLoadMore: hasMore && listReady && state.pageStatus !== 'loading',
      canMarkAllRead:
        unreadCount !== null &&
        unreadCount > 0 &&
        state.pending.readOrder.length === 0 &&
        bulk === null,
      canRetryList: state.listStatus === 'error',
      canRetryPage: state.pageStatus === 'error',
      canShowUpdates: state.updatesAvailable && state.listStatus !== 'loading',
      busy: state.pending.readOrder.length > 0 || bulk !== null,
      bulkStatus: bulk?.status ?? 'idle',
      bulkError: state.actionError?.scope === 'bulk' ? messages.bulkErrorLabel : null,
    },
    live: { message: countLabel ?? messages.countUnknownLabel },
  };
}

/* -------------------------------------------------------------------------- */
/*  Memoisation                                                               */
/* -------------------------------------------------------------------------- */

/** How much wall time one bucket of the cache key covers. */
export const INBOX_VIEW_TIME_BUCKET_MS = 60_000;

/**
 * The snapshot cache key of the derived view.
 *
 * The derivation is a pure function of three things: the state, the resolved
 * configuration and the time reference. The owner of each counts its own
 * revisions — the controller bumps `stateRevision` whenever the reducer returns a
 * different object, `configRevision` whenever the configuration is replaced, and
 * `time` moves with the clock — and this key joins them.
 *
 * `time` is not part of the key as a whole: relative labels only change when the
 * minute does (and when the day rolls over), so the key buckets `nowMs` to the
 * minute instead of making every millisecond a new view.
 */
export function inboxViewKey(
  stateRevision: number,
  configRevision: number,
  time: InboxTimeAnchor,
): string {
  return `${stateRevision}|${configRevision}|${time.today}|${Math.floor(
    time.nowMs / INBOX_VIEW_TIME_BUCKET_MS,
  )}`;
}

/**
 * A snapshot cache for `deriveInboxView()`.
 *
 * The derivation stays pure; the controller owns the key and calls `get` for
 * every snapshot. The same key returns the very same object, which is what lets a
 * binding compare by reference, and a new key recomputes exactly once.
 */
export interface InboxViewMemo<TData = unknown> {
  get(
    key: string,
    state: InboxState<TData>,
    config: InboxConfig,
    time: InboxTimeAnchor,
  ): InboxView<TData>;
}

/** Creates a fresh memo. One per controller. */
export function createInboxViewMemo<TData = unknown>(): InboxViewMemo<TData> {
  let cachedKey: string | null = null;
  let cached: InboxView<TData> | null = null;
  return {
    get(key, state, config, time) {
      if (cached !== null && key === cachedKey) return cached;
      cachedKey = key;
      cached = deriveInboxView(state, config, time);
      return cached;
    },
  };
}
