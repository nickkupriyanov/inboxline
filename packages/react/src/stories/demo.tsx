/**
 * Deterministic demo data and drivers shared by the stories.
 *
 * Nothing here is random and no story reads the wall clock: every relative label
 * is derived from `DEMO_NOW`, and each adapter is built per story. Drivers only
 * call public actions (`setRead`, `loadMore`, `markAllRead`) or the mock's
 * documented scenario controls, so a story shows the widget's real output for a
 * real input rather than a drawing of it.
 */
import { useEffect, useMemo, useRef } from 'react';
import type { ReactNode } from 'react';
import { InboxError, createMockAdapter } from '@nickkupriyanov/inboxline-core';
import type {
  InboxAdapter,
  InboxContext,
  InboxInitialData,
  InboxLayout,
  InboxMockAdapter,
  InboxMockLatency,
  InboxMockOperation,
  InboxNotification,
  InboxPage,
} from '@nickkupriyanov/inboxline-core';
import { Inbox, InboxProvider, useInboxFlow } from '../index';
import type { AnimationKit, InboxClassNames, InboxComponents, InboxTheme } from '../index';

/** 20 October 2026, 12:00 UTC: a fixed “now” for every story. */
export const DEMO_NOW = Date.UTC(2026, 9, 20, 12, 0, 0);

/** The fixed clock every provider and mock adapter receives. */
export const demoClock = { now: () => DEMO_NOW };

export const CONTEXT_A = { key: 'story-workspace-a' };
export const CONTEXT_B = { key: 'story-workspace-b' };

/** Application data carried by the demo notifications through `TData`. */
export interface DemoData {
  project: string;
  kind: 'deploy' | 'comment' | 'access' | 'digest';
}

function minutesAgo(minutes: number): string {
  return new Date(DEMO_NOW - minutes * 60_000).toISOString();
}

function avatar(seed: string): string {
  return `https://picsum.photos/seed/inboxline-${seed}/96/96`;
}

/** Six ordinary rows: three unread, two days of history and a variety of fields. */
export const demoNotifications: readonly InboxNotification<DemoData>[] = [
  {
    id: 'n-deploy',
    createdAt: minutesAgo(8),
    title: 'Deploy finished',
    body: 'inboxline-web is live on production. All smoke checks passed.',
    author: { id: 'release-bot', name: 'Release bot', avatarUrl: avatar('release') },
    read: false,
    data: { project: 'inboxline-web', kind: 'deploy' },
  },
  {
    id: 'n-comment',
    createdAt: minutesAgo(42),
    title: 'New comment on “SSR checklist”',
    body: 'Maria left a note about the hydration fallback and the seed format.',
    author: { id: 'maria', name: 'Maria Ivanova', avatarUrl: avatar('maria') },
    read: false,
    data: { project: 'inboxline-web', kind: 'comment' },
  },
  {
    id: 'n-access',
    createdAt: minutesAgo(19 * 60 + 20),
    title: 'Access request approved',
    body: 'Workspace analytics is now available to you.',
    author: { id: 'security', name: 'Access review' },
    read: true,
    data: { project: 'analytics', kind: 'access' },
  },
  {
    id: 'n-digest',
    createdAt: minutesAgo(26 * 60),
    title: 'Weekly digest',
    body: 'Four events happened in the last seven days.',
    read: false,
    data: { project: 'workspace', kind: 'digest' },
  },
  {
    id: 'n-icon',
    createdAt: minutesAgo(30 * 60),
    title: 'Backup finished',
    body: 'The nightly backup is stored and verified.',
    icon: 'https://picsum.photos/seed/inboxline-backup/96/96',
    read: true,
    data: { project: 'infrastructure', kind: 'deploy' },
  },
  {
    id: 'n-plain',
    createdAt: minutesAgo(51 * 60),
    title: 'No author, no body',
    read: true,
    data: { project: 'workspace', kind: 'digest' },
  },
];

