import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { InboxError, createMockAdapter } from '@nickkupriyanov/inboxline-core';
import type {
  InboxAdapter,
  InboxInitialData,
  InboxMockAdapter,
  InboxMockLatency,
  InboxMockOperation,
  InboxNotification,
} from '@nickkupriyanov/inboxline-core';
import {
  Inbox,
  InboxProvider,
  useInboxFlow,
  type InboxLayout,
  type InboxTheme,
} from '@nickkupriyanov/inboxline-react';
import '@nickkupriyanov/inboxline-react/styles.css';
import './gallery.css';

/**
 * The fixed state gallery.
 *
 * Every tile renders the real widget — a slow adapter, a failing one, a lost
 * mutation answer, a server refusal or an event from another client — and marks
 * itself with `data-il-case`, `data-il-state`, `data-il-layout`, `data-il-theme`
 * and `data-il-locale`. Those hooks let a later browser check find a case without
 * counting figures. Time and data are fixed: the clock is `GALLERY_NOW`, every
 * adapter is created from explicit fixtures, and nothing reads the wall clock.
 */

const GALLERY_NOW = Date.UTC(2026, 9, 20, 12, 0, 0);
const GALLERY_CONTEXT = { key: 'gallery-workspace' };
const galleryClock = { now: () => GALLERY_NOW };

function minutesAgo(minutes: number): string {
  return new Date(GALLERY_NOW - minutes * 60_000).toISOString();
}

function avatar(seed: string): string {
  return `https://picsum.photos/seed/inboxline-gallery-${seed}/96/96`;
}

const BASE: readonly InboxNotification[] = [
  {
    id: 'g-deploy',
    createdAt: minutesAgo(7),
    title: 'Deploy finished',
    body: 'inboxline-web is live on production.',
    author: { name: 'Release bot', avatarUrl: avatar('release') },
    read: false,
  },
  {
    id: 'g-comment',
    createdAt: minutesAgo(38),
    title: 'New comment on “SSR checklist”',
    body: 'Maria left a note about the hydration fallback.',
    author: { name: 'Maria Ivanova', avatarUrl: avatar('maria') },
    read: false,
  },
  {
    id: 'g-access',
    createdAt: minutesAgo(20 * 60),
    title: 'Access request approved',
    body: 'Workspace analytics is now available to you.',
    read: true,
  },
  {
    id: 'g-digest',
    createdAt: minutesAgo(27 * 60),
    title: 'Weekly digest',
    body: 'Four events happened in the last seven days.',
    read: false,
  },
];

const LONG: readonly InboxNotification[] = [
  {
    id: 'g-long',
    createdAt: minutesAgo(3),
    title:
      'A long notification title that keeps going after the row has run out of room and wraps ' +
      'onto several lines without pushing the actions out of the card',
    body:
      'The body is deliberately long too: deployment pipeline, review checklist, hydration ' +
      'fallback and a reminder that notification text is plain text. '.repeat(3),
    author: {
      name: 'An Author With A Name Long Enough To Need A Line Of Its Own In Narrow Containers',
      avatarUrl: avatar('long'),
    },
    read: false,
  },
  {
    id: 'g-long-2',
    createdAt: minutesAgo(44),
    title: 'A second long row without an avatar',
    body: 'Short body, long title above, and no author at all. '.repeat(4),
    read: true,
  },
];

const BROKEN: readonly InboxNotification[] = [
  {
    id: 'g-broken-avatar',
    createdAt: minutesAgo(5),
    title: 'The avatar URL is broken',
    body: 'The image fails and the row shows the author initials.',
    author: { name: 'Broken Image', avatarUrl: 'https://broken.inboxline.test/missing.png' },
    read: false,
  },
  {
    id: 'g-broken-icon',
    createdAt: minutesAgo(21),
    title: 'The notification icon is broken',
    body: 'A missing icon falls back to the built-in glyph.',
    icon: 'https://broken.inboxline.test/missing.svg',
    read: false,
  },
];

function unreadOf(notifications: readonly InboxNotification[]): number {
  return notifications.filter((notification) => !notification.read).length;
}

