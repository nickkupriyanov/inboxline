/**
 * The ready-made feed playground.
 *
 * Iteration 14 shows the complete row flow: activation with
 * `onNotificationClick`, read/unread actions, “Mark all as read” and the
 * pending, refused and reconciling states. The counter card beside it stays
 * headless to show that both read one controller. Separate providers still stay
 * isolated.
 */
import { useState } from 'react';
import {
  createMockAdapter,
  systemInboxClock,
  type InboxContext,
  type InboxNotification,
} from '@nickkupriyanov/inboxline-core';
import { Inbox, InboxProvider, useInboxFlow, useInboxUI } from '@nickkupriyanov/inboxline-react';

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
        A custom headless view over the same controller as the feed. filter:{' '}
        <code>{ui.filter}</code> · panel: <code>{ui.open ? 'open' : 'closed'}</code> · theme:{' '}
        <code>{ui.theme}</code> · markReadOnOpen: <code>{String(ui.markReadOnOpen)}</code>
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

/* -------------------------------------------------------------------------- */
/*  Page                                                                       */
/* -------------------------------------------------------------------------- */

export function App() {
  // The second provider illustrates controlled UI values: the application owns
  // the filter and the open state, and the provider only reports the requests.
  const [controlledFilter, setControlledFilter] = useState<'all' | 'unread'>('all');
  const [controlledOpen, setControlledOpen] = useState(false);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [opened, setOpened] = useState<string | null>(null);

  return (
    <main className={`pg-page pg-page-${theme}`}>
      <header className="pg-header">
        <div>
          <p className="pg-eyebrow">Iteration 14 · actions and activation</p>
          <h1>Inboxline feed</h1>
          <p className="pg-lead">
            The feed now completes the visitor loop: activate a notification to navigate, mark one
            row read or unread, or mark the whole context read. Pending, refused and reconciling
            states stay next to the action instead of taking the list hostage.
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
          values are uncontrolled here (internal to the provider); the feed owns the visible filter
          buttons. Activating a row marks it read and reports its title below.
        </p>
        <InboxProvider
          adapter={adapter}
          context={WORKSPACE_A}
          theme={theme}
          onNotificationClick={(clicked) => setOpened(clicked.title)}
        >
          <CounterCard title="Bell counter" />
          <Inbox />
        </InboxProvider>
        <p className="pg-meta" aria-live="polite">
          Last activated: <code>{opened ?? 'nothing yet'}</code>
        </p>
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
