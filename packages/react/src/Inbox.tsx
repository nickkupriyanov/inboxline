/**
 * The ready-made feed.
 *
 * This is the first complete composition of the library: the provider-owned
 * controller supplies the snapshot and the actions, and this component only
 * draws what the derived view describes. It never formats a date, computes a
 * counter or decides whether another page exists — those answers already came
 * from the core, so a custom UI and the ready-made one cannot disagree.
 *
 * The composition is deliberately a page, not a card grid: one reading column of
 * day groups, native buttons for the filters and the next page, and plain text
 * for the states. The bell panel arrives later and reuses the same list rows.
 */
import type { JSX } from 'react';
import { IL_CLASS } from '@nickkupriyanov/inboxline-core';
import type { InboxItemView } from '@nickkupriyanov/inboxline-core';
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

/** The ready-made notification feed. */
export function Inbox(): JSX.Element {
  const { snapshot, actions } = useInboxFlow();
  const ui = useInboxUI();
  const view = snapshot.view;
  const loadingFirstPage = view.list.loading && view.list.items.length === 0;

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
            className={IL_CLASS.filter}
            aria-pressed={view.settings.filter === 'all'}
            onClick={() => ui.setFilter('all')}
          >
            {ui.messages.filterAllLabel}
          </button>
          <button
            type="button"
            className={IL_CLASS.filter}
            aria-pressed={view.settings.filter === 'unread'}
            onClick={() => ui.setFilter('unread')}
          >
            {ui.messages.filterUnreadLabel}
          </button>
        </div>
      </header>

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
                  <NotificationItem key={item.id} item={item} messages={ui.messages} />
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