/** Long strings for wrapping and clamping checks. */
export const longNotifications: readonly InboxNotification<DemoData>[] = [
  {
    id: 'long-1',
    createdAt: minutesAgo(3),
    title:
      'A very long notification title that keeps going long after the row has run out of room ' +
      'and has to wrap onto several lines without pushing the actions out of the card',
    body:
      'The body is also deliberately long. It mentions the deployment pipeline, the review ' +
      'checklist, the hydration fallback and the fact that a notification body is plain text: ' +
      'no markup is interpreted, so this sentence is rendered exactly as written. '.repeat(3),
    author: {
      id: 'long-author',
      name: 'An Author With A Name Long Enough To Need Its Own Line In Narrow Containers',
      avatarUrl: avatar('long-author'),
    },
    read: false,
    data: { project: 'a-project-with-a-long-name', kind: 'comment' },
  },
  {
    id: 'long-2',
    createdAt: minutesAgo(35),
    title: 'Another long row without an avatar',
    body: 'Short body, long title above, and no author at all. '.repeat(4),
    read: true,
    data: { project: 'workspace', kind: 'digest' },
  },
];

/** An author whose image will never load, so the initials fallback is visible. */
export const brokenAvatarNotifications: readonly InboxNotification<DemoData>[] = [
  {
    id: 'broken-avatar',
    createdAt: minutesAgo(6),
    title: 'The avatar URL is broken',
    body: 'The image request fails and the row falls back to the author initials.',
    author: {
      id: 'broken',
      name: 'Broken Image',
      avatarUrl: 'https://broken.inboxline.test/never-there.png',
    },
    read: false,
    data: { project: 'workspace', kind: 'comment' },
  },
  {
    id: 'broken-icon',
    createdAt: minutesAgo(24),
    title: 'The notification icon is broken',
    body: 'A missing icon falls back to the built-in glyph.',
    icon: 'https://broken.inboxline.test/never-there.svg',
    read: false,
    data: { project: 'infrastructure', kind: 'deploy' },
  },
];

/** One event added by “another client”, used by the updates story. */
export const incomingNotification: InboxNotification<DemoData> = {
  id: 'n-incoming',
  createdAt: minutesAgo(0),
  title: 'Another client added this event',
  body: 'The counter updates, while the open list waits for “Show updates”.',
  read: false,
  data: { project: 'workspace', kind: 'comment' },
};

function unreadOf(notifications: readonly InboxNotification[]): number {
  return notifications.filter((notification) => !notification.read).length;
}

/** A page and counter as a server would return them. */
export function demoSeed(
  options: {
    notifications?: readonly InboxNotification<DemoData>[];
    unreadCount?: number;
    nextCursor?: string | null;
  } = {},
): InboxInitialData<DemoData> {
  const notifications = options.notifications ?? demoNotifications;
  const page: InboxPage<DemoData> = {
    items: [...notifications],
    nextCursor: options.nextCursor ?? null,
  };
  return {
    page,
    unreadCount: options.unreadCount ?? unreadOf(notifications),
    now: DEMO_NOW,
  };
}

/** A deterministic mock adapter for one context. */
export function demoAdapter(
  options: {
    notifications?: readonly InboxNotification<DemoData>[];
    pageSize?: number;
    latencyMs?: InboxMockLatency;
    context?: InboxContext;
  } = {},
): InboxMockAdapter<DemoData> {
  return createMockAdapter<DemoData>({
    clock: demoClock,
    pageSize: options.pageSize ?? demoNotifications.length,
    contexts: [
      {
        context: options.context ?? CONTEXT_A,
        notifications: options.notifications ?? demoNotifications,
      },
    ],
    ...(options.latencyMs === undefined ? {} : { latencyMs: options.latencyMs }),
  });
}

/* -------------------------------------------------------------------------- */
/*  Adapters that reach a state                                                */
/* -------------------------------------------------------------------------- */