function seedOf(
  notifications: readonly InboxNotification[],
  options: { unreadCount?: number; nextCursor?: string | null } = {},
): InboxInitialData {
  return {
    page: { items: [...notifications], nextCursor: options.nextCursor ?? null },
    unreadCount: options.unreadCount ?? unreadOf(notifications),
    now: GALLERY_NOW,
  };
}

function adapterOf(
  notifications: readonly InboxNotification[] = BASE,
  options: { pageSize?: number; latencyMs?: InboxMockLatency } = {},
): InboxMockAdapter {
  return createMockAdapter({
    clock: galleryClock,
    pageSize: options.pageSize ?? 10,
    contexts: [{ context: GALLERY_CONTEXT, notifications }],
    ...(options.latencyMs === undefined ? {} : { latencyMs: options.latencyMs }),
  });
}

/* -------------------------------------------------------------------------- */
/*  Adapters that reach a state                                                */
/* -------------------------------------------------------------------------- */

function firstPageFailure(): InboxAdapter {
  const inner = adapterOf();
  let failed = false;
  return {
    ...inner,
    async getNotifications(query) {
      if (!failed) {
        failed = true;
        throw new InboxError({
          code: 'ADAPTER_FAILURE',
          phase: 'load',
          message: 'The gallery refused the first page on purpose',
        });
      }
      return inner.getNotifications(query);
    },
  };
}

function nextPageFailure(): InboxAdapter {
  const inner = adapterOf(BASE, { pageSize: 2 });
  return {
    ...inner,
    async getNotifications(query) {
      if (query.cursor !== null) {
        throw new InboxError({
          code: 'ADAPTER_FAILURE',
          phase: 'load',
          message: 'The gallery refuses every next page on purpose',
        });
      }
      return inner.getNotifications(query);
    },
  };
}

function pendingRead(): InboxAdapter {
  return adapterOf(BASE, {
    latencyMs: (operation: InboxMockOperation) => (operation === 'setReadStatus' ? 60_000 : 0),
  });
}

function unknownRead(): InboxAdapter {
  const base = adapterOf();
  base.failNext('setReadStatus', { apply: true, outcome: 'unknown' });
  let listCalls = 0;
  return {
    ...base,
    getNotifications(query) {
      listCalls += 1;
      if (listCalls > 1) return new Promise<never>(() => {});
      return base.getNotifications(query);
    },
  };
}

function refusedBulk(): InboxAdapter {
  const base = adapterOf();
  base.failNext('markAllRead', { outcome: 'rejected' });
  return base;
}

function slowCount(): InboxAdapter {
  return adapterOf(BASE.slice(0, 3), {
    latencyMs: (operation: InboxMockOperation) => (operation === 'getUnreadCount' ? 60_000 : 0),
  });
}

/* -------------------------------------------------------------------------- */
/*  Drivers                                                                    */
/* -------------------------------------------------------------------------- */

function AutoRead({ id }: { id: string }) {
  const { snapshot, actions } = useInboxFlow();
  const started = useRef(false);
  const ready = snapshot.view.list.items.some((item) => item.id === id);

  useEffect(() => {
    if (!ready) return;
    const timer = setTimeout(() => {
      if (started.current) return;
      started.current = true;
      void actions.setRead(id, true);
    }, 0);
    return () => clearTimeout(timer);
  }, [actions, id, ready]);

  return null;
}

