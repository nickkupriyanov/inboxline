/**
 * The ready-made feed.
 *
 * This is the first complete composition of the library: the provider-owned
 * controller supplies the snapshot and the actions, and this component only
 * draws what the derived view describes. It never formats a date, computes a
 * counter or decides whether another page exists — those answers already came
 * from the core, so a custom UI and the ready-made one cannot disagree.
 *
 * Iteration 14 finishes the visitor's path: a row can be activated or have its
 * read state changed, the whole context can be marked read, and the pending,
 * refused and reconciling states are visible without taking the rest of the feed
 * hostage. The read action is a sibling of the activation button, so activating
 * one never means activating the other.
 */
import { useEffect, useRef } from 'react';
import type { JSX } from 'react';
import { IL_CLASS } from '@nickkupriyanov/inboxline-core';
import type { InboxFilter, InboxItemView } from '@nickkupriyanov/inboxline-core';
import { useInboxFlow, useInboxUI } from './context';
import { NotificationItem } from './components/NotificationItem';

/** Three skeleton rows, on the same rhythm as the real rows. */
function LoadingRows({ label }: { label: string }): JSX.Element {
  return (
    <div className={IL_CLASS.loading} role="status">
      <span className="il-visually-hidden">{label}</span>
      <div className="il-loading-row" aria-hidden="true" />
      <div className="il-loading-row" aria-hidden="true" />
      <div className="il-loading-row" aria-hidden="true" />
    </div>
  );
}

/** Where focus goes after the row the visitor used has left the unread selection. */
interface FocusRequest {
  /** The row to focus, or `null` to return to the unread filter. */
  id: string | null;
  control: 'activate' | 'read';
  /** The control that is about to disappear; focus moves only if it still owns it. */
  removed: HTMLElement | null;
}

