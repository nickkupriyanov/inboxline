/**
 * The minimal headless playground.
 *
 * It intentionally renders no library components: this iteration proves that one
 * provider can drive several custom views from one controller, and that separate
 * providers stay isolated. The ready-made feed arrives in the next iteration and
 * will replace the list markup below without touching the core.
 */
import { useState } from 'react';
import {
  createMockAdapter,
  systemInboxClock,
  type InboxContext,
  type InboxNotification,
} from '@nickkupriyanov/inboxline-core';
import { InboxProvider, useInboxFlow, useInboxUI } from '@nickkupriyanov/inboxline-react';

/* -------------------------------------------------------------------------- */
/*  Fixtures                                                                   */
/* -------------------------------------------------------------------------- */

const WORKSPACE_A: InboxContext = { key: 'workspace-a' };
const WORKSPACE_B: InboxContext = { key: 'workspace-b' };

function minutesAgo(minutes: number): string {
  return new Date(Date.now() - minutes * 60_000).toISOString();
}

function notification(
  id: string,
  title: string,
  minutes: number,
  read = false,
  body?: string,
): InboxNotification {
  return {
    id,
    title,
    ...(body === undefined ? {} : { body }),
    createdAt: minutesAgo(minutes),
    read,
    author: { name: 'Inboxline demo' },
  };
}

const adapter = createMockAdapter({
  clock: systemInboxClock(),
  pageSize: 3,
  latencyMs: 180,
  contexts: [
    {
      context: WORKSPACE_A,
      notifications: [
        notification('a5', 'New comment on «Release notes»', 2, false, 'Mira left a note.'),
        notification('a4', 'Payment received', 12, false, 'Invoice #2041 is settled.'),
        notification('a3', 'Deployment finished', 48, true, 'production · 2 minutes'),
        notification('a2', 'Weekly report is ready', 26 * 60, true),
        notification('a1', 'Workspace created', 72 * 60, true),
      ],
    },
    {
      context: WORKSPACE_B,
      notifications: [
        notification('b2', 'Ticket assigned to you', 4, false, 'Support queue · #318'),
        notification('b1', 'Billing contact updated', 20 * 60, true),
      ],
    },
  ],
});

let nextEvent = 0;

function simulateExternalEvent(context: InboxContext): void {
  nextEvent += 1;
  adapter.addNotification(
    context,
    notification(`external-${nextEvent}`, `Event from another client #${nextEvent}`, 0),
  );
  adapter.invalidate(context);
}

/* -------------------------------------------------------------------------- */
/*  Headless views                                                             */
/* -------------------------------------------------------------------------- */

function CounterCard({ title }: { title: string }) {
  const { snapshot } = useInboxFlow();
  const ui = useInboxUI();
  const { counter } = snapshot.view;

  return (
    <article className="pg-card">
      <h3>{title}</h3>
      <p className="pg-counter" aria-live="polite">
        {counter.label ?? ui.messages.countUnknownLabel}
      </p>
      <p className="pg-meta">
        filter: <code>{ui.filter}</code> · panel: <code>{ui.open ? 'open' : 'closed'}</code> ·
        theme: <code>{ui.theme}</code>
      </p>
      <div className="pg-row">
        <button type="button" onClick={() => ui.setOpen(!ui.open)}>
          {ui.open ? 'Close panel' : 'Open panel'}
        </button>
        <button type="button" onClick={() => ui.setFilter(ui.filter === 'all' ? 'unread' : 'all')}>
          {ui.filter === 'all' ? 'Only unread' : 'Show all'}
        </button>
      </div>
    </article>
  );
}

