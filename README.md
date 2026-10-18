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

> **Status: project scaffold.** The repository is a working monorepo with
> reproducible commands, but the library itself is not implemented yet. Both
> entry points are intentionally empty placeholders, and no domain API, styles
> or components are declared as available. The plan lives in
> [`roadmap.md`](./roadmap.md); the decisions already made are recorded in
> [`docs/specification.md`](./docs/specification.md).

## Packages

| Package                           | Purpose                                                                   |
| --------------------------------- | ------------------------------------------------------------------------- |
| `@nickkupriyanov/inboxline-core`  | State, adapter contract, reducer, derived view model, errors, copy, time. |
| `@nickkupriyanov/inboxline-react` | React provider, hooks, bell popover and feed layouts.                     |

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

## Commands

Run everything from the repository root:

```sh
pnpm install       # install workspace dependencies
pnpm typecheck     # tsc --noEmit in every package
pnpm test          # vitest run in every package
pnpm build         # build both packages with tsup
pnpm format        # prettier --write
pnpm format:check  # prettier --check
pnpm changeset     # describe a change for the next release
```

Versions are released with Changesets. `changeset version` (or
`pnpm version-packages`) bumps the manifests; publishing is a separate, explicit
step and is never triggered by a local commit.

## Layout

```text
inboxline/
  packages/
    core/      @nickkupriyanov/inboxline-core
    react/     @nickkupriyanov/inboxline-react
  docs/
    specification.md
```

`apps/playground`, `tools/`, Storybook and CI arrive in the iterations listed in
the roadmap.

## License

MIT
