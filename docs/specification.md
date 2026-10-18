# Inboxline — specification

This document records the architecture decisions that are fixed before the
first domain code exists, plus the contract that each iteration has actually
implemented. The roadmap ([`../roadmap.md`](../roadmap.md)) owns the sequence of
work; this file owns the descriptions.

> **Current status: Iteration 0 — project scaffold.** Only the workspace, the
> two empty package entry points and the toolchain exist. No notification type,
> adapter method, controller action or component is implemented, and nothing in
> this file should be read as an available API. Sections that describe planned
> contracts are marked **Planned**; the iteration in which they become real is
> named next to them.

## 1. Packages and entry points

| Entry point                                  | State             | Content                                                                   |
| -------------------------------------------- | ----------------- | ------------------------------------------------------------------------- |
| `@nickkupriyanov/inboxline-core`             | Empty placeholder | Contracts, reducer, derived view model, controller, errors, copy, time.   |
| `@nickkupriyanov/inboxline-core/dom`         | Not built yet     | Browser helpers (focus, size observation, available area) — Iteration 10. |
| `@nickkupriyanov/inboxline-core/styles.css`  | Not built yet     | Authored stylesheet — Iteration 11.                                       |
| `@nickkupriyanov/inboxline-react`            | Empty placeholder | Provider, hooks and layouts — Iteration 12 onwards.                       |
| `@nickkupriyanov/inboxline-react/styles.css` | Not built yet     | Copy of the core stylesheet — Iteration 11.                               |
| `@nickkupriyanov/inboxline-react/motion`     | Not built yet     | Optional Motion entry point — Iteration 17.                               |

Rules that hold for every entry point:

- The core is React-free and DOM-free. Browser objects are touched only inside
  called functions, never while a module is being imported.
- `inboxline-core` is safe to import in Node and during server rendering.
- No entry point has a third-party runtime dependency. Motion is an optional
  peer of the React binding and lives behind its own subpath.

Prefixes are reserved project-wide: `il-*` for classes, `--il-*` for CSS custom
properties, `data-il-*` for DOM state attributes, and `IlClassSlot` for the
public slot type.

## 2. Controller and snapshot

**Planned (Iteration 5).** `createInboxController()` owns the data flow:

- It performs no requests, subscriptions or timers when it is created.
- `getSnapshot()` returns `{ revision, state, view }` and keeps returning the
  same object until the model actually changes.
- `subscribe(listener)` returns an unsubscribe function.
- `start()` and `stop()` are idempotent and own every side effect: the initial
  page and counter load, refresh, and the optional adapter invalidation
  subscription.
- Configuration, context and adapter can be replaced at runtime.
- Mutations are exposed through `actions`.
- User callbacks are invoked after the state is updated, and an exception thrown
  by a callback never turns a successful request into a server error and never
  triggers a second mutation.

The reducer and the derivation step are pure functions: time and side effects
are injected, never read from `Date.now()` or the network inside them.

## 3. Data model and adapter

**Planned (Iteration 1 fixes the types).** A notification carries a stable
string ID, a creation time with an explicit time zone, a title, optional body,
author and icon, the server-side read state and application data in `TData`.

The adapter solves exactly four problems:

| Method             | Purpose                                                              |
| ------------------ | -------------------------------------------------------------------- |
| `getNotifications` | A cursor page for the current context and filter.                    |
| `getUnreadCount`   | The global unread counter for the current context.                   |
| `setReadStatus`    | Set a notification to a desired read state (not a “toggle” command). |
| `markAllRead`      | Mark every notification of the context as read on the server.        |

- Every request receives the context; loads accept an `AbortSignal`.
- `context.key` identifies the user/workspace and therefore the scope of the
  counter. Changing the list filter never changes the meaning of the global
  counter.
- Pagination is cursor-based and the cursor is opaque. The server returns a
  stable new-to-old order with a deterministic order for equal timestamps; the
  core keeps the server order and removes duplicate IDs instead of sorting pages
  itself.
- A mutation result carries the confirmed state and the current server counter.
- The list and the counter load independently; the library does not promise
  transactional consistency across separate HTTP requests.
- Local revisions and request generations protect against stale responses.

### The unread counter

- The counter is server data. The length of a loaded page, or the number of
  unread rows the client happens to hold, never replaces it.
- Until the counter arrives the state is “unknown”, never a confirmed zero.
- `markAllRead` is atomic for the context on the server. Its boundary is the
  notifications that existed when the server applied the operation; events
  created after that boundary stay unread, so success does not mean a permanent
  zero.

### Optimistic actions and unknown outcomes

**Planned (Iterations 2 and 7).**

- Optimistic changes are a separate layer above confirmed data. A failure of one
  operation rolls back only that operation's layer; new notifications and other
  successful changes survive.