/** The first list request is refused; a retry succeeds. */
export function firstPageFailureAdapter(): InboxAdapter<DemoData> {
  const inner = demoAdapter();
  let failed = false;
  return {
    ...inner,
    async getNotifications(query) {
      if (!failed) {
        failed = true;
        throw new InboxError({
          code: 'ADAPTER_FAILURE',
          phase: 'load',
          message: 'The story refused the first page on purpose',
        });
      }
      return inner.getNotifications(query);
    },
  };
}

/** The first page loads, every next page is refused. */
export function nextPageFailureAdapter(): InboxAdapter<DemoData> {
  const inner = demoAdapter({ pageSize: 2 });
  return {
    ...inner,
    async getNotifications(query) {
      if (query.cursor !== null) {
        throw new InboxError({
          code: 'ADAPTER_FAILURE',
          phase: 'load',
          message: 'The story refuses every next page on purpose',
        });
      }
      return inner.getNotifications(query);
    },
  };
}

/** `setReadStatus` never settles, so the pending layer stays visible. */
export function pendingReadAdapter(): InboxAdapter<DemoData> {
  return demoAdapter({
    latencyMs: (operation: InboxMockOperation) => (operation === 'setReadStatus' ? 60_000 : 0),
  });
}

/**
 * `setReadStatus` applies the change and then loses the answer.
 *
 * The automatic reconciliation would normally resolve the unknown row in a few
 * milliseconds, so the adapter lets the first list request through and never
 * settles a later one: the row stays in the “checking with the server” state that
 * the story is about.
 */
export function unknownReadAdapter(): InboxAdapter<DemoData> {
  const base = demoAdapter();
  base.failNext('setReadStatus', { apply: true, outcome: 'unknown' });
  let listCalls = 0;
  return {
    ...base,
    getNotifications(query) {
      listCalls += 1;
      if (listCalls > 1) return new Promise<InboxPage<DemoData>>(() => {});
      return base.getNotifications(query);
    },
  };
}

/** `markAllRead` is refused by the server. */
export function refusedBulkAdapter(): InboxAdapter<DemoData> {
  const inner = demoAdapter();
  inner.failNext('markAllRead', { outcome: 'rejected' });
  return inner;
}

/** A plain adapter with no `subscribe`: the library works without a transport. */
export function noSubscriptionAdapter(): InboxAdapter<DemoData> {
  const { subscribe: _subscribe, ...adapter } = demoAdapter();
  return adapter;
}

/** One adapter with two workspaces, for the context-switch story. */
export function demoWorkspaceAdapter(): InboxMockAdapter<DemoData> {
  return createMockAdapter<DemoData>({
    clock: demoClock,
    contexts: [
      { context: CONTEXT_A, notifications: demoNotifications },
      {
        context: CONTEXT_B,
        notifications: [
          {
            id: 'b-welcome',
            createdAt: minutesAgo(12),
            title: 'Workspace B is a different inbox',
            body: 'Switching the context abandons in-flight work and resets the list and counter.',
            read: false,
            data: { project: 'workspace-b', kind: 'access' },
          },
          {
            id: 'b-digest',
            createdAt: minutesAgo(700),
            title: 'B digest',
            body: 'Two events in workspace B.',
            read: true,
            data: { project: 'workspace-b', kind: 'digest' },
          },
        ],
      },
    ],
  });
}

/* -------------------------------------------------------------------------- */
/*  Drivers                                                                    */
/* -------------------------------------------------------------------------- */

