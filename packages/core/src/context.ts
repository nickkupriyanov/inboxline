/**
 * Which data a controller works against: the context that identifies it and the
 * filter that narrows the list.
 *
 * The context is the scope of the whole flow — one user, one workspace — and the
 * filter only selects rows inside that scope. Keeping both here makes the
 * difference explicit: swapping the context abandons in-flight work and resets
 * the list, while swapping the filter never changes the meaning of the global
 * unread counter.
 */
import type { InboxContext, InboxFilter } from './types';

/** Key of the implicit context, used when an application supplies none. */
export const DEFAULT_CONTEXT_KEY = 'default';

/** The context assumed when the application does not supply one. */
export const DEFAULT_INBOX_CONTEXT: InboxContext = { key: DEFAULT_CONTEXT_KEY };

/** Every filter, in the order a filter control renders them. */
export const INBOX_FILTERS: readonly InboxFilter[] = ['all', 'unread'];

/** The filter a controller starts with. */
export const DEFAULT_FILTER: InboxFilter = 'all';

const FILTER_SET: ReadonlySet<string> = new Set<string>(INBOX_FILTERS);

/**
 * Narrows an unknown value to a filter the library ships.
 *
 * Useful when a filter arrives from storage, a query string or an application's
 * own routing: an unrecognised value is rejected instead of silently becoming
 * "all".
 */
export function isInboxFilter(value: unknown): value is InboxFilter {
  return typeof value === 'string' && FILTER_SET.has(value);
}

/**
 * Whether a value can be used as a context.
 *
 * Only the key is required, and it must be a non-empty string: it identifies the
 * user/workspace and therefore the scope of everything the core loads.
 */
export function isInboxContext(value: unknown): value is InboxContext {
  if (typeof value !== 'object' || value === null) return false;
  const key = (value as { key?: unknown }).key;
  return typeof key === 'string' && key.length > 0;
}

/**
 * Whether two contexts address the same data.
 *
 * The comparison is deliberately made on the key alone. A context can be
 * replaced at runtime because `data` changed — a rotated token, another locale —
 * and the notifications, the counter and the paging cursors stay valid, because
 * they still belong to the same user/workspace. `undefined` is the implicit
 * context, so it is equal to the default one.
 */
export function isSameInboxContext(
  a: InboxContext | undefined,
  b: InboxContext | undefined,
): boolean {
  return (a?.key ?? DEFAULT_CONTEXT_KEY) === (b?.key ?? DEFAULT_CONTEXT_KEY);
}
