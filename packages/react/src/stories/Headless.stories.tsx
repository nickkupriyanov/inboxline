import { useMemo, useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import {
  Inbox,
  InboxProvider,
  useInboxFlow,
  useInboxUI,
  type InboxFilter,
  type InboxTheme,
} from '../index';
import { CONTEXT_A, DemoInbox, demoAdapter, demoClock, demoSeed, type DemoData } from './demo';

/**
 * The widget owns no data.
 *
 * `useInboxFlow()` exposes the same snapshot and actions the built-in parts
 * render, and `useInboxUI()` the resolved copy, theme and controlled values. A
 * custom UI is therefore a normal consumer: it can sit next to the bell and the
 * feed under one provider, or replace them entirely.
 */
const meta: Meta = {
  title: 'Headless/Inbox',
  parameters: {
    docs: {
      description: {
        component:
          'The headless surface is `{ snapshot, actions }` plus the presentation values. The examples below never duplicate the counter arithmetic, the read queue or the pagination: they render what the snapshot says and call the public actions.',
      },
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

function CounterCard({ title }: { title: string }) {
  const { snapshot } = useInboxFlow<DemoData>();
  const view = snapshot.view;
  return (
    <div className="sb-card">
      <p className="sb-caption">{title}</p>
      <p className="sb-counter">
        {view.counter.known ? view.counter.unreadCount : 'unknown'}
        <span className="sb-counter-unit"> unread</span>
      </p>
      <p className="sb-note">
        {view.counter.label ?? 'The server has not answered yet'} · page {view.list.items.length}{' '}
        loaded · filter {view.settings.filter}
      </p>
    </div>
  );
}

function CustomList() {
  const { snapshot, actions } = useInboxFlow<DemoData>();
  const ui = useInboxUI<DemoData>();
  const view = snapshot.view;

  if (view.list.loading && view.list.items.length === 0) {
    return <p className="sb-note">{view.list.loadingLabel}</p>;
  }
  if (view.list.error !== null) {
    return (
      <div className="sb-card">
        <p className="sb-note">{view.list.error}</p>
        <button type="button" onClick={() => void actions.retry()}>
          {ui.messages.retryLabel}
        </button>
      </div>
    );
  }
  if (view.list.items.length === 0) {
    return <p className="sb-note">{view.list.emptyLabel}</p>;
  }

  return (
    <div className="sb-card">
      <div className="sb-controls" style={{ marginTop: 0 }}>
        <button
          type="button"
          onClick={() => actions.setFilter(view.settings.filter === 'all' ? 'unread' : 'all')}
        >
          Show {view.settings.filter === 'all' ? 'unread' : 'all'}
        </button>
        <button
          type="button"
          disabled={!view.actions.canMarkAllRead}
          onClick={() => void actions.markAllRead()}
        >
          {ui.messages.markAllReadLabel}
        </button>
        <button type="button" onClick={() => void actions.refresh()}>
          Refresh
        </button>
      </div>
      <ul className="sb-headless-list">
        {view.list.items.map((item) => (
          <li key={item.id} className="sb-headless-row">
            <span>
              <strong>{item.title}</strong>
              <span className="sb-note"> · {item.timeLabel}</span>
            </span>
            <button
              type="button"
              aria-pressed={!item.read}
              onClick={() => void actions.setRead(item.id, !item.read)}
            >
              {item.read ? ui.messages.markUnreadLabel : ui.messages.markReadLabel}
            </button>
          </li>
        ))}
      </ul>
      {view.page.hasMore ? (
        <button type="button" onClick={() => void actions.loadMore()}>
          {view.page.label}
        </button>
      ) : null}
    </div>
  );
}

function Dashboards({ theme, shipped }: { theme: InboxTheme; shipped: boolean }) {
  const adapter = useMemo(() => demoAdapter(), []);
  return (
    <InboxProvider
      adapter={adapter}
      context={CONTEXT_A}
      clock={demoClock}
      theme={theme}
      config={{ locale: 'en', timeZone: 'UTC' }}
      initialData={demoSeed()}
    >
      <div className="sb-stack" style={{ alignItems: 'flex-start' }}>
        <CounterCard title="Headless counter" />
        <CustomList />
        {shipped ? (
          <>
            <div className="sb-column">
              <p className="sb-caption">Bell</p>
              <Inbox />
            </div>
            <div className="sb-column sb-frame">
              <p className="sb-caption">Feed</p>
              <Inbox layout="feed" />
            </div>
          </>
        ) : null}
      </div>
    </InboxProvider>
  );
}

export const CustomDashboard: Story = {
  name: 'Custom list, counter and actions',
  render: (_args, context) => (
    <Dashboards theme={(context.globals.theme as InboxTheme) ?? 'dark'} shipped={false} />
  ),
  parameters: {
    docs: {
      description: {
        story:
          'A fully custom front end next to the shipped compositions: one controller, one counter, one read queue. The list calls `setRead`, `loadMore`, `markAllRead` and `refresh`; it never computes a counter or a pending layer itself.',
      },
    },
  },
};

export const SharedProvider: Story = {
  name: 'Shared provider — bell, feed and counter',
  render: (_args, context) => (
    <Dashboards theme={(context.globals.theme as InboxTheme) ?? 'dark'} shipped />
  ),
};

function ControlledValues({ theme }: { theme: InboxTheme }) {
  const [filter, setFilter] = useState<InboxFilter>('all');
  const [open, setOpen] = useState(false);
  return (
    <div className="sb-column">
      <div className="sb-controls">
        <button type="button" onClick={() => setFilter(filter === 'all' ? 'unread' : 'all')}>
          Controlled filter: {filter}
        </button>
        <button type="button" onClick={() => setOpen((current) => !current)}>
          Controlled open: {String(open)}
        </button>
      </div>
      <p className="sb-note">
        The application owns both values. The provider calls `onFilterChange`/`onOpenChange` and
        waits for the prop; the copy in the panel is the applied filter, not the requested one.
      </p>
      <InboxProvider
        adapter={demoAdapter()}
        context={CONTEXT_A}
        clock={demoClock}
        theme={theme}
        config={{ locale: 'en', timeZone: 'UTC' }}
        initialData={demoSeed()}
        filter={filter}
        onFilterChange={setFilter}
        open={open}
        onOpenChange={setOpen}
      >
        <Inbox />
        <Inbox layout="feed" />
      </InboxProvider>
    </div>
  );
}

export const Controlled: Story = {
  name: 'Controlled filter and open',
  render: (_args, context) => (
    <ControlledValues theme={(context.globals.theme as InboxTheme) ?? 'dark'} />
  ),
  parameters: {
    docs: {
      description: {
        story:
          '`filter` and `open` are controlled at creation: the buttons above change the props, and only then does the provider move. The widget’s own filter buttons call `onFilterChange` without echoing a change back.',
      },
    },
  },
};

export const ProviderOnly: Story = {
  name: 'Provider and one feed',
  render: (_args, context) => (
    <DemoInbox
      adapter={demoAdapter()}
      initialData={demoSeed()}
      theme={(context.globals.theme as InboxTheme) ?? 'dark'}
      layout="feed"
    />
  ),
};