function HeadlessFeed({ title }: { title: string }) {
  const { snapshot, actions } = useInboxFlow();
  const ui = useInboxUI();
  const view = snapshot.view;
  const firstId = view.list.items[0]?.id;

  return (
    <article className="pg-card pg-feed">
      <header className="pg-feed-header">
        <h3>{title}</h3>
        <span className="pg-meta">{view.list.count} loaded</span>
      </header>

      <div className="pg-row" role="group" aria-label="Filter notifications">
        <button
          type="button"
          aria-pressed={ui.filter === 'all'}
          onClick={() => ui.setFilter('all')}
        >
          All
        </button>
        <button
          type="button"
          aria-pressed={ui.filter === 'unread'}
          onClick={() => ui.setFilter('unread')}
        >
          Unread
        </button>
      </div>

      {view.updates.available ? (
        <button type="button" className="pg-updates" onClick={() => void actions.showUpdates()}>
          {view.updates.label}
        </button>
      ) : null}

      {view.list.error ? (
        <div className="pg-error" role="alert">
          <p>{view.list.error}</p>
          <button type="button" onClick={() => void actions.retry()}>
            Retry
          </button>
        </div>
      ) : null}

      {view.list.loading && view.list.items.length === 0 ? (
        <p className="pg-meta">{view.list.loadingLabel}</p>
      ) : null}

      {view.list.empty && !view.list.loading ? (
        <p className="pg-meta">{view.list.emptyLabel}</p>
      ) : null}

      <ul className="pg-list" aria-label={view.list.label}>
        {view.list.items.map((item) => (
          <li key={item.id} className="pg-item" data-unread={item.unread || undefined}>
            <div className="pg-item-text">
              <strong>{item.title}</strong>
              {item.body ? <span>{item.body}</span> : null}
              <small>
                {item.timeLabel}
                {item.unread ? ` · ${ui.messages.unreadMarkerLabel}` : ''}
                {item.pending ? ' · saving' : ''}
                {item.unknown ? ' · will reconcile' : ''}
              </small>
            </div>
          </li>
        ))}
      </ul>

      <div className="pg-row">
        <button
          type="button"
          disabled={!view.page.canLoadMore}
          onClick={() => void actions.loadMore()}
        >
          {view.page.label}
        </button>
        <button
          type="button"
          disabled={!view.actions.canMarkAllRead}
          onClick={() => void actions.markAllRead()}
        >
          {ui.messages.markAllReadLabel}
        </button>
        <button
          type="button"
          disabled={!firstId || view.actions.busy}
          onClick={() => void actions.setRead(firstId ?? '', true)}
        >
          Mark first read
        </button>
        <button type="button" onClick={() => void actions.refresh()}>
          Refresh
        </button>
      </div>

      {view.page.error ? (
        <div className="pg-error" role="alert">
          <p>{view.page.error}</p>
          <button type="button" onClick={() => void actions.loadMore()}>
            {view.page.retryLabel}
          </button>
        </div>
      ) : null}
    </article>
  );
}

/* -------------------------------------------------------------------------- */
/*  Page                                                                       */
/* -------------------------------------------------------------------------- */

export function App() {
  // The second provider illustrates controlled UI values: the application owns
  // the filter and the open state, and the provider only reports the requests.
  const [controlledFilter, setControlledFilter] = useState<'all' | 'unread'>('all');
  const [controlledOpen, setControlledOpen] = useState(false);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');

  return (
    <main className={`pg-page pg-page-${theme}`}>
      <header className="pg-header">
        <div>
          <p className="pg-eyebrow">Iteration 12 · headless</p>
          <h1>Inboxline provider</h1>
          <p className="pg-lead">
            One controller per provider, read through <code>useSyncExternalStore</code>. These views
            are deliberately custom: no library component is rendered yet.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setTheme((current) => (current === 'dark' ? 'light' : 'dark'))}
        >
          {theme === 'dark' ? 'Light theme' : 'Dark theme'}
        </button>
      </header>

      <section className="pg-section">
        <h2>One provider, two views</h2>
        <p className="pg-meta">
          The counter and the feed share one snapshot and one unread counter. Filter and panel
          values are uncontrolled here (internal to the provider).
        </p>
        <InboxProvider adapter={adapter} context={WORKSPACE_A} theme={theme}>
          <CounterCard title="Bell counter" />
          <HeadlessFeed title="Feed" />
        </InboxProvider>
        <div className="pg-row">
          <button type="button" onClick={() => simulateExternalEvent(WORKSPACE_A)}>
            Another client adds an event to workspace A
          </button>
        </div>
      </section>

      <section className="pg-section">
        <h2>Two independent providers</h2>
        <p className="pg-meta">
          Same adapter, different contexts. The workspace B provider uses controlled filter and
          panel values owned by this page.
        </p>
        <div className="pg-grid">
          <InboxProvider adapter={adapter} context={WORKSPACE_A} theme={theme}>
            <CounterCard title="Workspace A" />
          </InboxProvider>
          <InboxProvider
            adapter={adapter}
            context={WORKSPACE_B}
            theme={theme}
            filter={controlledFilter}
            onFilterChange={setControlledFilter}
            open={controlledOpen}
            onOpenChange={setControlledOpen}
          >
            <CounterCard title="Workspace B (controlled)" />
          </InboxProvider>
        </div>
        <div className="pg-row">
          <button type="button" onClick={() => simulateExternalEvent(WORKSPACE_B)}>
            Add an event to workspace B
          </button>
        </div>
      </section>
    </main>
  );
}
