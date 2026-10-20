# @nickkupriyanov/inboxline-react

The React binding of **Inboxline**: a themable, accessible bell popover and a
standalone notification feed on top of the framework-free core.

```sh
pnpm add @nickkupriyanov/inboxline-react @nickkupriyanov/inboxline-core react react-dom
```

```tsx
import {
  Inbox,
  InboxProvider,
  type InboxAdapter,
  type InboxNotification,
} from '@nickkupriyanov/inboxline-react';
import '@nickkupriyanov/inboxline-react/styles.css';

const adapter: InboxAdapter = {
  async getNotifications({ context, filter, cursor, signal }) {
    const query = new URLSearchParams({ workspace: context.key, filter });
    if (cursor !== null) query.set('cursor', cursor);
    const response = await fetch(`/api/notifications?${query}`, { signal });
    return response.json() as Promise<{ items: InboxNotification[]; nextCursor: string | null }>;
  },
  async getUnreadCount({ context, signal }) {
    const response = await fetch(`/api/unread-count?workspace=${context.key}`, { signal });
    return response.json() as Promise<{ unreadCount: number }>;
  },
  async setReadStatus({ context, id, read }) {
    const response = await fetch(`/api/notifications/${id}?workspace=${context.key}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ read }),
    });
    return response.json();
  },
  async markAllRead({ context }) {
    const response = await fetch(`/api/notifications/read-all?workspace=${context.key}`, {
      method: 'POST',
    });
    return response.json();
  },
};

export function Notifications() {
  return (
    <InboxProvider adapter={adapter} context={{ key: 'user-1' }}>
      <Inbox />
      <Inbox layout="feed" />
    </InboxProvider>
  );
}
```

The adapter is the only backend integration: it returns notifications, the global
unread counter and the two mutations. Authentication, recipients, tenancy,
ordering, cursors and persistence belong to your backend. The
[API reference](https://github.com/nickkupriyanov/inboxline/blob/main/docs/reference.md)
has the complete adapter contract.

## Two layouts

- `<Inbox />` — `layout="popover"` by default: a bell with the shared unread badge
  and a non-modal dialog placed against the trigger. Reopening verifies the first
  page and the counter; closing never stops the provider.
- `<Inbox layout="feed" />` — the standalone page-level card. Both compositions
  are the same surface over one controller, so the badge, rows and read actions
  agree.

Only one `open` value exists per provider; two independent bells need two
providers. Any number of feeds can share a provider.

## Provider, hooks and controlled values

`InboxProvider` owns one controller, starts it after mounting and stops it on
unmount. Its props are listed in full in the
[reference](https://github.com/nickkupriyanov/inboxline/blob/main/docs/reference.md#react-provider):
`adapter`, `context`, `config`, `clock`, `initialData`, `theme`, `className`,
`classNames`, `components`, `animations`, the controlled pairs
`filter`/`defaultFilter`/`onFilterChange` and `open`/`defaultOpen`/`onOpenChange`,
`onNotificationClick` and `markReadOnOpen` (default `true`).

```tsx
import { useInboxFlow, useInboxUI } from '@nickkupriyanov/inboxline-react';

function Counter() {
  const { snapshot, actions } = useInboxFlow();
  const ui = useInboxUI();

  return (
    <button type="button" onClick={() => void actions.refresh()}>
      {ui.messages.listLabel}: {snapshot.view.counter.label ?? ui.messages.countUnknownLabel}
    </button>
  );
}
```

The two hooks are the whole headless surface. A custom UI reads the same snapshot
and calls the same actions as the ready-made layouts; it never duplicates the
counter arithmetic, pagination or read queue.

## Theming, locales and parts

- Dark theme by default, explicit light theme via `theme="light"`. The system
  preference never changes an explicit choice.
- All styling is plain CSS with `--il-*` tokens. Override tokens on your own
  scope, or use `className`/`classNames` for added hooks.
- Built-in copy is `en` and `ru`; pass `config.messages` for other languages and
  `config.locale`/`timeZone` for formatting. Omitted values are detected after
  mounting, with `en`/`UTC` as the deterministic server fallback.
- Replace any of the nine parts (`Trigger`, `Header`, `Filters`,
  `NotificationItem`, `Avatar`, `Loading`, `Empty`, `Error`, `PageError`) through
  `components`. Spread the prepared slot props to keep the handlers, refs and
  `aria-*` contract. Every default part is exported, so you can wrap it.

## Server rendering

```tsx
import { renderToString } from 'react-dom/server';

const seed = {
  page: await getFirstPage(),
  unreadCount: (await getUnreadCount()).unreadCount,
  now: Date.now(),
};

const html = renderToString(
  <InboxProvider adapter={adapter} initialData={seed}>
    <Inbox layout="feed" />
  </InboxProvider>,
);
// Embed the same JSON and pass it as initialData to hydrateRoot.
```

The first server and client render are identical; `start()` confirms the seed
after hydration. Without a seed the server renders the loading skeleton. See
[`docs/specification.md`](https://github.com/nickkupriyanov/inboxline/blob/main/docs/specification.md#server-rendering-and-hydration).

## Optional spring animations

```tsx
import { Inbox, InboxProvider } from '@nickkupriyanov/inboxline-react/motion';
```

The `/motion` entry requires the optional `motion` peer. The default entry never
imports it and works without it; the DOM, classes and accessibility contract are
the same in both kits.

## Accessibility

Native buttons, visible focus, a labelled non-modal dialog, a polite live region
for the counter and action results, and state that does not rely on colour alone.
The keyboard flow, axe checks and measured contrast are recorded in
[`docs/specification.md`](https://github.com/nickkupriyanov/inboxline/blob/main/docs/specification.md#accessibility).

## Support and limits

- React 18.2+ and 19; both are verified from packed tarballs.
- Chromium, Firefox and WebKit are checked with Playwright. WebKit there is the
  Playwright build, not the Safari application.
- The panel is non-modal and does not trap focus. The design targets 320 px and
  wider.
- The library is not a notification server and owns no transport, persistence or
  authentication. External updates are an optional adapter `subscribe`; without
  it, refresh yourself.
- Before `1.0.0`, incompatible changes are `minor` with a migration note. See
  [`docs/migration.md`](https://github.com/nickkupriyanov/inboxline/blob/main/docs/migration.md).
