# Inboxline

[![CI](https://github.com/nickkupriyanov/inboxline/actions/workflows/ci.yml/badge.svg)](https://github.com/nickkupriyanov/inboxline/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@nickkupriyanov/inboxline-react?label=npm)](https://www.npmjs.com/package/@nickkupriyanov/inboxline-react)
[![Live demo](https://img.shields.io/badge/demo-live-ff215a)](https://nickkupriyanov.github.io/inboxline/)
[![Storybook](https://img.shields.io/badge/storybook-open-ff4785)](https://nickkupriyanov.github.io/inboxline/storybook/)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

Notification centre for React apps whose backend already creates and stores
notifications: personal dashboards, CRM, booking apps, workspaces and internal
tools. Inboxline ships the UI and the behaviour — a shared unread counter,
cursor pagination, errors, optimistic read state, reconciliation and
accessibility — and connects to your API through a small adapter.

It belongs to the same family as
[Slotline](https://github.com/nickkupriyanov/slotline) and
[Soundline](https://github.com/nickkupriyanov/soundline): dark theme by default,
an explicit light theme, pink accent `#ff215a`, plain CSS variables and a
framework-free core behind a thin React binding.

> **Status:** the v1 surface is implemented and verified, and `0.1.0` is
> published on npm. The docs describe published contracts, and the last local
> checks are `typecheck`, unit tests, a production build, cross-browser
> Playwright checks and clean-tarball consumer installs. The plan and iteration
> history live in [`roadmap.md`](./roadmap.md).

## Install

```sh
pnpm add @nickkupriyanov/inboxline-react @nickkupriyanov/inboxline-core react react-dom
```

React 18.2+ and 19 are supported. The optional spring kit additionally needs the
`motion` peer:

```sh
pnpm add motion
```

## Quick start

The mock adapter makes the first render runnable without a backend. Replace it
with your own adapter (below) when the UI is connected.

```tsx
import { Inbox, InboxProvider, createMockAdapter } from '@nickkupriyanov/inboxline-react';
import '@nickkupriyanov/inboxline-react/styles.css';

const adapter = createMockAdapter({
  clock: { now: () => Date.now() },
  contexts: [
    {
      context: { key: 'user-1' },
      notifications: [
        {
          id: 'welcome',
          title: 'Welcome to Inboxline',
          body: 'Replace the mock with your API adapter.',
          createdAt: new Date().toISOString(),
          read: false,
        },
      ],
    },
  ],
});

export function App() {
  return (
    <InboxProvider adapter={adapter} context={{ key: 'user-1' }}>
      <Inbox />
      <Inbox layout="feed" />
    </InboxProvider>
  );
}
```

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

## Connect your backend

An adapter implements four methods and an optional invalidation hook:

| Method                                                  | Returns                         | Responsibility                                                               |
| ------------------------------------------------------- | ------------------------------- | ---------------------------------------------------------------------------- |
| `getNotifications({ context, filter, cursor, signal })` | `{ items, nextCursor }`         | One page in the server's order, an opaque cursor or `null`; honour `signal`. |
| `getUnreadCount({ context, signal })`                   | `{ unreadCount }`               | The whole context, including rows that were never loaded.                    |
| `setReadStatus({ context, id, read })`                  | `{ notification, unreadCount }` | Set the desired state, not a toggle; idempotent.                             |
| `markAllRead({ context })`                              | `{ boundary, unreadCount }`     | Mark the context read up to a server boundary; later events stay unread.     |
| `subscribe?({ context, onInvalidate })`                 | `() => void`                    | Optional transport event: raise “updates available” and refresh the counter. |

```ts
const adapter: InboxAdapter = {
  async getNotifications({ context, filter, cursor, signal }) {
    const query = new URLSearchParams({ workspace: context.key, filter });
    if (cursor !== null) query.set('cursor', cursor);
    const response = await fetch(`/api/notifications?${query}`, { signal });
    return response.json();
  },
  async getUnreadCount({ context, signal }) {
    const response = await fetch(`/api/unread-count?workspace=${context.key}`, { signal });
    return response.json();
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
```

`context.key` identifies the user/workspace and is the scope of the counter. Your
backend owns authentication, recipients, tenancy, ordering, cursors, mutations
and the global counter. The library never talks to HTTP, stores tokens or decides
who may read a workspace. A classified failure should throw `InboxError`; a
network failure during a mutation is treated as an unknown outcome and reconciled
instead of retried. The complete contract is in
[`docs/reference.md`](./docs/reference.md#notification-and-adapter).

## Two layouts

- `<Inbox />` — the bell popover (default). A native trigger with the shared
  unread badge and a non-modal dialog placed against it. Reopening verifies the
  first page and counter; closing leaves the provider running.
- `<Inbox layout="feed" />` — the standalone page-level list.

Both are the same surface over one controller. A provider can serve the bell, the
feed and a custom headless view at once; the badge, rows and read actions agree.
Two independent bells need two providers, while any number of feeds can share
one.

## Provider, headless UI and controlled values

`InboxProvider` creates one controller, starts it after mounting and stops it on
unmount. Its main props are `adapter`, `context`, `config`, `clock`,
`initialData`, `theme`, `className`, `classNames`, `components`, `animations`,
`filter`/`defaultFilter`/`onFilterChange`, `open`/`defaultOpen`/`onOpenChange`,
`onNotificationClick`, `markReadOnOpen` and `onError`. The full table is in
[`docs/reference.md`](./docs/reference.md#react-provider).

```tsx
import { useInboxFlow, useInboxUI } from '@nickkupriyanov/inboxline-react';

function Counter() {
  const { snapshot, actions } = useInboxFlow();
  const ui = useInboxUI();
  return (
    <button type="button" onClick={() => void actions.refresh()}>
      {snapshot.view.counter.label ?? ui.messages.countUnknownLabel}
    </button>
  );
}
```

The two hooks are the headless API: `useInboxFlow()` returns the controller
snapshot and actions; `useInboxUI()` returns the resolved theme, locale, copy,
parts, controlled state and setters. A custom UI never duplicates the counter
arithmetic, pagination or read queue.

## Themes, locales and replaceable parts

- **Theme.** `theme="dark"` is the default; `theme="light"` is explicit. The
  system preference never changes an explicit choice.
- **Tokens.** Everything is plain CSS with `--il-*` variables: colours, radii,
  sizes, motion. Override them on your own scope, or use `className` and
  `classNames`. Radii are 28/22/14/999 px, the panel is 400 px, the feed 800 px,
  and both work at 320 px. The tables are in
  [`docs/reference.md`](./docs/reference.md#css-tokens) and the measured palette
  in [`docs/visual-reference.md`](./docs/visual-reference.md).
- **Locales.** Built-in `en` and `ru`; other locales format dates with `Intl` and
  use English copy until `config.messages` is supplied. `config.locale` and
  `config.timeZone` are explicit; omitted fields are detected in the browser
  after mounting, with deterministic `en`/`UTC` during SSR.
- **Parts.** Replace `Trigger`, `Header`, `Filters`, `NotificationItem`,
  `Avatar`, `Loading`, `Empty`, `Error` or `PageError` through `components`.
  Spread the prepared slot props: they carry the handlers, refs, classes and
  `aria-*`. Every default part is exported so a replacement can wrap it.

## Server rendering

Both packages import without a DOM. For a populated first paint, build an
`InboxInitialData` (`page`, `unreadCount`, `now`), pass it as `initialData` to
`InboxProvider`, embed the same JSON in the response and hand it to
`hydrateRoot`. `start()` still confirms the seed with the adapter after
hydration. Without a seed the server renders the loading skeleton.

```tsx
const context = { key: 'user-1' };
const signal = new AbortController().signal;
const seed = {
  page: await adapter.getNotifications({ context, filter: 'all', cursor: null, signal }),
  unreadCount: (await adapter.getUnreadCount({ context, signal })).unreadCount,
  now: Date.now(),
};
```

See [`docs/specification.md`](./docs/specification.md#server-rendering-and-hydration)
and run `pnpm ssr` for the complete example.

## Accessibility and browser support

Native buttons, visible focus, a labelled non-modal dialog, no focus trap, a
polite live region for the counter and action results, and state that does not
rely on colour alone. Keyboard flows, axe checks and measured contrast are
documented in [`docs/specification.md`](./docs/specification.md#6-accessibility).

Chromium, Firefox and WebKit are exercised by Playwright in
`tools/browser-checks` (`pnpm test:browser`). WebKit there is the Playwright
build, not the Safari application. React 18 and 19 are installed from packed
tarballs in `pnpm verify:install`.

## Examples in this repository

| Example       | What it shows                                                                                             | Start                                      |
| ------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| Playground    | Bell, feed, headless counter, workspace switch, locales/sizes, parts, themes, motion and HTTP comparison. | `pnpm dev` — <http://localhost:5173>       |
| State gallery | 16 fixed loading/empty/error/pending/unknown/update states with deterministic data and time.              | `pnpm gallery` or `/gallery.html`          |
| Storybook     | 31 stories: layouts, states, customization and headless.                                                  | `pnpm storybook` — <http://localhost:6006> |
| HTTP example  | A teaching server with a deliberately different payload, an HTTP adapter and lost-answer scenarios.       | `pnpm demo:http`                           |
| SSR example   | Server render, serialisable seed and hydration.                                                           | `pnpm ssr` — <http://localhost:4175>       |
| Style stand   | Static palette and geometry review without React.                                                         | `pnpm stand`                               |

## Documentation

| Document                                                 | Contents                                                                                     |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| [`docs/reference.md`](./docs/reference.md)               | Adapter, controller, provider, hooks, parts, classes, tokens and message keys.               |
| [`docs/specification.md`](./docs/specification.md)       | The full implemented contract and the decisions behind it.                                   |
| [`docs/visual-reference.md`](./docs/visual-reference.md) | Token sources, geometry, states and measured contrast.                                       |
| [`docs/migration.md`](./docs/migration.md)               | Versioning, changesets, migration notes and the explicit publish procedure.                  |
| [`roadmap.md`](./roadmap.md)                             | Iterations, status and known limits.                                                         |
| Package READMEs                                          | [`core`](./packages/core/README.md) and [`react`](./packages/react/README.md) (also on npm). |

## Requirements

- Node `^22.12.0 || ^24.0.0 || >=26.0.0`
- pnpm 9.8 (`packageManager` is pinned; Corepack honours it)
- React 18.2 or 19 for the React binding

## Commands

Run everything from the repository root:

```sh
pnpm install            # install workspace dependencies
pnpm typecheck          # tsc --noEmit in every package
pnpm test               # Vitest in every package
pnpm build              # build both packages with tsup
pnpm check:docs         # docs links, exports and the compile-checked examples
pnpm check:release      # package, changeset and workflow readiness
pnpm format             # prettier --write
pnpm format:check       # prettier --check
pnpm changeset          # describe a change for the next release
```

Examples and deeper checks:

```sh
pnpm dev                # playground on http://localhost:5173
pnpm gallery            # fixed state gallery
pnpm storybook          # Storybook on http://localhost:6006
pnpm build-storybook    # static Storybook
pnpm ssr                # SSR/hydration example on http://localhost:4175
pnpm stand              # static style stand on http://localhost:4174
pnpm preview            # built playground
pnpm dev-server         # teaching HTTP server
pnpm demo:http          # teaching server + playground
pnpm test:server        # HTTP contract and controller-over-HTTP tests
pnpm install:browsers   # Playwright Chromium, Firefox and WebKit inside the workspace
pnpm test:browser       # cross-browser layout, states, SSR and reduced-motion checks
pnpm verify:install     # pack both packages and install three clean consumer apps
pnpm verify:install:leg react-19
```

Publishing is separate and never triggered by a commit or by CI here. The rules
are in [`docs/migration.md`](./docs/migration.md).

## Project layout

```text
inboxline/
  packages/
    core/      @nickkupriyanov/inboxline-core
    react/     @nickkupriyanov/inboxline-react, .storybook and src/stories
  docs/        specification, API/visual reference, migration, release runbook
  apps/
    playground/    layouts, states, gallery and HTTP comparison (not published)
    style-stand/   static visual review (not published)
    ssr-example/   server render, seed and hydration (not published)
  .github/workflows/  CI, Pages, opt-in npm release and manual release candidate
  tools/
    dev-server/      teaching HTTP server, adapter and tests (private)
    browser-checks/  Playwright regressions (private)
    docs-check/      link, export and example checks for this documentation (private)
    install-check/   React 18/19 and motion consumer templates (private)
    verify-install.mjs
```

The published packages contain `dist`, `README.md` and `LICENSE` only.

## License

MIT
