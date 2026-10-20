# Inboxline

Notification centre for React apps whose backend already creates and stores
notifications: personal dashboards, CRM, booking apps, workspaces and internal
tools. Inboxline ships the UI and the behaviour — a shared unread counter,
cursor pagination, errors, optimistic read state, reconciliation and
accessibility — and connects to your API through a small adapter.

Inboxline belongs to the same family as
[Slotline](https://github.com/nickkupriyanov/slotline) and
[Soundline](https://github.com/nickkupriyanov/soundline): dark theme by default,
an explicit light theme, pink accent `#ff215a`, CSS variables instead of a
styling framework, and a framework-free core behind a thin binding.

> **Status: Iteration 17 — soft animations.** The framework-free
> core is implemented: the adapter contract, reducer, derived view, deterministic
> mock adapter, controller, `cx()` class helper and DOM helpers, including media
> queries and animated-height observation. The stylesheet ships as
> `@nickkupriyanov/inboxline-core/styles.css` with a copy on the React entry and is
> documented in [`docs/visual-reference.md`](./docs/visual-reference.md).
> `@nickkupriyanov/inboxline-react` publishes `InboxProvider`, the ready-made
> `<Inbox />` bell popover by default, `<Inbox layout="feed" />` for the standalone
> feed, `useInboxFlow()` and `useInboxUI()`. The provider also accepts
> `components`, `classNames`, `className` and `animations`; the default parts
> (`DefaultTrigger`, `DefaultHeader`, `DefaultFilters`, `DefaultNotificationItem`,
> `DefaultAvatar` and the state blocks), `DEFAULT_INBOX_COMPONENTS` and the
> zero-dependency `cssAnimations` kit are exported. The optional
> `@nickkupriyanov/inboxline-react/motion` entry swaps in spring animations and
> keeps `motion` an optional peer. The plan lives in
> [`roadmap.md`](./roadmap.md); the implemented contract is recorded in
> [`docs/specification.md`](./docs/specification.md).

## Packages

| Package                                  | Purpose                                                                              |
| ---------------------------------------- | ------------------------------------------------------------------------------------ |
| `@nickkupriyanov/inboxline-core`         | State, adapter contract, reducer, derived view model, errors, copy, time.            |
| `@nickkupriyanov/inboxline-react`        | React provider, hooks, bell/feed layouts, replaceable parts, theming and CSS motion. |
| `@nickkupriyanov/inboxline-react/motion` | The same widget with spring animations; requires the optional `motion` peer.         |

The core has no React, no DOM access at import time and no third-party runtime
dependencies.

## Scope of the first version

Included: the bell popover (`layout="popover"`) and the standalone feed
(`layout="feed"`), the “All” and “Unread” filters, day grouping, an explicit
“Show more” button, the server-side unread counter (including notifications that
are not loaded), per-notification read/unread, server-side “Mark all as read”,
optimistic actions with confirmed rejection and unknown-outcome reconciliation,
`TData` for application data, `onNotificationClick` navigation, manual refresh
and optional invalidation from your own transport, a shared provider, headless
API, replaceable parts, theming, `en`/`ru` copy and accessible behaviour.

Out of scope: sending email/SMS/push, service workers, a notification server of
its own, workflow builders, channel settings, search, archive, deletion,
arbitrary bulk selections, attachments, rich text, inline actions inside a
notification, offline persistence and cross-tab sync.

Your application stays responsible for creating notifications, recipients and
permissions, ordering and cursors, mutations, the global counter, authorisation,
routing and any external event source.

## Requirements

- Node `^22.12.0 || ^24.0.0 || >=26.0.0`
- pnpm 9.8 (`packageManager` is pinned; Corepack honours it)
- React 18.2 or 19 for the React binding

## Server rendering

Both packages import without a DOM. For a populated first paint, build an
`InboxInitialData` from the first page, the unread counter and a timestamp, pass
it as `initialData` to `InboxProvider`, embed the same JSON in the response and
give it to `hydrateRoot`. Without a seed the server renders the loading skeleton.
Locale and time zone use the deterministic `en`/`UTC` fallback during render; the
binding detects the visitor's preferences after mounting unless the application
passed them explicitly. The complete contract is in
[`docs/specification.md`](./docs/specification.md#server-rendering-and-hydration),
and `pnpm ssr` runs the example.

## Commands

Run everything from the repository root:

```sh
pnpm install       # install workspace dependencies
pnpm typecheck     # tsc --noEmit in every package
pnpm test          # vitest run in every package
pnpm build         # build both packages with tsup
pnpm build:playground  # build the Vite example with both ready-made layouts
pnpm dev           # run the playground on http://localhost:5173
pnpm gallery       # open the fixed state gallery at /gallery.html
pnpm dev-server    # run the teaching HTTP server on http://127.0.0.1:8787
pnpm demo:http     # the teaching server and the playground together
pnpm test:server   # HTTP contract and controller-over-HTTP tests
pnpm install:browsers  # Playwright Chromium, Firefox and WebKit inside the workspace
pnpm test:browser  # cross-browser layout, states, SSR and reduced-motion checks
pnpm storybook     # run Storybook on http://localhost:6006
pnpm build-storybook  # build the static Storybook
pnpm ssr           # run the SSR/hydration example on http://localhost:4175
pnpm preview       # serve a built playground (also /gallery.html)
pnpm format        # prettier --write
pnpm format:check  # prettier --check
pnpm changeset     # describe a change for the next release
pnpm stand         # serve the static style stand on http://localhost:4174
```

Versions are released with Changesets. `changeset version` (or
`pnpm version-packages`) bumps the manifests; publishing is a separate, explicit
step and is never triggered by a local commit.

## Layout

```text
inboxline/
  packages/
    core/      @nickkupriyanov/inboxline-core
    react/     @nickkupriyanov/inboxline-react, its .storybook and src/stories
  docs/
    specification.md
    visual-reference.md
  apps/
    playground/    bell, feed, headless, customization and HTTP sections, plus
                   the fixed state gallery at gallery.html (not published)
    style-stand/   static page for visual review (not published)
    ssr-example/   server render, serialisable seed and hydration (not published)
  tools/
    dev-server/      teaching HTTP server, payload-translating adapter and tests
                     (private, not published)
    browser-checks/  Playwright Chromium/Firefox/WebKit regressions (private)
```

CI arrives in the iteration listed in the roadmap. Storybook, the stories and
`tools/dev-server` are development tooling: the published packages contain
`dist` only.

## License

MIT
