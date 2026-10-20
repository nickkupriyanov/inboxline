/**
 * The ready-made playground.
 *
 * The first sections show both compositions under one provider: the default
 * bell with its portalled popover panel and the standalone feed. The counter
 * card beside them stays headless to show that all three read one controller.
 * Separate providers still stay isolated.
 *
 * The last three sections are the Iteration 16 customisation examples: a typed
 * custom row, an alternative header with custom filters, and a CSS theme applied
 * through `className`/`classNames`. None of them re-implements the controller or
 * the read queue. The final section repeats the feed under the optional
 * `/motion` provider, so the spring kit can be compared with the CSS default.
 *
 * Iteration 20 adds a workspace switch, a locale/container section and the link
 * to the fixed state gallery (`gallery.html`), where every server and optimistic
 * state is rendered with deterministic data and time. Iteration 21 adds the
 * mock-versus-HTTP comparison backed by `tools/dev-server`.
 */
import { useState } from 'react';
import {
  createMockAdapter,
  systemInboxClock,
  type InboxContext,
  type InboxNotification,
} from '@nickkupriyanov/inboxline-core';
import { InboxProvider as MotionInboxProvider } from '@nickkupriyanov/inboxline-react/motion';
import { HttpSection } from './HttpComparison';
import {
  Inbox,
  InboxProvider,
  useInboxFlow,
  useInboxUI,
  type AvatarPartProps,
  type FiltersPartProps,
  type HeaderPartProps,
  type NotificationItemPartProps,
} from '@nickkupriyanov/inboxline-react';

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
/*  Customisation examples                                                     */
/* -------------------------------------------------------------------------- */

interface ProjectData {
  project: string;
  badge: string;
}

const PROJECT_CONTEXT: InboxContext = { key: 'projects' };

function projectNotification(
  id: string,
  title: string,
  body: string,
  minutes: number,
  read: boolean,
  project: string,
  badge: string,
): InboxNotification<ProjectData> {
  return {
    id,
    title,
    body,
    createdAt: minutesAgo(minutes),
    read,
    author: { name: 'Inboxline demo' },
    data: { project, badge },
  };
}

const projectAdapter = createMockAdapter<ProjectData>({
  clock: systemInboxClock(),
  pageSize: 4,
  latencyMs: 180,
  contexts: [
    {
      context: PROJECT_CONTEXT,
      notifications: [
        projectNotification(
          'p5',
          'New comment on «Release notes»',
          'Mira left a note on the draft.',
          2,
          false,
          'Apollo',
          'AP',
        ),
        projectNotification(
          'p4',
          'Payment received',
          'Invoice #2041 is settled.',
          12,
          false,
          'Borealis',
          'BO',
        ),
        projectNotification(
          'p3',
          'Deployment finished',
          'production · 2 minutes',
          48,
          true,
          'Apollo',
          'AP',
        ),
        projectNotification(
          'p2',
          'Weekly report is ready',
          'Every project has a summary.',
          26 * 60,
          true,
          'Cassiopeia',
          'CA',
        ),
        projectNotification(
          'p1',
          'Workspace created',
          'The project space is ready for invites.',
          72 * 60,
          true,
          'Borealis',
          'BO',
        ),
      ],
    },
  ],
});

/** Joins the library's prepared class with the demo's own without dropping either. */
function joinClasses(...values: readonly (string | undefined)[]): string {
  return values.filter((value): value is string => value !== undefined && value !== '').join(' ');
}

/**
 * A row that reads the application's `TData`. Everything behavioural — the
 * activation click, the read request, pending/unknown status and the refs used
 * for focus — still comes from the prepared props.
 */
function ProjectRow({
  item,
  activatable,
  slotProps,
  activateProps,
  readProps,
  avatar,
  status,
}: NotificationItemPartProps<ProjectData>) {
  const content = (
    <>
      <span className="il-item-title">{item.title}</span>
      {item.body === null ? null : <span className="il-item-body">{item.body}</span>}
      <span className="pg-project-tag">
        {item.data?.project ?? 'No project'} · {item.timeLabel}
      </span>
    </>
  );

  return (
    <li {...slotProps}>
      {avatar}
      <div className="il-item-content">
        {activatable ? <button {...activateProps}>{content}</button> : content}
        {status}
      </div>
      <button {...readProps}>
        <span aria-hidden="true">{item.read ? '↺' : '✓'}</span>
      </button>
      <span className="il-item-unread-marker" aria-hidden="true" />
    </li>
  );
}