- Mutations are serialised inside one controller. The bulk operation runs
  separately from the queue of individual changes, and its button is disabled
  while that queue is busy.
- A confirmed rejection is distinguished from an unknown outcome. A lost
  response does not prove that the server changed nothing, so an unknown outcome
  requires reconciliation with the server and never triggers an automatic retry
  of the bulk operation.
- “Mark all as read” runs on the server for the whole context and therefore
  covers notifications that were never loaded. Its exact boundary is documented
  in the adapter contract (Iteration 1).

### External updates

**Planned (Iteration 9).** An optional `subscribe` on the adapter reports that
data was invalidated and returns an unsubscribe function. WebSocket, SSE and SDK
clients stay in the application. In v1 an event carries no mandatory delta and
requires no shared server revision.

On invalidation the counter is refreshed and an “updates available” flag is
raised. The open list is kept until the user refreshes it explicitly, because
new events must not shift a list that is being read; reopening the bell
reconciles the first page as well. Frequent invalidations are coalesced, and an
invalidation that arrives during a request is not lost.

## 4. React binding

**Planned (Iteration 12).**

- The React package subscribes to the core with `useSyncExternalStore` and
  duplicates no domain logic.
- One provider serves the bell and the feed together; independent providers and
  different `context.key` values stay isolated.
- Opening the panel, portalling, positioning and focus belong to the UI layer.
- Controlled values follow `value`/`defaultValue`/`on*Change`: `open`/`defaultOpen`/
  `onOpenChange` and `filter`/`defaultFilter`/`onFilterChange`. The mode is fixed
  when the instance is created, and an external update does not echo a change
  event back.
- The notification list and the shared counter are server data; no second,
  parallel controlled model of that data is added without a separate decision.
- Replaceable parts keep the prepared handlers, classes and `aria-*` attributes.
  Backend HTML strings are never injected with `dangerouslySetInnerHTML`.
- The activation callback is called `onNotificationClick`, so it cannot be
  confused with opening the panel. `onOpen` from earlier sketches is not a
  published contract.

## 5. Visual language

**Planned (Iteration 11).** The look follows Slotline and Soundline:

- Dark theme by default, an explicit light theme, and no automatic switch of an
  explicitly chosen theme by the system preference.
- Neutral dark surfaces (`#141419` base), thin borders, soft shadows, the pink
  accent `#ff215a`, the system font stack and a 14 px base size.
- Radii: card 28 px, inner panels 22 px, controls 14 px, pills 999 px. All
  values are reachable as CSS custom properties.
- Panel width 400 px, feed width 800 px; both are capped by their container and
  work at 320 px without horizontal scrolling.
- Soft hover/press/focus states with 140/240/420 ms durations and the reference
  easing curves. `prefers-reduced-motion` is respected.
- Plain CSS with `--il-*` variables only: no Tailwind, no CSS-in-JS, and no
  global resets applied to the consuming application.
- Changing the base palette, geometry or typography beyond token configuration
  requires the user's agreement.

## 6. Accessibility

Accessibility ships with each UI iteration and is audited again in Iteration 18.

- Native buttons and links with accessible names and visible focus states.
- The feed is a list, the filters are buttons with a selected state, and
  notifications are not dressed up as an ARIA menu.
- The bell panel is a non-modal dialog with a clear title; Tab order stays
  native and there is no focus trap.
- Escape, correct open/close behaviour and focus return without stealing focus
  from an element the user clicked outside the panel.
- After a row disappears from the unread filter, focus moves to a predictable
  place.
- Counter changes and action results are announced through a live region without
  re-reading the whole feed.
- Colour is never the only signal of unread state or of an error.
- Contrast is verified by a checkable calculation and/or a browser measurement;
  jsdom and screenshots do not prove contrast.

## 7. Toolchain decisions

- pnpm workspace, TypeScript `strict`, tsup for both packages, Vitest for tests.
- `target` is ES2021, source maps, declaration files and both ESM and CJS
  flavours are emitted; `main`/`module`/`types` and `exports` point at `dist`.
- Prettier: semicolons, single quotes, trailing commas, 2 spaces, 100 columns.
- Changesets is configured without automatic commits (`"commit": false`) and
  with public access. Before `1.0.0` a breaking change is a `minor` with a
  migration note.
- Licensing is MIT; each package ships its own `LICENSE` and the React package
  will carry third-party notices once a dependency needs one.
- Package `README.md` files, the playground, Storybook, `tools/` and CI belong
  to later iterations and are not part of the scaffold.

## 8. Open questions

These are intentionally unresolved and are decided by the iteration that needs
them:

- The exact success/failure shape of `markAllRead` and the reconciliation
  scenario for an unknown outcome (Iteration 1).
- The precise cache key of the derived view model (Iteration 3).
- Whether preloading data for server rendering needs a serialisable seed beyond
  the controller contexts (Iteration 19).
