/**
 * Stable class names and DOM states.
 *
 * `IL_CLASS` is the single source of truth for the base class of every slot: the
 * stylesheet (Iteration 11) and the bindings read it, so a class a consumer sees
 * in the DOM never depends on markup nesting. A consumer's own class is added
 * *alongside* these, never instead of them.
 *
 * ## DOM states
 *
 * State that a stylesheet has to react to is written as a `data-il-*` attribute
 * rather than as a modifier class, so one element can carry several states
 * without the combinatorics of `il-item--unread--pending`:
 *
 * | Attribute                          | On                | Means                                                       |
 * | ---------------------------------- | ----------------- | ----------------------------------------------------------- |
 * | `data-il-unread="true"`            | a row             | The effective state is unread. Not the only signal: the accessible name repeats it. |
 * | `data-il-pending="true"`           | a row             | An optimistic read operation is queued or in flight.        |
 * | `data-il-unknown="true"`           | a row             | The answer to that operation was lost; the application reconciles. |
 * | `data-il-error="true"`             | a row             | The last read operation for this row was refused; the status text explains it. |
 * | `data-il-kind="…"`                 | a status line     | `pending` / `unknown` / `error` — what the text next to an action reports. |
 * | `data-il-status="…"`               | the list, the page | `idle` / `loading` / `ready` / `error` — the status of that load. |
 * | `data-il-empty="true"`             | the list          | Loaded and holding no rows under the current filter.        |
 *
 * `data-il-layout`, `data-il-theme` and `data-il-filter` describe the widget as a
 * whole. The feed sets all three in Iteration 13; the panel and trigger follow in
 * Iteration 15.
 */
import type { IlClassSlot } from './types';

/** Base class for every customisable slot. BEM-ish, but flat and non-invasive. */
export const IL_CLASS: Record<IlClassSlot, string> = {
  root: 'il-root',
  header: 'il-header',
  heading: 'il-heading',
  filters: 'il-filters',
  filter: 'il-filter',
  actions: 'il-actions',
  markAllRead: 'il-mark-all-read',
  status: 'il-status',
  updates: 'il-updates',
  list: 'il-list',
  group: 'il-group',
  groupLabel: 'il-group-label',
  item: 'il-item',
  itemAvatar: 'il-item-avatar',
  itemIcon: 'il-item-icon',
  itemContent: 'il-item-content',
  itemTitle: 'il-item-title',
  itemBody: 'il-item-body',
  itemMeta: 'il-item-meta',
  itemTime: 'il-item-time',
  itemActivate: 'il-item-activate',
  itemAction: 'il-item-action',
  itemUnreadMarker: 'il-item-unread-marker',
  empty: 'il-empty',
  loading: 'il-loading',
  error: 'il-error',
  pageError: 'il-page-error',
  loadMore: 'il-load-more',
  live: 'il-live',
};
