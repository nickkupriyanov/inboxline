/**
 * Compile-checked versions of the snippets the documentation shows.
 *
 * This file is never executed. `pnpm check:docs` typechecks it against the
 * package sources, so a renamed prop, a removed export or a changed generic
 * fails the docs check instead of leaving a stale README.
 */
import { useEffect, type ReactNode } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import {
  IL_CLASS,
  InboxError,
  createInboxController,
  createMockAdapter,
  cx,
  type InboxAdapter,
  type InboxContext,
  type InboxInitialData,
  type InboxNotification,
  type InboxSnapshot,
} from '@nickkupriyanov/inboxline-core';
import { observeMediaQuery } from '@nickkupriyanov/inboxline-core/dom';
import {
  DEFAULT_INBOX_COMPONENTS,
  DefaultNotificationItem,
  Inbox,
  InboxProvider,
  cssAnimations,
  useInboxFlow,
  useInboxUI,
  type NotificationItemPartProps,
} from '@nickkupriyanov/inboxline-react';
import { motionAnimations } from '@nickkupriyanov/inboxline-react/motion';

interface ProjectData {
  project: string;
}

const context: InboxContext = { key: 'user-1' };

/** The four-method backend adapter from the README. */
export const backendAdapter: InboxAdapter<ProjectData> = {
  async getNotifications({ context: queryContext, filter, cursor, signal }) {
    const query = new URLSearchParams({ workspace: queryContext.key, filter });
    if (cursor !== null) query.set('cursor', cursor);
    const response = await fetch(`/api/notifications?${query}`, { signal });
    return response.json() as Promise<{
      items: InboxNotification<ProjectData>[];
      nextCursor: string | null;
    }>;
  },
  async getUnreadCount({ context: queryContext, signal }) {
    const response = await fetch(`/api/unread-count?workspace=${queryContext.key}`, { signal });
    return response.json() as Promise<{ unreadCount: number }>;
  },
  async setReadStatus({ context: queryContext, id, read }) {
    const response = await fetch(`/api/notifications/${id}?workspace=${queryContext.key}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ read }),
    });
    return response.json() as Promise<{
      notification: InboxNotification<ProjectData>;
      unreadCount: number;
    }>;
  },
  async markAllRead({ context: queryContext }) {
    const response = await fetch(`/api/notifications/read-all?workspace=${queryContext.key}`, {
      method: 'POST',
    });
    return response.json() as Promise<{ boundary: string; unreadCount: number }>;
  },
};

/** Controller creation, subscription and the action vocabulary. */
export function createController() {
  const controller = createInboxController<ProjectData>({
    adapter: backendAdapter,
    context,
    filter: 'all',
    config: { locale: 'en', timeZone: 'UTC' },
    clock: { now: () => Date.now() },
  });
  controller.start();
  const unsubscribe = controller.subscribe(() => {
    const snapshot: InboxSnapshot<ProjectData> = controller.getSnapshot();
    void snapshot.view.counter.label;
  });
  void controller.actions.refresh();
  void controller.actions.loadMore();
  void controller.actions.setRead('id', true);
  void controller.actions.markAllRead();
  void controller.actions.retry();
  void controller.actions.reconcile();
  void controller.actions.showUpdates();
  controller.actions.setFilter('unread');
  controller.actions.setContext({ key: 'user-2' });
  controller.actions.setAdapter(backendAdapter);
  controller.refreshTime();
  controller.updateConfig({ locale: 'ru' });
  controller.stop();
  unsubscribe();
  return controller;
}

/** The mock adapter and an error from a classified refusal. */
export function mockAndErrors() {
  const adapter = createMockAdapter<ProjectData>({
    clock: { now: () => Date.parse('2026-10-21T12:00:00Z') },
    pageSize: 10,
    contexts: [{ context, notifications: [] }],
  });
  adapter.failNext('setReadStatus', { outcome: 'rejected' });
  adapter.addNotification(context, {
    id: 'n1',
    title: 'Hello',
    createdAt: '2026-10-21T11:00:00Z',
    read: false,
  });
  adapter.invalidate(context);
  const error = new InboxError({ code: 'CONFLICT', message: 'Refused' });
  return { adapter, error, className: cx(IL_CLASS.root, 'my-root'), slots: IL_CLASS };
}

/** The provider with the props a real application uses. */
export function ProviderExample(): ReactNode {
  return (
    <InboxProvider<ProjectData>
      adapter={backendAdapter}
      context={context}
      config={{ locale: 'en', timeZone: 'Europe/Berlin', messages: { listLabel: 'Activity' } }}
      theme="light"
      className="app-inbox"
      classNames={{ item: 'app-inbox__row' }}
      components={{ NotificationItem: CustomRow }}
      animations={motionAnimations}
      markReadOnOpen
      onNotificationClick={(notification) => {
        void notification.data?.project;
      }}
      onError={(error) => {
        void error.code;
      }}
      defaultFilter="unread"
      defaultOpen={false}
      onFilterChange={(filter) => void filter}
      onOpenChange={(open) => void open}
    >
      <Inbox />
      <Inbox layout="feed" />
      <HeadlessCounter />
    </InboxProvider>
  );
}

/** A typed custom row that keeps the prepared slot props. */
export function CustomRow({
  item,
  slotProps,
  activateProps,
  readProps,
  avatar,
  status,
}: NotificationItemPartProps<ProjectData>) {
  return (
    <li {...slotProps}>
      {avatar}
      <button {...activateProps}>{item.title}</button>
      <span>{item.data?.project}</span>
      <button {...readProps}>{item.read ? 'Unread' : 'Read'}</button>
      {status}
    </li>
  );
}

/** Headless flow and the resolved presentation values. */
export function HeadlessCounter() {
  const { snapshot, actions } = useInboxFlow<ProjectData>();
  const ui = useInboxUI<ProjectData>();
  useEffect(() => observeMediaQuery('(prefers-reduced-motion: reduce)', () => undefined), []);
  return (
    <button type="button" onClick={() => void actions.refresh()}>
      {snapshot.view.counter.label ?? ui.messages.countUnknownLabel}
    </button>
  );
}

/** The server seed and the two client entry calls. */
export function seed(): InboxInitialData<ProjectData> {
  return {
    page: { items: [], nextCursor: null },
    unreadCount: 0,
    now: Date.parse('2026-10-21T12:00:00Z'),
  };
}

export function ssrAndHydration(element: ReactNode, container: HTMLElement) {
  const html = renderToString(element);
  hydrateRoot(container, element);
  createRoot(container).render(element);
  return html;
}

/** The optional CSS kit and the complete parts map are part of the surface. */
export const kits = {
  cssAnimations,
  motionAnimations,
  defaults: DEFAULT_INBOX_COMPONENTS,
  row: DefaultNotificationItem,
};
