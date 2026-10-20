# @nickkupriyanov/inboxline-core

Framework-free core of **Inboxline**: the notification and adapter contracts, the
pure reducer, the derived view model, the controller, errors, copy and a
deterministic mock adapter.

```sh
pnpm add @nickkupriyanov/inboxline-core
```

```ts
import {
  createInboxController,
  type InboxAdapter,
  type InboxNotification,
} from '@nickkupriyanov/inboxline-core';

const adapter: InboxAdapter = {
  async getNotifications({ context, filter, cursor, signal }) {
    const response = await fetch(
      `/api/notifications?workspace=${context.key}&filter=${filter}${
        cursor === null ? '' : `&cursor=${encodeURIComponent(cursor)}`
      }`,
      { signal },
    );
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

const inbox = createInboxController({ adapter, context: { key: 'user-1' } });
inbox.start();
const unsubscribe = inbox.subscribe(() => render(inbox.getSnapshot()));
```

The adapter is the only integration point. A real backend decides who may read a
workspace, which notifications exist, their order and cursors, the mutations and
the global unread counter. The core never talks to HTTP itself.

## Controller

`createInboxController(options)` performs no request, subscription or timer at
creation. `start()` performs the first page + counter load and opens the optional
`adapter.subscribe`; `stop()` is idempotent. `getSnapshot()` returns a stable
`{ revision, state, view }` until the model or the displayed minute changes.

Actions: `setFilter`, `refresh`, `retry`, `loadMore`, `setRead`, `markAllRead`,
`showUpdates`, `reconcile`, `setContext`, `setAdapter`. The full signatures,
snapshot shape and adapter rules are in
[`docs/reference.md`](https://github.com/nickkupriyanov/inboxline/blob/main/docs/reference.md).

## Entry points

| Entry                                       | Purpose                                                                                         |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `@nickkupriyanov/inboxline-core`            | Contracts, reducer, derived view, config/copy, mock adapter, controller, `cx()` and `IL_CLASS`. |
| `@nickkupriyanov/inboxline-core/dom`        | Browser helpers for focus, sizing and media queries; nothing touches the DOM at import time.    |
| `@nickkupriyanov/inboxline-core/styles.css` | The authored stylesheet (tokens + components + motion).                                         |

## Server rendering

`initialData` accepts `{ page, unreadCount, now }` from a server render. It becomes
confirmed state at creation and `start()` still confirms it with the adapter. The
seed contains no pending mutations, callbacks or credentials. See
[`docs/specification.md`](https://github.com/nickkupriyanov/inboxline/blob/main/docs/specification.md#server-rendering-and-hydration).

## Mock adapter

`createMockAdapter({ clock, pageSize, contexts })` implements the same contract
with an explicit in-memory store, deterministic order and scenario controls
(`failNext`, `setLatency`, `addNotification`, `invalidate`). It is intended for
tests, stories and examples, not for production.

## Support

- TypeScript strict, ESM and CJS, declarations included.
- No runtime dependencies and no React/DOM import-time access.
- Node 22.12+, 24 or 26 for the development toolchain.
- React binding: `@nickkupriyanov/inboxline-react`.

The repository README covers installation and the two ready-made layouts; the
[API reference](https://github.com/nickkupriyanov/inboxline/blob/main/docs/reference.md)
has the complete tables.