/** A tile that draws the project badge from `TData` instead of initials. */
function ProjectAvatar({ item, kind, slotProps }: AvatarPartProps<ProjectData>) {
  if (kind === 'none') return null;
  return (
    <span {...slotProps}>
      <span className="pg-project-badge" aria-hidden="true">
        {item.data?.badge ?? '•'}
      </span>
    </span>
  );
}

/** A header with its own layout; the heading id still names the dialog. */
function ProjectHeader({ title, headingProps, slotProps, filters, close }: HeaderPartProps) {
  return (
    <header {...slotProps} className={joinClasses(slotProps.className, 'pg-project-header')}>
      <div>
        <p className="pg-project-eyebrow">Projects</p>
        <h2 {...headingProps}>{title}</h2>
      </div>
      <div className="pg-project-controls">
        {filters}
        {close}
      </div>
    </header>
  );
}

/** Custom filter pills; each button still spends its prepared props. */
function ProjectFilters({ options, slotProps }: FiltersPartProps) {
  return (
    <div {...slotProps} className={joinClasses(slotProps.className, 'pg-project-filters')}>
      {options.map((option) => (
        <button
          key={option.value}
          {...option.props}
          className={joinClasses(option.props.className, 'pg-project-filter')}
        >
          {option.label}
        </button>
      ))}
    </div>
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
  const [workspace, setWorkspace] = useState<'a' | 'b'>('a');

  return (
    <main className={`pg-page pg-page-${theme}`}>
      <header className="pg-header">
        <div>
          <p className="pg-eyebrow">Iteration 21 · HTTP adapters and gallery</p>
          <h1>Inboxline layouts</h1>
          <p className="pg-lead">
            The bell opens a non-modal panel placed against its trigger, portalled out of the page
            and capped by the viewport. It shares the feed&apos;s rows, filters and actions, and
            closing it leaves the provider running. The feed remains available as a standalone
            layout, both can be restyled or partially replaced without touching the controller, and
            the optional Motion kit changes how the same surface moves. Every loading, empty, error,
            pending and unknown state is collected in the fixed gallery, the same widgets are
            available story by story in Storybook, and the section below compares the mock adapter
            with a real HTTP adapter backed by the teaching server.
          </p>
        </div>
        <div className="pg-header-actions">
          <a className="pg-link" href="./gallery.html">
            Open the state gallery →
          </a>
          <button
            type="button"
            onClick={() => setTheme((current) => (current === 'dark' ? 'light' : 'dark'))}
          >
            {theme === 'dark' ? 'Light theme' : 'Dark theme'}
          </button>
        </div>
      </header>

      <section className="pg-section">
        <h2>One provider, three views</h2>
        <p className="pg-meta">
          The bell, the counter card and the feed share one snapshot and one unread counter. The
          bell opens a portalled panel in the default popover layout; the feed is the same surface
          with <code>layout=&quot;feed&quot;</code>. Filter and panel values are uncontrolled here
          (internal to the provider). Activating a row marks it read and reports its title below.
        </p>
        <InboxProvider
          adapter={adapter}
          context={WORKSPACE_A}
          theme={theme}
          onNotificationClick={(clicked) => setOpened(clicked.title)}
        >
          <CounterCard title="Bell counter" />
          <Inbox />
          <Inbox layout="feed" />
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

      <HttpSection theme={theme} />

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

      <section className="pg-section">
        <h2>Switch workspace</h2>
        <p className="pg-meta">
          The context is a provider prop. Switching it abandons in-flight work, resets the list and
          the counter, and loads the other workspace through the same adapter. Nothing from the
          previous context leaks into the new one.
        </p>
        <div className="pg-row">
          <button type="button" aria-pressed={workspace === 'a'} onClick={() => setWorkspace('a')}>
            Workspace A
          </button>
          <button type="button" aria-pressed={workspace === 'b'} onClick={() => setWorkspace('b')}>
            Workspace B
          </button>
        </div>
        <InboxProvider
          adapter={adapter}
          context={workspace === 'a' ? WORKSPACE_A : WORKSPACE_B}
          theme={theme}
        >
          <Inbox layout="feed" />
        </InboxProvider>
      </section>

      <section className="pg-section">
        <h2>Locales and containers</h2>
        <p className="pg-meta">
          The same feed in Russian inside a 320 px container, and in English at the designed 800 px
          width. Width comes from the container, not the browser window; the filters and rows reflow
          without horizontal scrolling.
        </p>
        <div className="pg-grid">
          <div style={{ width: 320, maxWidth: '100%' }}>
            <InboxProvider
              adapter={adapter}
              context={WORKSPACE_A}
              theme={theme}
              config={{ locale: 'ru', timeZone: 'Europe/Moscow' }}
            >
              <Inbox layout="feed" />
            </InboxProvider>
          </div>
          <div style={{ width: 'min(100%, 800px)' }}>
            <InboxProvider
              adapter={adapter}
              context={WORKSPACE_B}
              theme={theme}
              config={{ locale: 'en', timeZone: 'UTC' }}
            >
              <Inbox layout="feed" />
            </InboxProvider>
          </div>
        </div>
      </section>

      <section className="pg-section">
        <h2>State gallery</h2>
        <p className="pg-meta">
          The gallery is a separate page with fixed data and a fixed clock: loading, empty,
          first-page and next-page errors, pending and unknown reads, a refused bulk action, an
          external update, a 128-unread counter, long content, broken avatars, a narrow container
          and an adapter without <code>subscribe</code>. Each tile carries <code>data-il-case</code>{' '}
          and <code>data-il-state</code> so a browser check can find it without parsing the markup.
        </p>
        <p className="pg-row">
          <a className="pg-link" href="./gallery.html">
            Open gallery.html →
          </a>
        </p>
      </section>

      <section className="pg-section">
        <h2>Custom row with typed data</h2>
        <p className="pg-meta">
          <code>components.NotificationItem</code> receives <code>TData</code> together with the
          prepared activation, read action, avatar and status nodes. The demo reads{' '}
          <code>item.data.project</code> and draws its own badge; marking read, the unread filter
          and the focus hand-off still run through the library.
        </p>
        <InboxProvider<ProjectData>
          adapter={projectAdapter}
          context={PROJECT_CONTEXT}
          theme={theme}
          components={{ NotificationItem: ProjectRow, Avatar: ProjectAvatar }}
          onNotificationClick={(clicked) => setOpened(clicked.title)}
        >
          <Inbox layout="feed" />
        </InboxProvider>
      </section>

      <section className="pg-section">
        <h2>Alternative header and filters</h2>
        <p className="pg-meta">
          The header owns its layout but places the prepared <code>headingProps</code>, so the
          dialog keeps its accessible name. The custom filter buttons spread{' '}
          <code>option.props</code>: the selection still belongs to the provider.
        </p>
        <InboxProvider<ProjectData>
          adapter={projectAdapter}
          context={PROJECT_CONTEXT}
          theme={theme}
          components={{ Header: ProjectHeader, Filters: ProjectFilters }}
          onNotificationClick={(clicked) => setOpened(clicked.title)}
        >
          <Inbox layout="feed" />
        </InboxProvider>
      </section>

      <section className="pg-section">
        <h2>CSS theme through classes</h2>
        <p className="pg-meta">
          <code>className</code> lands on the bell trigger and the portalled panel, while{' '}
          <code>classNames</code> adds per-slot hooks next to the stable <code>il-*</code> classes.
          The lilac accent and tighter geometry below are plain CSS custom properties, not a second
          styling system.
        </p>
        <InboxProvider<ProjectData>
          adapter={projectAdapter}
          context={PROJECT_CONTEXT}
          theme={theme}
          className="pg-theme-lilac"
          classNames={{
            root: 'pg-theme-surface',
            header: 'pg-theme-header',
            item: 'pg-theme-item',
          }}
          onNotificationClick={(clicked) => setOpened(clicked.title)}
        >
          <Inbox />
          <Inbox layout="feed" />
        </InboxProvider>
      </section>

      <section className="pg-section">
        <h2>Motion kit</h2>
        <p className="pg-meta">
          The same feed under <code>@nickkupriyanov/inboxline-react/motion</code>. Rows spring in,
          the measured height follows its content and a row leaving the unread filter fades and
          collapses itself. Everything else — the controller, the parts, the class hooks and the
          accessibility attributes — is identical; switching back to the CSS kit is one provider
          prop. With <code>prefers-reduced-motion</code> enabled both kits become still.
        </p>
        <MotionInboxProvider
          adapter={adapter}
          context={WORKSPACE_A}
          theme={theme}
          onNotificationClick={(clicked) => setOpened(clicked.title)}
        >
          <Inbox layout="feed" />
        </MotionInboxProvider>
      </section>
    </main>
  );
}