/** Calls `setRead` once, as a visitor pressing the row action would. */
export function ReadDriver({ id, read = true }: { id: string; read?: boolean }) {
  const { snapshot, actions } = useInboxFlow<DemoData>();
  const started = useRef(false);
  const ready = snapshot.view.list.items.some((item) => item.id === id);

  useEffect(() => {
    if (!ready) return;
    // A child effect runs before the provider's own `start()`, and `setRead`
    // needs a live controller; the tick lets the first load begin.
    const timer = setTimeout(() => {
      if (started.current) return;
      started.current = true;
      void actions.setRead(id, read);
    }, 0);
    return () => clearTimeout(timer);
  }, [actions, id, read, ready]);

  return null;
}

/** Asks for the next page once, which is how the next-page error is reached. */
export function LoadMoreDriver() {
  const { snapshot, actions } = useInboxFlow<DemoData>();
  const started = useRef(false);

  useEffect(() => {
    if (!snapshot.view.page.hasMore || snapshot.view.page.loading) return;
    if (snapshot.view.page.error !== null) return;
    const timer = setTimeout(() => {
      if (started.current) return;
      started.current = true;
      void actions.loadMore();
    }, 0);
    return () => clearTimeout(timer);
  }, [actions, snapshot]);

  return null;
}

/** Runs the server-side bulk action once the counter allows it. */
export function MarkAllDriver() {
  const { snapshot, actions } = useInboxFlow<DemoData>();
  const started = useRef(false);

  useEffect(() => {
    if (!snapshot.view.actions.canMarkAllRead) return;
    const timer = setTimeout(() => {
      if (started.current) return;
      started.current = true;
      void actions.markAllRead();
    }, 0);
    return () => clearTimeout(timer);
  }, [actions, snapshot]);

  return null;
}

/**
 * Announces a change the way another client would: the mock stores a row and
 * then calls `invalidate()`. The open list deliberately keeps its rows.
 */
export function InvalidateDriver({ adapter }: { adapter: InboxMockAdapter<DemoData> }) {
  useEffect(() => {
    const timeout = setTimeout(() => {
      adapter.addNotification(CONTEXT_A, incomingNotification);
      adapter.invalidate(CONTEXT_A);
    }, 600);
    return () => clearTimeout(timeout);
  }, [adapter]);
  return null;
}

/* -------------------------------------------------------------------------- */
/*  Wrapper                                                                    */
/* -------------------------------------------------------------------------- */

export interface DemoInboxProps {
  adapter?: InboxAdapter<DemoData>;
  context?: InboxContext;
  layout?: InboxLayout;
  theme?: InboxTheme;
  locale?: 'en' | 'ru';
  timeZone?: string;
  initialData?: InboxInitialData<DemoData>;
  components?: InboxComponents<DemoData>;
  classNames?: InboxClassNames;
  animations?: AnimationKit;
  className?: string;
  defaultOpen?: boolean;
  children?: ReactNode;
}

/**
 * The provider plus one ready-made layout.
 *
 * Storybook's theme toolbar wins over the `theme` arg, so every story can be
 * inspected in both designed palettes without a second copy of the markup.
 */
export function DemoInbox({
  adapter,
  context = CONTEXT_A,
  layout = 'feed',
  theme = 'dark',
  locale = 'en',
  timeZone = 'UTC',
  initialData,
  components,
  classNames,
  animations,
  className,
  defaultOpen,
  children,
}: DemoInboxProps) {
  const fallbackAdapter = useMemo(() => demoAdapter(), []);
  const resolvedAdapter = adapter ?? fallbackAdapter;
  return (
    <InboxProvider<DemoData>
      adapter={resolvedAdapter}
      context={context}
      clock={demoClock}
      theme={theme}
      config={{ locale, timeZone }}
      {...(initialData === undefined ? {} : { initialData })}
      {...(components === undefined ? {} : { components })}
      {...(classNames === undefined ? {} : { classNames })}
      {...(animations === undefined ? {} : { animations })}
      {...(className === undefined ? {} : { className })}
      {...(defaultOpen === undefined ? {} : { defaultOpen })}
    >
      {children ?? <Inbox layout={layout} />}
    </InboxProvider>
  );
}