function AutoLoadMore() {
  const { snapshot, actions } = useInboxFlow();
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

function AutoMarkAll() {
  const { snapshot, actions } = useInboxFlow();
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

function AutoInvalidate({ adapter }: { adapter: InboxMockAdapter }) {
  useEffect(() => {
    const timeout = setTimeout(() => {
      adapter.addNotification(GALLERY_CONTEXT, {
        id: 'g-incoming',
        createdAt: minutesAgo(0),
        title: 'Another client added this event',
        body: 'The counter updates; the open list waits for “Show updates”.',
        read: false,
      });
      adapter.invalidate(GALLERY_CONTEXT);
    }, 600);
    return () => clearTimeout(timeout);
  }, [adapter]);

  return null;
}

/* -------------------------------------------------------------------------- */
/*  Tiles                                                                      */
/* -------------------------------------------------------------------------- */

interface TileProps {
  id: string;
  caption: string;
  state: string;
  theme: InboxTheme;
  locale: 'en' | 'ru';
  layout?: InboxLayout;
  width?: number;
  minHeight?: number;
  children: ReactNode;
}

function Tile({
  id,
  caption,
  state,
  theme,
  locale,
  layout = 'feed',
  width,
  minHeight,
  children,
}: TileProps) {
  return (
    <figure
      className="gallery__item"
      data-il-case={id}
      data-il-state={state}
      data-il-layout={layout}
      data-il-theme={theme}
      data-il-locale={locale}
      style={{
        ...(width === undefined ? {} : { width, maxWidth: '100%' }),
        ...(minHeight === undefined ? {} : { minHeight }),
      }}
    >
      <figcaption>{caption}</figcaption>
      {children}
    </figure>
  );
}

interface CaseProps {
  theme: InboxTheme;
  locale: 'en' | 'ru';
}

function ReadyCase({
  notifications,
  unreadCount,
  adapter,
  layout = 'feed',
  theme,
  locale,
  children,
  defaultOpen,
}: {
  notifications: readonly InboxNotification[];
  unreadCount?: number;
  adapter?: InboxAdapter;
  layout?: InboxLayout;
  theme: InboxTheme;
  locale: 'en' | 'ru';
  children?: ReactNode;
  defaultOpen?: boolean;
}) {
  const inner = useMemo(() => adapter ?? adapterOf(notifications), [adapter, notifications]);
  const seed = useMemo(
    () => seedOf(notifications, unreadCount === undefined ? {} : { unreadCount }),
    [notifications, unreadCount],
  );
  return (
    <InboxProvider
      adapter={inner}
      context={GALLERY_CONTEXT}
      clock={galleryClock}
      theme={theme}
      config={{ locale, timeZone: 'UTC' }}
      initialData={seed}
      {...(defaultOpen === undefined ? {} : { defaultOpen })}
    >
      <Inbox layout={layout} />
      {children}
    </InboxProvider>
  );
}

function LoadedCases({ theme, locale }: CaseProps) {
  const ready = useMemo(() => adapterOf(), []);
  return (
    <>
      <Tile id="feed-ready" caption="01 · feed, ready" state="ready" theme={theme} locale={locale}>
        <ReadyCase notifications={BASE} adapter={ready} theme={theme} locale={locale} />
      </Tile>

      <Tile id="feed-light" caption="02 · light theme" state="ready" theme="light" locale={locale}>
        <InboxProvider
          adapter={adapterOf()}
          context={GALLERY_CONTEXT}
          clock={galleryClock}
          theme="light"
          config={{ locale, timeZone: 'UTC' }}
          initialData={seedOf(BASE)}
        >
          <Inbox layout="feed" />
        </InboxProvider>
      </Tile>

      <Tile
        id="feed-narrow"
        caption="03 · container 320 px"
        state="ready"
        theme={theme}
        locale={locale}
        width={320}
      >
        <ReadyCase notifications={BASE} theme={theme} locale={locale} />
      </Tile>

      <Tile
        id="popover-open"
        caption="04 · popover, open"
        state="ready"
        theme={theme}
        locale={locale}
        layout="popover"
        minHeight={1000}
      >
        <ReadyCase
          notifications={BASE}
          layout="popover"
          defaultOpen
          theme={theme}
          locale={locale}
        />
      </Tile>

      <Tile
        id="large-counter"
        caption="05 · 128 unread, four loaded"
        state="ready"
        theme={theme}
        locale={locale}
      >
        <ReadyCase
          notifications={BASE.slice(0, 3)}
          unreadCount={128}
          adapter={slowCount()}
          theme={theme}
          locale={locale}
        />
      </Tile>

      <Tile
        id="long-content"
        caption="06 · long content"
        state="ready"
        theme={theme}
        locale={locale}
      >
        <ReadyCase notifications={LONG} theme={theme} locale={locale} />
      </Tile>

      <Tile
        id="broken-avatar"
        caption="07 · broken avatar and icon"
        state="ready"
        theme={theme}
        locale={locale}
      >
        <ReadyCase notifications={BROKEN} theme={theme} locale={locale} />
      </Tile>
    </>
  );
}

function LoadingCase({ theme, locale }: CaseProps) {
  const adapter = useMemo(() => adapterOf(BASE, { latencyMs: 60_000 }), []);
  return (
    <Tile id="loading" caption="08 · loading" state="loading" theme={theme} locale={locale}>
      <InboxProvider
        adapter={adapter}
        context={GALLERY_CONTEXT}
        clock={galleryClock}
        theme={theme}
        config={{ locale, timeZone: 'UTC' }}
      >
        <Inbox layout="feed" />
      </InboxProvider>
    </Tile>
  );
}

function EmptyCase({ theme, locale }: CaseProps) {
  return (
    <Tile id="empty" caption="09 · empty" state="empty" theme={theme} locale={locale}>
      <InboxProvider
        adapter={adapterOf([])}
        context={GALLERY_CONTEXT}
        clock={galleryClock}
        theme={theme}
        config={{ locale, timeZone: 'UTC' }}
        initialData={seedOf([], { unreadCount: 0 })}
      >
        <Inbox layout="feed" />
      </InboxProvider>
    </Tile>
  );
}

function FirstPageErrorCase({ theme, locale }: CaseProps) {
  const adapter = useMemo(() => firstPageFailure(), []);
  return (
    <Tile
      id="first-page-error"
      caption="10 · first page refused"
      state="error"
      theme={theme}
      locale={locale}
    >
      <InboxProvider
        adapter={adapter}
        context={GALLERY_CONTEXT}
        clock={galleryClock}
        theme={theme}
        config={{ locale, timeZone: 'UTC' }}
      >
        <Inbox layout="feed" />
      </InboxProvider>
    </Tile>
  );
}

function NextPageErrorCase({ theme, locale }: CaseProps) {
  const adapter = useMemo(() => nextPageFailure(), []);
  const seed = useMemo(() => seedOf(BASE.slice(0, 2), { nextCursor: 'gallery-next' }), []);
  return (
    <Tile
      id="next-page-error"
      caption="11 · next page refused"
      state="page-error"
      theme={theme}
      locale={locale}
    >
      <InboxProvider
        adapter={adapter}
        context={GALLERY_CONTEXT}
        clock={galleryClock}
        theme={theme}
        config={{ locale, timeZone: 'UTC' }}
        initialData={seed}
      >
        <Inbox layout="feed" />
        <AutoLoadMore />
      </InboxProvider>
    </Tile>
  );
}

function PendingCase({ theme, locale }: CaseProps) {
  return (
    <Tile
      id="read-pending"
      caption="12 · read pending"
      state="pending"
      theme={theme}
      locale={locale}
    >
      <ReadyCase notifications={BASE} adapter={pendingRead()} theme={theme} locale={locale}>
        <AutoRead id="g-comment" />
      </ReadyCase>
    </Tile>
  );
}

function UnknownCase({ theme, locale }: CaseProps) {
  return (
    <Tile
      id="read-unknown"
      caption="13 · read answer lost"
      state="unknown"
      theme={theme}
      locale={locale}
    >
      <ReadyCase notifications={BASE} adapter={unknownRead()} theme={theme} locale={locale}>
        <AutoRead id="g-comment" />
      </ReadyCase>
    </Tile>
  );
}

function BulkRefusedCase({ theme, locale }: CaseProps) {
  return (
    <Tile
      id="bulk-refused"
      caption="14 · mark all refused"
      state="error"
      theme={theme}
      locale={locale}
    >
      <ReadyCase notifications={BASE} adapter={refusedBulk()} theme={theme} locale={locale}>
        <AutoMarkAll />
      </ReadyCase>
    </Tile>
  );
}

function UpdatesCase({ theme, locale }: CaseProps) {
  const adapter = useMemo(() => adapterOf(), []);
  return (
    <Tile
      id="updates-available"
      caption="15 · another client wrote"
      state="updates"
      theme={theme}
      locale={locale}
    >
      <ReadyCase notifications={BASE} adapter={adapter} theme={theme} locale={locale}>
        <AutoInvalidate adapter={adapter} />
      </ReadyCase>
    </Tile>
  );
}

function NoSubscriptionCase({ theme, locale }: CaseProps) {
  const adapter = useMemo(() => {
    const inner = adapterOf();
    const { subscribe: _subscribe, ...plain } = inner;
    return plain;
  }, []);
  return (
    <Tile
      id="no-subscribe"
      caption="16 · no invalidation transport"
      state="ready"
      theme={theme}
      locale={locale}
    >
      <ReadyCase notifications={BASE} adapter={adapter} theme={theme} locale={locale} />
    </Tile>
  );
}

/* -------------------------------------------------------------------------- */
/*  Page                                                                       */
/* -------------------------------------------------------------------------- */

function Gallery() {
  const [theme, setTheme] = useState<InboxTheme>(() => {
    const requested = new URLSearchParams(window.location.search).get('theme');
    return requested === 'light' ? 'light' : 'dark';
  });
  const [locale, setLocale] = useState<'en' | 'ru'>(() => {
    const requested = new URLSearchParams(window.location.search).get('locale');
    return requested === 'ru' ? 'ru' : 'en';
  });

  return (
    <div className="gallery" data-il-theme={theme}>
      <header className="gallery__header">
        <div>
          <p className="gallery__eyebrow">Inboxline · state gallery</p>
          <h1 className="gallery__title">Every state, fixed in time</h1>
          <p className="gallery__lead">
            Each tile is the real widget with an explicit fixture and the clock fixed at 20 October
            2026, 12:00 UTC. Cases driven by a mutation trigger it through the public actions, the
            same way a visitor would.
          </p>
        </div>
        <div className="gallery__controls">
          <div className="gallery__toggle" role="group" aria-label="Theme">
            <button type="button" aria-pressed={theme === 'dark'} onClick={() => setTheme('dark')}>
              Dark
            </button>
            <button
              type="button"
              aria-pressed={theme === 'light'}
              onClick={() => setTheme('light')}
            >
              Light
            </button>
          </div>
          <div className="gallery__toggle" role="group" aria-label="Locale">
            <button type="button" aria-pressed={locale === 'en'} onClick={() => setLocale('en')}>
              EN
            </button>
            <button type="button" aria-pressed={locale === 'ru'} onClick={() => setLocale('ru')}>
              RU
            </button>
          </div>
          <a className="gallery__back" href="./index.html">
            Playground →
          </a>
        </div>
      </header>

      <section className="gallery__grid" aria-label="Fixed inbox states">
        <CaseList theme={theme} locale={locale} />
      </section>
    </div>
  );
}

/**
 * One provider per tile cannot share a locale through React context, so each
 * case receives the current theme and locale as props.
 */
function CaseList({ theme, locale }: CaseProps) {
  return (
    <>
      <LoadedCases theme={theme} locale={locale} />
      <LoadingCase theme={theme} locale={locale} />
      <EmptyCase theme={theme} locale={locale} />
      <FirstPageErrorCase theme={theme} locale={locale} />
      <NextPageErrorCase theme={theme} locale={locale} />
      <PendingCase theme={theme} locale={locale} />
      <UnknownCase theme={theme} locale={locale} />
      <BulkRefusedCase theme={theme} locale={locale} />
      <UpdatesCase theme={theme} locale={locale} />
      <NoSubscriptionCase theme={theme} locale={locale} />
    </>
  );
}

const container = document.getElementById('root');
if (container === null) throw new Error('Inboxline gallery: #root is missing');

// No Strict Mode here on purpose: a state gallery drives one deliberate
// mutation per tile, and the double mount would consume a scripted failure with
// the first, abandoned controller. Strict Mode itself is covered by the tests.
createRoot(container).render(<Gallery />);