/** The ready-made notification feed. */
export function Inbox(): JSX.Element {
  const { snapshot, actions } = useInboxFlow();
  const ui = useInboxUI();
  const view = snapshot.view;
  const loadingFirstPage = view.list.loading && view.list.items.length === 0;

  const activateRefs = useRef(new Map<string, HTMLButtonElement>());
  const readRefs = useRef(new Map<string, HTMLButtonElement>());
  const filterRefs = useRef(new Map<InboxFilter, HTMLButtonElement>());
  const focusRequestRef = useRef<FocusRequest | null>(null);

  const bulkActive = view.actions.bulkStatus !== 'idle';
  const showMarkAllRead =
    bulkActive ||
    view.actions.bulkError !== null ||
    (view.counter.known && (view.counter.unreadCount ?? 0) > 0);

  /**
   * Moves focus after the visitor's action removes the row from the unread
   * selection: to the same control of the next row, then the previous one, and
   * finally to the filter that owns the empty selection.
   */
  useEffect(() => {
    const request = focusRequestRef.current;
    if (request === null) return;
    focusRequestRef.current = null;

    const active = document.activeElement;
    if (active !== null && active !== document.body && active !== request.removed) return;

    if (request.id !== null) {
      const target =
        request.control === 'activate'
          ? (activateRefs.current.get(request.id) ?? readRefs.current.get(request.id))
          : readRefs.current.get(request.id);
      if (target !== undefined) {
        target.focus();
        return;
      }
    }

    filterRefs.current.get('unread')?.focus();
  }, [view.list.items]);

  function requestFocus(item: InboxItemView, control: FocusRequest['control']): void {
    if (view.settings.filter !== 'unread') return;
    const index = view.list.items.findIndex((candidate) => candidate.id === item.id);
    if (index === -1) return;
    const next = view.list.items[index + 1] ?? view.list.items[index - 1] ?? null;
    focusRequestRef.current = {
      id: next?.id ?? null,
      control,
      removed:
        (control === 'activate'
          ? activateRefs.current.get(item.id)
          : readRefs.current.get(item.id)) ??
        readRefs.current.get(item.id) ??
        null,
    };
  }

  function handleActivate(item: InboxItemView): void {
    const marksRead =
      !bulkActive && ui.markReadOnOpen && item.unread && !item.pending && !item.unknown;
    if (marksRead) {
      requestFocus(item, 'activate');
      // Navigation and the read request are independent: the click callback is
      // called immediately and never waits for the server.
      void actions.setRead(item.id, true);
    }

    if (ui.onNotificationClick === undefined) return;
    try {
      ui.onNotificationClick(item.notification);
    } catch {
      // The application's callback is contained: the read request has already
      // left, and a broken navigation handler must not turn it into a failure.
    }
  }

  function handleToggleRead(item: InboxItemView): void {
    if (bulkActive || item.pending || item.unknown) return;
    const read = !item.read;
    if (read) requestFocus(item, 'read');
    void actions.setRead(item.id, read);
  }

  function handleMarkAllRead(): void {
    if (!view.actions.canMarkAllRead) return;
    void actions.markAllRead();
  }

  function registerActivate(id: string, element: HTMLButtonElement | null): void {
    if (element === null) activateRefs.current.delete(id);
    else activateRefs.current.set(id, element);
  }

  function registerRead(id: string, element: HTMLButtonElement | null): void {
    if (element === null) readRefs.current.delete(id);
    else readRefs.current.set(id, element);
  }

  function registerFilter(filter: InboxFilter, element: HTMLButtonElement | null): void {
    if (element === null) filterRefs.current.delete(filter);
    else filterRefs.current.set(filter, element);
  }

  const bulkStatusText =
    view.actions.bulkStatus === 'unknown' ? ui.messages.bulkUnknownLabel : view.actions.bulkError;
  const bulkStatusKind = view.actions.bulkStatus === 'unknown' ? 'unknown' : 'error';

  return (
    <section
      className={IL_CLASS.root}
      data-il-layout="feed"
      data-il-theme={ui.theme}
      data-il-filter={view.settings.filter}
    >
      <header className={IL_CLASS.header}>
        <h2 className={IL_CLASS.heading}>{ui.messages.listLabel}</h2>

        <div className={IL_CLASS.filters} role="group" aria-label={ui.messages.filtersLabel}>
          <button
            type="button"
            ref={(element) => registerFilter('all', element)}
            className={IL_CLASS.filter}
            aria-pressed={view.settings.filter === 'all'}
            onClick={() => ui.setFilter('all')}
          >
            {ui.messages.filterAllLabel}
          </button>
          <button
            type="button"
            ref={(element) => registerFilter('unread', element)}
            className={IL_CLASS.filter}
            aria-pressed={view.settings.filter === 'unread'}
            onClick={() => ui.setFilter('unread')}
          >
            {ui.messages.filterUnreadLabel}
          </button>
        </div>
      </header>

      {!showMarkAllRead ? null : (
        <div className={IL_CLASS.actions}>
          {bulkStatusText === null ? null : (
            <span
              className={IL_CLASS.status}
              data-il-kind={bulkStatusKind}
              role={bulkStatusKind === 'error' ? 'alert' : 'status'}
            >
              {bulkStatusText}
            </span>
          )}
          <button
            type="button"
            className={IL_CLASS.markAllRead}
            aria-disabled={view.actions.canMarkAllRead ? undefined : 'true'}
            aria-busy={view.actions.bulkStatus === 'pending' ? 'true' : undefined}
            onClick={handleMarkAllRead}
          >
            {view.actions.bulkStatus === 'pending' ? (
              <span className="il-spinner" aria-hidden="true" />
            ) : null}
            {view.actions.bulkStatus === 'pending'
              ? ui.messages.bulkPendingLabel
              : ui.messages.markAllReadLabel}
          </button>
        </div>
      )}

      {view.updates.available ? (
        <button
          type="button"
          className={IL_CLASS.updates}
          onClick={() => void actions.showUpdates()}
        >
          {view.updates.label}
        </button>
      ) : null}

      {view.list.error === null ? null : (
        <div className={IL_CLASS.error} role="alert">
          <span>{view.list.error}</span>
          <button type="button" onClick={() => void actions.retry()}>
            {ui.messages.retryLabel}
          </button>
        </div>
      )}

      {loadingFirstPage ? <LoadingRows label={view.list.loadingLabel} /> : null}

      {!loadingFirstPage && view.list.items.length > 0 ? (
        <ul
          className={IL_CLASS.list}
          aria-label={view.list.label}
          data-il-status={view.list.status}
          data-il-empty={view.list.empty ? 'true' : undefined}
        >
          {view.list.groups.map((group) => (
            <li className={IL_CLASS.group} key={group.key}>
              <p className={IL_CLASS.groupLabel}>{group.label}</p>
              <ul className="il-group-list">
                {group.items.map((item: InboxItemView) => (
                  <NotificationItem
                    key={item.id}
                    item={item}
                    messages={ui.messages}
                    activatable={
                      ui.onNotificationClick !== undefined ||
                      (!bulkActive &&
                        ui.markReadOnOpen &&
                        item.unread &&
                        !item.pending &&
                        !item.unknown)
                    }
                    readBlocked={bulkActive}
                    onActivate={() => handleActivate(item)}
                    onToggleRead={() => handleToggleRead(item)}
                    registerActivate={(element) => registerActivate(item.id, element)}
                    registerRead={(element) => registerRead(item.id, element)}
                  />
                ))}
              </ul>
            </li>
          ))}
        </ul>
      ) : null}

      {!loadingFirstPage && view.list.items.length === 0 && view.list.empty ? (
        <p className={IL_CLASS.empty}>{view.list.emptyLabel}</p>
      ) : null}

      {view.page.error === null ? null : (
        <div className={IL_CLASS.pageError} role="alert">
          <span>{view.page.error}</span>
          <button type="button" onClick={() => void actions.retry()}>
            {view.page.retryLabel}
          </button>
        </div>
      )}

      {view.page.hasMore && view.page.error === null ? (
        <button
          type="button"
          className={IL_CLASS.loadMore}
          disabled={!view.page.canLoadMore}
          aria-busy={view.page.loading ? 'true' : undefined}
          onClick={() => void actions.loadMore()}
        >
          {view.page.loading ? <span className="il-spinner" aria-hidden="true" /> : null}
          {view.page.label}
        </button>
      ) : null}

      <p className={IL_CLASS.live} aria-live="polite" aria-atomic="true">
        {view.live.message}
      </p>
    </section>
  );
}
