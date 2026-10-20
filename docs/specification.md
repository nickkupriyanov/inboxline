# Inboxline — specification

This document records the architecture decisions that are fixed before the
first domain code exists, plus the contract that each iteration has actually
implemented. The roadmap ([`../roadmap.md`](../roadmap.md)) owns the sequence of
work; this file owns the descriptions.

> **Current status: Iteration 17 — soft animations.** The framework-free
> core is implemented: the notification, context, filter, page, adapter and error
> types; the RFC 3339 and calendar-day helpers; the boundary checks; the reducer;
> the resolved configuration with `en`/`ru` copy; the class slots; the derived
> view; the deterministic mock adapter; the controller with lifecycle, first page,
> counter, filters, paging, mutations and external updates; the browser entry
> point `@nickkupriyanov/inboxline-core/dom`; and the stylesheet published as
> `@nickkupriyanov/inboxline-core/styles.css` with a copy on the React entry.
> `@nickkupriyanov/inboxline-react` publishes `InboxProvider`, `useInboxFlow()`
> and `useInboxUI()`, the ready-made `<Inbox />` bell popover or feed, replaceable
> parts and a replaceable animation kit. The optional
> `@nickkupriyanov/inboxline-react/motion` entry swaps the CSS kit for springs;
> `motion` stays an optional peer.

## 1. Packages and entry points

| Entry point                                  | State                                                    | Content                                                                                                                                                                                                                                                                                         |
| -------------------------------------------- | -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@nickkupriyanov/inboxline-core`             | Contract, state, view, mock and controller (Iteration 9) | Types, adapter contract, boundary checks, errors, context/filter, timestamps, the reducer, the configuration, the copy, the class slots and `cx()`, the derived view model, the deterministic mock adapter and the controller lifecycle, filters, paging, mutations and external invalidations. |
| `@nickkupriyanov/inboxline-core/dom`         | Browser helpers (Iterations 10 and 17)                   | Focus around a non-modal panel, element size and animated-height observation, media queries and the viewport-constrained area around an anchor; no React, no import-time browser access.                                                                                                        |
| `@nickkupriyanov/inboxline-core/styles.css`  | Stylesheet (Iterations 11, 15 and 17)                    | Plain CSS: `--il-*` design tokens for both themes, a scoped base layer, the feed root, rows, states, the bell trigger, badge and portalled panel, and the animation layer. Built into `dist/inboxline.css`.                                                                                     |
| `@nickkupriyanov/inboxline-react`            | Provider, hooks, layouts, parts and kits (Iteration 17)  | `InboxProvider`, `useInboxFlow()`, `useInboxUI()`, `<Inbox />` with the default bell popover and `layout="feed"`, the default parts and their types, the provider props plus flow/UI types, `cssAnimations` and the `AnimationKit` types.                                                       |
| `@nickkupriyanov/inboxline-react/styles.css` | Copy of the core stylesheet (Iteration 11)               | Byte copy of `dist/inboxline.css`, made by the React post-build step.                                                                                                                                                                                                                           |
| `@nickkupriyanov/inboxline-react/motion`     | Optional Motion entry point (Iteration 17)               | The main public API plus `motionAnimations` and an `InboxProvider` that defaults to them. The only entry point that imports `motion`, which is an optional peer.                                                                                                                                |

The core publishes values from `./adapter`, `./classNames`, `./config`,
`./context`, `./controller`, `./derive`, `./errors`, `./i18n`, `./mock`,
`./reducer` and `./time`; `./types` is a type-only module. The separate `./dom`
entry publishes the browser helpers. `./styles.css` publishes the built
stylesheet; the authored files live in `packages/core/src/styles/` and are
concatenated by the post-build step. Each entry point has a test that fails when
an undeclared runtime export appears.

Rules that hold for every entry point:

- The core is React-free and DOM-free. Browser objects are touched only inside
  called functions, never while a module is being imported.
- `inboxline-core` is safe to import in Node and during server rendering; so is
  `inboxline-core/dom`, which reads neither `window` nor `document` until one of
  its functions is called.
- No entry point has a third-party runtime dependency. Motion is an optional
  peer of the React binding and lives behind its own subpath.

Prefixes are reserved project-wide: `il-*` for classes, `--il-*` for CSS custom
properties, `data-il-*` for DOM state attributes, and `IlClassSlot` for the
public slot type.

### DOM helpers

**Implemented in Iteration 10** (`packages/core/src/dom/`). The subpath exists
for the binding, not as a second UI layer: it measures and moves focus, and the
UI layer decides what to do with the result.

| Export                    | Purpose                                                                                                                              |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `focusableWithin`         | The elements inside a container that can take focus right now, in document order.                                                    |
| `focusFirstWithin`        | Puts focus on the first such element, falling back to a focusable container; returns the element focused or `null`.                  |
| `captureFocus`            | Remembers the focused element before a panel opens.                                                                                  |
| `restoreFocus`            | Returns focus to a remembered element if it is still connected; returns whether focus moved.                                         |
| `measureSize`             | The border-box size of an element, or `{ width: 0, height: 0 }` when there is no element.                                            |
| `measureHeight`           | The border-box height alone, or `0` when there is no element.                                                                        |
| `observeSize`             | Reports a size now and on changes; `ResizeObserver` where available, the window resize event otherwise, nothing on a server.         |
| `observeAnimatedHeight`   | Measures an element and reports each change with an `animating` flag that settles after the duration; disabled under reduced motion. |
| `REDUCED_MOTION_QUERY`    | The `(prefers-reduced-motion: reduce)` string the binding and kits share.                                                            |
| `canMatchMedia`           | Whether the host has a usable `matchMedia`, without calling it at import time.                                                       |
| `matchesMediaQuery`       | The current value of a query, or `false` where it cannot be read.                                                                    |
| `observeMediaQuery`       | Reports a query now and on every change; reports `false` once and watches nothing without `matchMedia`.                              |
| `measureAvailableArea`    | The anchor rectangle, the layout viewport and the free space on four sides with a margin subtracted; `null` without a viewport.      |
| `observeAvailableArea`    | Reports that area now and after scroll, resize or an anchor size change, without repeating an identical measurement.                 |
| `DEFAULT_VIEWPORT_MARGIN` | The default `8` px gap used by `measureAvailableArea` and `observeAvailableArea`.                                                    |

Rules the DOM entry point guarantees:

1. **No import-time host access.** Importing `inboxline-core/dom` in Node reads
   neither `window` nor `document`; a caller that never invokes a function sees
   no browser access at all.
2. **No focus trap.** The bell panel is a non-modal dialog, so the helpers never
   intercept `Tab` or `Escape`. They answer “where should focus go now” and
   “where should it return”; the binding decides when restoring focus is polite
   and never steals focus from an element the visitor clicked.
3. **Every subscription is removable and repeatable.** A remover clears the
   listeners and disconnects the observer; calling it twice is safe, and
   subscribing again starts from a fresh measurement. Several anchors can be
   observed independently.
4. **Missing APIs degrade, they do not throw.** Without `ResizeObserver` the
   size and area observers use the window resize event; without a host they
   report once (`null` for an area) and watch nothing.
5. **Coordinates are viewport-relative.** `AvailableArea` is meant for
   `position: fixed` and matches `getBoundingClientRect()`. It uses the layout
   viewport (`documentElement.clientWidth`/`clientHeight`, falling back to
   `window.innerWidth`/`innerHeight`), not the visual viewport, so browser zoom
   and on-screen keyboards remain the UI layer's concern.
6. **Duplicates are not reported.** `observeAvailableArea` compares the anchor
   rectangle, the viewport and the margin, and skips a listener call when the
   result would be equal. A scroll that does not move the anchor therefore does
   not cause a render.

### Stylesheet

**Implemented in Iteration 11** (`packages/core/src/styles/`,
`packages/core/scripts/postbuild.mjs`, `packages/react/scripts/postbuild.mjs`).
The stylesheet is plain CSS and a public contract: classes and tokens keep the
project prefixes, and a change to either is a change to the published API.

The authored files are concatenated in this order:

| Source                  | Content                                                                |
| ----------------------- | ---------------------------------------------------------------------- |
| `styles/tokens.css`     | Shape, layout, type, motion, the dark palette and the light overrides. |
| `styles/base.css`       | Scoped box model, typography, focus, utilities and reduced motion.     |
| `styles/inboxline.css`  | Root, header, list, day groups, rows and loading/empty/error states.   |
| `styles/animations.css` | Row entrance/exit, panel entrance/exit and the measured-height clip.   |

The post-build step writes `dist/inboxline.css`. The core publishes it as
`./styles.css`; the React post-build step copies the same bytes to
`packages/react/dist/inboxline.css`, so `inboxline-react/styles.css` works when
only the binding is installed. Both packages declare CSS in `sideEffects`, so a
bundler keeps the file. Building the React package requires the core build to
run first; the root `pnpm build` guarantees the order.

Rules the stylesheet guarantees:

1. **Dark by default, light by an explicit attribute.** The palette is defined on
   `.il-root`; `[data-il-theme='light']` redefines the same set. There is no
   `prefers-color-scheme` rule, so an explicitly chosen theme is never switched
   by the system preference.
2. **Nothing reaches the consuming page.** Every authored rule is scoped by an
   `il-*` class or by `.il-root`. There is no reset of `html`, `body`, `:root` or
   bare elements, and controls inherit the font through a zero-specificity
   `:where()` reset.
3. **The family geometry is a token.** Card 28 px, inner panel 22 px, control
   14 px, pill 999 px; the popover is 400 px, the feed 800 px, and both are
   capped by `max-width: 100%` and work in a 320 px container.
4. **The layout attribute chooses the width and the scrolling.** `popover` uses
   `--il-width-panel`, a 340 px list cap and the panel shadow; `feed` uses
   `--il-width-feed` and grows with its rows. The viewport never chooses the
   composition, so an open panel does not re-lay out by itself.
5. **States are attributes, not modifier classes.** `data-il-unread`,
   `data-il-pending`, `data-il-unknown`, `data-il-disabled` and a row’s
   `aria-disabled` are the visual hooks. Unread also carries the marker and the
   accessible name; unknown pairs the amber ring with a textual status. A pending
   row keeps its text contrast instead of fading.
6. **Focus is visible and motion is optional.** One `:focus-visible` rule draws a
   2 px ring with a 2 px offset. `prefers-reduced-motion: reduce` collapses every
   animation and transition in the scoped subtree to 1 ms.

The token values, their reference sources, the class map, the measured contrast
deviations and the review stand are documented in
[`visual-reference.md`](./visual-reference.md). The contrast of caption, warning,
danger, focus and unread-marker colours is recalculated from the authored tokens
by `packages/core/src/styles/styles.test.ts`; jsdom and screenshots are not
treated as proof of contrast.

`apps/style-stand/index.html` is a hand-written static page that links the built
stylesheet and shows both themes, the feed and popover widths, the 320 px
container, the row states and the list states. It is a review tool, not a
published package. Browser regression automation remains Iteration 22.

Trigger, panel, filters, counter and every replaceable part now have their
components and slots. Internal helper classes (`.il-group-list`,
`.il-loading-row`) are not slots and are not a public extension point; the
stable surface is `IlClassSlot` plus the tokens.

## 2. Controller and snapshot

**Implemented in Iterations 5–9** (`packages/core/src/controller.ts`).
`createInboxController({ adapter, context?, filter?, config?, clock?, callbacks? })`
owns the data flow and returns a `getSnapshot()`, a `subscribe()`, the lifecycle
(`start`/`stop`), `refreshTime()`, `updateConfig()` and `actions`.

- It performs no requests, subscriptions, timers or callbacks when it is
  created. Reading `getSnapshot()` before `start()` is safe and describes an idle
  inbox with an unknown counter.
- `getSnapshot()` returns `{ revision, state, view }` and keeps returning the
  same object until the state, the configuration or the rendered minute actually
  changes. The view is memoised by
  `inboxViewKey(stateRevision, configRevision, anchor)`, and the time anchor is
  rebuilt from the injected clock on every read.
- `subscribe(listener)` returns an unsubscribe function; removing the same
  listener twice is safe.
- `start()` is idempotent: it loads the first page and the counter in parallel.
  `stop()` is idempotent too: it aborts the pending loads, and a late answer from
  either of them is dropped. Starting again after a stop performs a fresh first
  load instead of trusting the interrupted one.
- `refresh()` reloads the first page and the counter together. It keeps the
  currently shown rows until the new first page arrives, and a failure keeps
  them while the error is recorded and reported. `retry()` repeats only the loads
  that are in the error state, leaving a successful list or counter untouched. A
  failed next page is retried from the same cursor; when the first page itself
  failed, its successful retry replaces the chain instead of racing a page of
  the old one.
- The list and the counter are independent: each has its own status, error and
  request generation, so either can fail while the other succeeds. Until the
  server reports a counter it stays `null`, never a confirmed zero.
- `setFilter(filter)` validates the value, ignores the filter that is already
  active and otherwise abandons the rows, the cursor and the in-flight requests
  of the previous one. When started, it loads the first page of the new filter;
  the counter and its request are untouched, because the counter belongs to the
  whole context. A filter chosen before `start()` is used by the first load.
- `loadMore()` appends the next page of the current filter and context. It does
  nothing without a cursor, before the first page is ready or while another page
  is already loading, so two rapid calls produce one request. An empty page is a
  valid answer; a repeated cursor — the one just requested or any earlier cursor
  of the chain — ends the list instead of creating a cycle. A failed page keeps
  the shown rows and the cursor, so calling `loadMore()` again repeats that same
  page.
- A first page always supersedes the chain: `start`, `refresh`, `setFilter`, a
  context change and an adapter replacement abort an in-flight page load, and its
  late answer can neither append rows nor replace the new first page.
- `setRead(id, read)` sets the desired state of one loaded notification and
  queues the change. The optimistic layer is recorded first, so the row and the
  projected counter move immediately. Individual mutations are serialised: one
  request at a time, in the order they were asked for. A repeated request for the
  same id and an opposite one are both ignored while its operation is queued, in
  flight or `unknown`, and a request for the state the row already has is not
  sent. A confirmed answer installs the server notification and counter and
  supersedes a counter load that was started earlier; a rejection rolls back that
  operation only. An answer that does not state an outcome is kept as the visible
  `unknown` state and starts a reconciliation instead of a retry.
- `reconcile()` repeats that reconciliation when the automatic one failed: a
  successful first page and counter are the confirmed server state and resolve
  unknown rows. With nothing to reconcile it does nothing.
- `markAllRead()` runs the bulk operation on its own: it is refused while an
  individual change is queued, and individual `setRead()` calls are refused while
  it runs. Its optimistic layer projects every loaded row as read and the counter
  as zero. On success the server boundary marks the loaded rows created at or
  before it read, the server counter is installed, and a refreshed first page
  brings in the events created after the boundary — they stay unread. A confirmed
  refusal drops the layer. A lost answer stays `unknown` and is reconciled with a
  refresh, never repeated automatically. It does nothing while the counter is
  unknown or zero.
- `setContext(context)` resets the rows, counter, paging, optimistic layer — and
  the queued mutations — when the key changes, and starts a fresh load if the
  controller is started. Replacing `context.data` under the same key only updates
  the object used by the following requests — the data still belongs to the same
  scope.
- `setAdapter(adapter)` ignores the same reference. A different adapter abandons
  the queued mutations, retracts their optimistic layer and keeps the current
  rows on screen while loading a new first page and counter from the replacement
  when the controller is started. Both a context change and an adapter
  replacement release the invalidation subscription and open the new one.
- **External updates.** When the adapter implements the optional `subscribe`, the
  subscription is opened before the first request of a started controller and
  released by `stop()`. An invalidation refreshes the counter and raises the
  “updates available” flag without touching the open list, so new events never
  shift a list the visitor is reading. `showUpdates()` acknowledges the flag and
  loads the first page and the counter; a change that arrives while that load is
  in flight keeps the flag for a later acknowledgement. A burst of events is
  coalesced into one counter read, and an event that arrives during a request
  makes that request stale instead of being lost. A failing `subscribe` is
  reported through `onError` (phase `load`) and retried by the next `refresh()`;
  the transport itself, including its reconnection, stays in the application.
- `updateConfig(input)` resolves locale, time zone and message overrides and
  bumps the snapshot only when the resolved values actually differ. It never
  reloads server data.
- `refreshTime()` re-reads the clock and notifies listeners when the rendered
  minute or day changed; it never performs a request.
- Failures are normalised with `toInboxError()` and reported through `onError`
  after the snapshot already holds them. An exception thrown by a callback is
  contained: it neither rejects the action nor triggers a second request, and a
  cancelled request never reaches `onError`.
- `actions` is the fixed vocabulary below. `refresh`, `retry`, `setFilter`,
  `loadMore`, `setRead`, `markAllRead`, `showUpdates`, `reconcile`, `setContext`
  and `setAdapter` are live.

```ts
const inbox = createInboxController({
  adapter,
  context: { key: 'user-1' },
  clock: { now: () => Date.now() },
  callbacks: { onError: (error) => report(error) },
});

inbox.start();

// Later, after the first page and the counter have settled:
await inbox.actions.refresh();
const { view } = inbox.getSnapshot();
```

The reducer and the derivation step are pure functions: time and side effects
are injected, never read from `Date.now()` or the network inside them.

### The reducer and its state

**Implemented in Iteration 2** (`packages/core/src/reducer.ts`). The reducer is
the only place the model moves, and it is pure: `createInboxState()` builds the
initial value, `inboxReducer(state, action)` applies one transition, and an
action that changes nothing returns the very same object, so a snapshot can stay
stable between real changes.

`InboxState<TData>` keeps the confirmed server data, the status of each load and
the optimistic layer apart from each other:

| Field                                  | Type                                       | Meaning                                                                   |
| -------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------- |
| `contextKey`                           | `string`                                   | The user/workspace the state belongs to.                                  |
| `filter`                               | `InboxFilter`                              | The filter the loaded rows belong to. The counter ignores it.             |
| `byId`                                 | `Record<string, InboxNotification<TData>>` | Confirmed notifications exactly as the adapter reported them.             |
| `order`                                | `readonly string[]`                        | Their ids in the server's order, newest first, without duplicates.        |
| `nextCursor`                           | `string \| null`                           | The cursor of the next page.                                              |
| `listStatus` / `listError`             | `InboxLoadStatus` / `InboxError \| null`   | The first page: the initial load and every refresh.                       |
| `pageStatus` / `pageError`             | `InboxPageStatus` / `InboxError \| null`   | Appending the next page.                                                  |
| `unreadCount`                          | `number \| null`                           | The server counter; `null` means “not known yet”, never a confirmed zero. |
| `countStatus` / `countError`           | `InboxLoadStatus` / `InboxError \| null`   | The counter load.                                                         |
| `pending`                              | `InboxPendingState`                        | The optimistic layer, deliberately separate from `byId`.                  |
| `actionError`                          | `InboxActionError \| null`                 | The last confirmed refusal, scoped to one row or to the bulk action.      |
| `updatesAvailable`                     | `boolean`                                  | An invalidation is waiting for an explicit reload of the first page.      |
| `listToken`, `pageToken`, `countToken` | `number`                                   | The generation each request was started with.                             |

`InboxPendingState` is `{ reads, readOrder, bulk }`, where `reads` holds at most
one `InboxPendingRead` per notification id and `readOrder` is the queue they were
asked for in. One operation is `{ token, read, previousRead, status }`:
`previousRead` is the confirmed state it started from, which is what a rollback
and a correction of the displayed counter are based on. The three outcomes need
no third field — a confirmed operation leaves no entry (the confirmed row shows),
a rejected one leaves no entry either (only the optimistic value is retracted and
the failure reaches `onError`), and an operation whose answer was lost stays with
`status: 'unknown'` until the application reconciles. `bulk` is `{ token, status }`
or `null`; it is one operation for the whole context, so it never appears in
`readOrder`.

`actionError` is `{ scope: 'read', id, error }` or `{ scope: 'bulk', error }`. It
holds only a confirmed refusal: a lost answer is represented by the operation's
`unknown` status and is settled by reconciliation, never reported as a refusal.
The entry starts no request and blocks nothing; a new mutation, a confirmation,
a filter change or a context change clears it. A binding uses it to explain the
rollback next to the row or the bulk control.

| Action                                         | Effect                                                                                                                                                                          |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `contextChanged(contextKey)`                   | A different user/workspace: rows, counter, paging, pending, the update flag and generations all start over. The filter is kept.                                                 |
| `externalUpdate`                               | Raises `updatesAvailable` once per burst; the rows, the counter and the layer are untouched.                                                                                    |
| `setFilter(filter)`                            | Empties the rows and the paging, keeps the counter and the pending layer, clears `actionError`, and supersedes the in-flight first page.                                        |
| `listLoading` / `listLoaded` / `listFailed`    | Loading, replacing the chain with a first page, or failing while keeping what is on screen. `listLoaded` also states whether an invalidation is still awaiting acknowledgement. |
| `pageLoading` / `pageLoaded` / `pageFailed`    | Appending a page; a failure keeps the rows and the cursor, so the same page can be retried.                                                                                     |
| `countLoading` / `countLoaded` / `countFailed` | Loading the counter; a failure keeps the previous value, including `null`.                                                                                                      |
| `readPending`                                  | Records one desired read state in the layer, without touching `byId` or `unreadCount`.                                                                                          |
| `readConfirmed`                                | Writes the confirmed row (only if it is already loaded) and the server counter, drops the operation and clears `actionError`.                                                   |
| `readFailed`                                   | Rolls back that operation only; a confirmed refusal is stored in `actionError`, an abandonment is not.                                                                          |
| `readUnknown`                                  | Keeps the operation, marked `unknown`.                                                                                                                                          |
| `bulkPending`                                  | Records the whole-context operation in `pending.bulk`, without touching the rows or the counter; clears `actionError`.                                                          |
| `bulkConfirmed`                                | Marks loaded rows at or before the server boundary read, installs the server counter, drops the layer and clears `actionError`.                                                 |
| `bulkFailed`                                   | Rolls back the bulk layer only; a confirmed refusal is stored in `actionError`, an abandonment is not.                                                                          |
| `bulkUnknown`                                  | Keeps the bulk layer as `unknown`.                                                                                                                                              |
| `readsReconciled`                              | A fresh authoritative page and counter arrived: drops the operations marked `unknown`, leaves the pending ones.                                                                 |

Rules the transitions guarantee:

1. **Server order, no duplicates.** A page is never sorted. Merging a page is
   additive: the first occurrence of an id keeps both its place and its content,
   so overlapping pages cannot reorder the list or rewind a row.
2. **A refresh replaces the chain.** `listLoaded` installs the whole first page,
   so rows that are no longer part of it are gone, together with the paging of
   the previous chain.
3. **Advancing cursors.** A `nextCursor` that did not advance is treated as the
   end of the list, so paging cannot loop.
4. **Closed generations.** A terminal action (`listLoaded`, `listFailed`,
   `pageLoaded`, `pageFailed`, `countLoaded`, `countFailed`, `readConfirmed`,
   `readFailed`, `readUnknown`) whose token no longer matches is dropped: an
   answer to a superseded request, a filter the visitor left or a context that
   was replaced cannot move the state.
5. **The optimistic layer is separate.** `readPending` never writes `byId` and
   never changes `unreadCount`; a refresh does not retract a request that is
   still in flight; and a failure of one operation leaves every other operation
   and the confirmed data untouched.
6. **Confirmed data is not mutated.** The adapter's objects are stored, not
   copied or rewritten, and the reducer never mutates its input.
7. **The bulk boundary is server data.** `bulkConfirmed` reads `boundary` as the
   only definition of which loaded rows the operation covered: rows created at or
   before it become read, later rows keep their confirmed state, and the counter
   is installed exactly as reported — it is not assumed to be zero.

### The action vocabulary

**Fixed in Iteration 1, runtime from Iterations 5–9**
(`packages/core/src/controller.ts`). Every action that talks to the server
resolves when the operation has settled, successfully or not, and never rejects:
a failure is reported through `onError` and through the snapshot, so a binding
never needs a `.catch()` to keep a console clean.

| Action                | Meaning                                                                                                                         |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `setFilter(filter)`   | Selects the list filter. The global counter is not affected.                                                                    |
| `refresh()`           | Reloads the first page and the counter, replacing the loaded list.                                                              |
| `retry()`             | Repeats exactly the loads that failed, including a failed page at the same cursor; with nothing failed it does nothing.         |
| `loadMore()`          | Appends the next page of the current filter and context; one request at a time, and a repeated cursor ends the list.            |
| `setRead(id, read)`   | Sets a desired read state; the change is queued until the server confirms it. `read` is a state, not a toggle.                  |
| `markAllRead()`       | Marks every notification of the context read on the server, including the ones never loaded; runs outside the individual queue. |
| `showUpdates()`       | Applies an invalidation the adapter announced; does nothing when none is pending, otherwise it behaves like `refresh()`.        |
| `reconcile()`         | Reads the server state again after an unknown outcome, without retrying the operation.                                          |
| `setContext(context)` | Replaces the context; in-flight work of the previous one is abandoned.                                                          |
| `setAdapter(adapter)` | Replaces the adapter; in-flight work of the previous one is abandoned.                                                          |

Callbacks are `onNotificationClick(notification)` — the application navigates,
the library never opens a link — and `onError(error)`; a cancelled request never
reaches `onError`. The controlled UI values (`open`/`defaultOpen`/`onOpenChange`,
`filter`/`defaultFilter`/`onFilterChange`) belong to the binding and are
described in section 4; they reach the core through these actions.

`onNotificationClick` belongs to the same callback type, but activation is a UI
event: the core has no action that means “the visitor opened this row”. The
ready-made feed calls the provider's handler with the confirmed notification, and
a custom UI calls `useInboxUI().onNotificationClick` itself. The library never
opens a link and never invents an activation.

### Filters and paging

**Implemented in Iteration 6** (`packages/core/src/controller.ts`). The reducer
already owned the transitions; this iteration made them reachable from the
controller and closed the races between a first page and an appended one.

- **The filter is a list filter.** `setFilter` keeps `unreadCount`,
  `countStatus` and an in-flight counter request. It replaces `byId`, `order`,
  `nextCursor`, `listStatus`, `pageStatus` and their errors, then loads the first
  page of the new filter when the controller is started. The generation tokens of
  both list requests move, so an answer for the previous filter is dropped even
  if an adapter ignores its `AbortSignal`.
- **One page request at a time.** `loadMore` is allowed only with a next cursor,
  a ready first page and no page already loading. A second call resolves
  immediately without calling the adapter. A failed page stays retryable because
  `nextCursor` and every shown row are kept.
- **Cursor cycles end the list.** The controller remembers the cursors requested
  in the current chain; a response whose `nextCursor` was already requested is
  stored with `nextCursor: null`. The reducer's own rule — a cursor equal to the
  one just requested ends the list — remains the second line of defence. The
  requested-cursor set starts over with every first page, so a new chain is not
  constrained by the old one.
- **Merging stays additive.** Overlapping pages keep the first occurrence of an
  id, its place and its content. An empty page with a fresh cursor is accepted
  and paging continues; an empty page with `null` ends the list.
- **Refresh wins over paging.** A refresh (and every other first-page load)
  aborts the page in flight. It keeps the current rows until its own first page
  succeeds, then replaces the whole chain, including the old cursor. A failed
  refresh keeps both the rows and the cursor it was refreshing.

### Individual read status

**Implemented in Iteration 7** (`packages/core/src/controller.ts`,
`packages/core/src/derive.ts`). `setRead(id, read)` is an explicit desired state,
so two clients or a repeated click can never flip a row by accident.

- **The layer is recorded before the request.** `readPending` writes the desired
  state with the confirmed state it started from (`previousRead`) and touches
  neither `byId` nor `unreadCount`. Only a loaded notification can be changed:
  `previousRead` is what both the rollback and the counter projection are based
  on. A different state for a row that is already `pending` or `unknown` is
  ignored, and so is a request for the state the row already has.
- **Mutations are serialised.** At most one `setReadStatus` is in flight; the
  rest wait in `readOrder` and are sent one at a time.
- **The counter is projected, not rewritten.** The derived view starts from the
  confirmed server number and applies one step per _pending_ operation whose
  `previousRead` differs from the desired `read`. The state keeps the server
  value, and the projection never falls below zero. An operation marked `unknown`
  is left out: it may already be part of the server number, and the
  reconciliation is what decides.
- **The server confirms.** A successful answer installs the notification exactly
  as the server reported it and the server counter. That counter is newer than a
  counter load that was already in flight, so the older request is aborted and a
  late answer is dropped by the identity check.
- **A refusal rolls back one operation.** `readFailed` removes only that layer
  entry, so new notifications and other successful changes survive; the failure
  reaches `onError` with `outcome: 'rejected'`. The state also keeps the last
  refusal in `actionError`, and the derived row exposes its localized text as
  `actionError`; it is cleared by the next mutation, a confirmation or a filter
  change.
- **A lost answer is not a refusal.** Anything that does not state an outcome —
  a thrown transport error, a timeout, a closed connection — becomes an
  `InboxError` with `outcome: 'unknown'`. The operation stays visible as
  `unknown`, `onError` receives that error, and the controller reconciles instead
  of repeating the mutation. A successful refresh of the first page and the
  counter applies `readsReconciled`, which resolves the unknown rows against the
  confirmed data. A failed reconciliation keeps them for `reconcile()`.
- **The unread filter is live.** A row whose effective state is read is not part
  of the `unread` view, so it disappears as soon as the operation is queued and
  comes back if it is rolled back. The row stays in `byId` and `order`: the
  filter is a view of the loaded chain, not a second server query.
- **Lifecycle.** A changed context or adapter abandons the queued operations and
  retracts their layer; a request that already left is left to settle, and its
  answer is dropped by the source generation. `stop()` drops the queued
  operations the same way but lets an in-flight one finish, because cancelling it
  after the server received it would create the unknown outcome the contract
  tries to avoid.

### The bulk “mark all read” operation

**Implemented in Iteration 8** (`packages/core/src/controller.ts`,
`packages/core/src/reducer.ts`, `packages/core/src/derive.ts`). The bulk operation
is one server call for the whole context, so it is deliberately not part of the
individual queue.

- **It runs alone.** `markAllRead()` does nothing while an individual operation is
  queued or in flight, and `setRead()` does nothing while a bulk operation is
  pending or `unknown`. The derived `canMarkAllRead` is `false` in both cases, so
  the button and the action agree.
- **The layer is optimistic, not confirmed.** `bulkPending` writes only
  `pending.bulk`. The derivation shows every loaded row as read and projects the
  counter to zero, because the request covers rows that were never loaded and
  their number is unknown. The confirmed rows and `state.unreadCount` are not
  rewritten.
- **The server boundary decides.** A successful answer carries
  `{ boundary, unreadCount }`. `bulkConfirmed` marks the loaded rows whose
  `createdAt` is at or before the boundary read (already-read rows keep their
  server object), leaves rows created after the boundary as the server reported
  them, installs the counter and drops the layer. The counter is not assumed to be
  zero: an event created after the boundary can legitimately keep it positive.
- **The first page follows the boundary.** After the confirmed answer the
  controller refreshes the first page and the counter, so events created after the
  boundary appear unread and rows that were never loaded are represented by the
  server's own answer. A failed refresh does not turn a successful bulk operation
  into a failure.
- **A refusal retracts the guess.** `bulkFailed` drops `pending.bulk`; the
  confirmed rows and the server counter were never touched, so the list returns to
  its previous state. `onError` receives the confirmed `rejected` outcome, and
  `actionError` keeps it scoped to the bulk control as the localized
  `actions.bulkError`.
- **A lost answer is reconciled, never repeated.** Anything that states no
  outcome becomes an `InboxError` with `outcome: 'unknown'`, `bulkUnknown` keeps
  the layer visible, and the controller refreshes the first page and counter.
  `readsReconciled` drops the unknown bulk layer after that authoritative answer.
  Calling `markAllRead` again is a new user action with a new boundary; the
  library never sends it automatically.
- **Lifecycle.** A context change resets the bulk layer with the rest of the
  state. Replacing the adapter retracts it before the new source is loaded. A bulk
  request that already left is allowed to settle, and its answer is dropped by the
  source generation.

### The derived view model

**Implemented in Iteration 3** (`packages/core/src/derive.ts`,
`packages/core/src/config.ts`, `packages/core/src/i18n.ts`,
`packages/core/src/time.ts`, `packages/core/src/classNames.ts`).

`deriveInboxView(state, config, time)` is pure: it reads the flow state, the
resolved configuration and an `InboxTimeAnchor`, and returns the whole
`InboxView<TData>` a binding renders. It never reads the clock, never touches the
DOM and never calls an adapter, so a binding does not format a date a second time.

| Part       | Contents                                                                                                                            |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `settings` | `locale`, `timeZone`, `filter`, `contextKey`.                                                                                       |
| `counter`  | `unreadCount` (`null` while unknown), `known`, the plural `label`, the load `status`, `loading`, a localized `error`.               |
| `list`     | `status`, `loading`, `error`, `empty`, `emptyLabel`, `loadingLabel`, `label`, `count`, `items`, `groups`.                           |
| `page`     | `status`, `loading`, `error`, `hasMore`, `canLoadMore`, `label`, `retryLabel`.                                                      |
| `updates`  | `available` (an invalidation is waiting) and `label` (“Show updates”).                                                              |
| `actions`  | `canRefresh`, `canLoadMore`, `canMarkAllRead`, `canRetryList`, `canRetryPage`, `canShowUpdates`, `busy`, `bulkStatus`, `bulkError`. |
| `live`     | The polite announcement of the current counter.                                                                                     |

Rules the derivation guarantees:

1. **Server order, grouped by day.** Rows follow `state.order`; consecutive rows of
   one calendar day (in `timeZone`) form an `InboxGroupView`, labelled `Today`,
   `Yesterday`, or the formatted day. Nothing is re-sorted, and the row's
   `timeLabel` is relative inside today and an absolute short date otherwise.
2. **The optimistic layer shows.** A row's `read`/`unread` are the effective
   values — a queued operation wins over the confirmed one — and `pending`/
   `unknown` describe that operation. `notification` stays the confirmed server
   object for application callbacks, so a binding never mistakes an optimistic
   guess for the server state. `actionError` appears only on the row whose last
   operation was refused. A pending or `unknown` bulk operation makes every
   loaded row read until its boundary or a reconciliation replaces the guess. A
   rolled-back operation is simply absent again, and the confirmed row shows
   through. In the `unread` filter a row whose effective state is read is not
   rendered, so the selection stays honest while the operation settles.
3. **The counter is server data.** `unreadCount` stays `null` and `known` stays
   `false` until the server reports a number, and `label` stays `null` until then.
   Pending operations are projected onto that number, one step per row and based
   on the confirmed state each started from; a lost answer is left out until it is
   reconciled. A pending bulk operation projects zero instead, because it claims
   the whole context; an unknown bulk operation is left out like any lost answer.
   The projection is independent of the loaded page and of the filter: a page of
   ten rows under a counter of 27 is a valid view.
4. **Action availability is conservative.** `canMarkAllRead` needs a known
   non-zero counter, no queued individual operation and no bulk operation in
   flight; `canLoadMore` needs a next cursor, a ready list and no page already
   loading; `canShowUpdates` follows the invalidation flag and is false while the
   first page is loading.
5. **Time is injected.** Relative labels and the day groups come from the
   `InboxTimeAnchor`; nothing in the derivation calls `Date.now()`.
6. **The view is memoized by revision.** `inboxViewKey(stateRevision,
configRevision, time)` is `stateRevision | configRevision | today | minuteBucket`,
   and `createInboxViewMemo()` returns the very same object for the same key, so a
   binding can compare the snapshot by reference.
7. **Mutation feedback is derived, not recomputed.** `actions.bulkStatus` is
   `idle`, `pending` or `unknown`; `actions.bulkError` is the localized refusal of
   the bulk action. Row labels and statuses come from `InboxMessages`, so a custom
   dictionary changes them without a second copy in the binding.

Configuration (`resolveInboxConfig`) validates `locale` and `timeZone` against
`Intl` and falls back to deterministic constants (`en`, `UTC`) instead of the
browser, so the same input always resolves the same way — the property SSR and
hydration rely on — and merges per-key message overrides over the built-in
dictionaries. `InboxMessages` holds plain text with `{placeholder}` markers and no
markup; `selectPlural()` chooses the form with `Intl.PluralRules`.

Stable classes are listed by `IL_CLASS` and keyed by `IlClassSlot`. State a
stylesheet reacts to is written as a `data-il-*` attribute (`data-il-unread`,
`data-il-pending`, `data-il-unknown`, `data-il-error`, `data-il-kind`,
`data-il-status`, `data-il-empty`, `data-il-side`) rather than as modifier
classes; the trigger, badge, panel and close slots arrived with the bell in
Iteration 15. `cx(...values: ClassValue[])` joins the truthy class names in the
order given — stable slot class first, the consumer's `classNames` override
second, any state class last. It does no de-duplication or CSS-module lookup, so
the resulting string is stable in a snapshot and a consumer can rely on the
order. The React binding uses it for every slot.

## 3. Data model and adapter

**Implemented in Iteration 1** (`packages/core/src/types.ts`,
`packages/core/src/adapter.ts`, `packages/core/src/context.ts`,
`packages/core/src/time.ts`, `packages/core/src/errors.ts`).

### The notification

| Field       | Type                       | Rules                                                                                                     |
| ----------- | -------------------------- | --------------------------------------------------------------------------------------------------------- |
| `id`        | `string`                   | Stable identity. Deduplication, row keys and `setReadStatus` use it; never derived from position or time. |
| `createdAt` | `string`                   | RFC 3339 with an explicit `Z` or `±HH:MM` offset. Checked by `isInboxTimestamp()`.                        |
| `title`     | `string`                   | Non-empty human title. Rendered as text, never as markup.                                                 |
| `body`      | `string \| undefined`      | Optional plain text.                                                                                      |
| `author`    | `InboxAuthor \| undefined` | Optional `{ id?, name, avatarUrl? }`; only `name` is required.                                            |
| `icon`      | `string \| undefined`      | Optional image URL. A missing or broken image falls back to a placeholder.                                |
| `read`      | `boolean`                  | Confirmed server state, never an optimistic guess.                                                        |
| `data`      | `TData \| undefined`       | Application data. The library never reads or renders it; `TData` is never `any`.                          |

A page is `{ items: InboxNotification<TData>[]; nextCursor: string | null }`. A
cursor is opaque: the core passes it back untouched and never parses or compares
it, except for the rule that it must be non-empty and must advance.

### Context and filter

- `InboxContext<TContextData> = { key: string; data?: TContextData }`. `key`
  identifies the user/workspace and therefore the scope of the unread counter;
  `data` carries application values handed to the adapter with every request.
- `isSameInboxContext(a, b)` compares keys only: replacing `data` (a rotated
  token, another locale) does not reset the list, because the data still belongs
  to the same user/workspace. `undefined` means the implicit context, equal to
  `DEFAULT_INBOX_CONTEXT` (`key: 'default'`).
- `InboxFilter = 'all' | 'unread'`, with `INBOX_FILTERS` and `DEFAULT_FILTER`
  (`'all'`). The filter narrows the list only and never changes the meaning of
  the global counter.

### The adapter

| Method                    | Receives                              | Resolves with                                          |
| ------------------------- | ------------------------------------- | ------------------------------------------------------ |
| `getNotifications(query)` | `{ context, filter, cursor, signal }` | `InboxPage<TData>`                                     |
| `getUnreadCount(query)`   | `{ context, signal }`                 | `{ unreadCount }`                                      |
| `setReadStatus(query)`    | `{ context, id, read }`               | `{ notification, unreadCount }`                        |
| `markAllRead(query)`      | `{ context }`                         | `{ boundary, unreadCount }`                            |
| `subscribe?(query)`       | `{ context, onInvalidate }`           | an unsubscribe function; the method itself is optional |

Requirements the core relies on, and which a real adapter has to satisfy:

1. **Stable order.** The server returns newest first with a deterministic order
   for equal timestamps. The core keeps that order and only removes duplicate
   ids; it never sorts a page.
2. **Advancing cursors.** `nextCursor` is `null` at the end of the list, and
   otherwise a non-empty opaque string that never repeats for the same sequence.
3. **Explicit time.** Every `createdAt` and every `boundary` is RFC 3339 with an
   offset. `isInboxTimestamp()` rejects an offset-less value and a rolled-over
   date such as `2026-02-31T00:00:00Z` instead of re-interpreting it. Relative
   labels belong to the derived view model (Iteration 3).
4. **A counter that is server data.** `unreadCount` is a non-negative integer for
   the whole context, independent of the filter and of the loaded pages. A page
   of 10 rows under a counter of 27 is a valid answer.
5. **Confirmed mutations.** `setReadStatus` answers with the notification as the
   server now reports it plus the current counter; `markAllRead` answers with the
   boundary of the operation plus the counter that followed it.
6. **Page size belongs to the adapter.** The query carries no page size in v1, so
   the backend decides how many rows a page holds.
7. **Cancellation is not a failure.** Loads receive an `AbortSignal`; a real
   adapter passes it to `fetch` and a superseded request is rejected with an
   `AbortError`, which `isAbortError()` recognises and the core drops. Mutations
   are deliberately _not_ given a signal: cancelling one after the server
   received it would turn a known answer into an unknown outcome.

### Boundary checks

A backend payload is untrusted input. These helpers exist for adapter authors and
throw an `InboxError` with the code `ADAPTER_CONTRACT_VIOLATION`, raised where
the payload was produced instead of somewhere inside the reducer:

| Helper                                | Guards                                           | Phase      |
| ------------------------------------- | ------------------------------------------------ | ---------- |
| `assertInboxPage(value)`              | `{ items, nextCursor }` with valid notifications | `load`     |
| `assertInboxUnreadCount(value)`       | `{ unreadCount }`, a non-negative integer        | `load`     |
| `assertInboxReadStatusResult(value)`  | `{ notification, unreadCount }`                  | `mutation` |
| `assertInboxMarkAllReadResult(value)` | `{ boundary, unreadCount }`                      | `mutation` |

`isInboxNotification`, `isInboxPage`, `isInboxUnreadCount`,
`isInboxReadStatusResult`, `isInboxMarkAllReadResult` and `isInboxAuthor` are
the matching predicates, for an adapter that wants to branch instead of throw.
`data` is never inspected: it belongs to the application.

### The mock adapter

**Implemented in Iteration 4** (`packages/core/src/mock.ts`). `createMockAdapter()`
returns an ordinary `InboxAdapter` backed by an in-memory server simulator, so a
test or an example can drive the controller through the same contract without a
network. The data is explicit: notifications come from fixtures, time comes from
an injected `InboxClock`, and nothing is random. A context that was not seeded
starts empty.

```ts
const adapter = createMockAdapter({
  clock: { now: () => Date.parse('2026-10-18T13:00:00Z') },
  pageSize: 10,
  contexts: [{ context: { key: 'user-1' }, notifications: fixtures }],
});
```

The simulator follows the adapter contract:

- **Store per instance and per context key.** Two adapters, and two contexts of
  one adapter, never share rows or subscribers.
- **Deterministic order.** Rows are returned newest first; equal `createdAt`
  values are ordered by `id` ascending. The core does not sort, so the mock
  guarantees the same order on every call.
- **Cursor by sort key.** `nextCursor` encodes the `createdAt` and `id` of the
  last returned row, not an offset. A newer event or a row that disappears from
  the unread filter therefore cannot shift the continuation, duplicate a row or
  make paging loop. A cursor the mock did not issue is rejected with
  `ADAPTER_FAILURE` in the `load` phase.
- **Server counter.** `getUnreadCount` counts every unread row of the context,
  including rows beyond the loaded pages: a page of 10 under a counter of 27 is
  a normal answer.
- **Explicit mutations.** `setReadStatus` sets the desired state, is idempotent
  and confirms the row together with the counter; an unknown id is a
  `NOT_FOUND` mutation with the `rejected` outcome. `markAllRead` takes its
  boundary from the injected clock and marks every row with
  `createdAt <= boundary`, including unloaded ones. Rows created after the
  boundary stay unread, so the returned counter is not necessarily zero.

The adapter also exposes controls that are not part of the adapter contract:

| Control                         | Effect                                                                                       |
| ------------------------------- | -------------------------------------------------------------------------------------------- |
| `addNotification(context, row)` | Stores a new event without notifying subscribers. Duplicate ids and invalid rows throw.      |
| `invalidate(context)`           | Calls the context's invalidation subscribers, modelling another client or a transport event. |
| `failNext(operation, failure?)` | Queues one failure for the next call of one operation.                                       |
| `clearFailures(operation?)`     | Drops the queue of one operation, or every queue.                                            |
| `setLatency(latencyMs)`         | Replaces the delay for the following requests.                                               |

`subscribe()` is always available on the mock and each call is an independent
subscription; the returned function removes only that subscription and is safe
to call twice. `addNotification()` does not invalidate by itself: a scenario that
represents an external change calls `invalidate()` explicitly, so a test can
check that the list is kept until the controller refreshes it.

Latency is either one number or `(operation) => number`. Loads wait for it and
honour their `AbortSignal`: an aborted load rejects with the contract's
`AbortError`, never touches the store and does not consume a queued failure.
Mutations have no signal, exactly like the contract.

`failNext()` distinguishes the two mutation outcomes:

- the default `outcome: 'rejected'` throws an `InboxError` and leaves the data
  unchanged;
- `{ outcome: 'unknown' }` throws an `InboxError` with `outcome: 'unknown'`;
- `{ apply: true, outcome: 'unknown' }` applies the change first and then throws,
  which is the lost response after a server operation that did happen.

Loads cannot apply a change or have an unknown outcome, and a rejected mutation
cannot be applied first; both combinations throw `RangeError` when they are
queued.

### The error contract

| Code                         | Means                                                                                  |
| ---------------------------- | -------------------------------------------------------------------------------------- |
| `ADAPTER_FAILURE`            | A failed request the library could not classify further. Fallback of `toInboxError()`. |
| `ADAPTER_CONTRACT_VIOLATION` | The adapter resolved with a payload the library cannot use.                            |
| `UNAUTHORIZED`               | The session or token no longer grants access to the context.                           |
| `NOT_FOUND`                  | The notification, or the context, no longer exists.                                    |
| `CONFLICT`                   | The server refused the change because the state it was based on had moved on.          |
| `UNKNOWN`                    | Nothing about the failure is known — typically a lost answer.                          |

Two more dimensions are fixed on `InboxError` itself:

- `phase: 'load' | 'mutation'` — what failed, so a binding knows whether it is
  refreshing a list or reporting a failed action. Default: `'load'`.
- `outcome: 'rejected' | 'unknown'` — `rejected` is a confirmed refusal from the
  server; `unknown` means the request produced no usable answer, so the change may
  or may not have been applied. Default: `'rejected'`. `isUnknownOutcomeError()`
  recognises the second case; `createUnknownOutcomeError(cause)` builds it.

`toInboxError(value, fallbackCode, phase)` normalises anything an adapter threw:
an `InboxError` passes through untouched (a classification an adapter made is
never lost), anything else keeps the original value as `cause`. `isInboxError()`
is structural and not `instanceof`, so an adapter holding a second copy of the
package is still recognised. A cancellation has no code at all:
`createAbortError()` / `isAbortError()` mark it, and it is dropped before it can
reach `onError`.

### The unread counter

- The counter is server data. The length of a loaded page, or the number of
  unread rows the client happens to hold, never replaces it.
- Until the counter arrives the state is “unknown”, never a confirmed zero.
- `markAllRead` is atomic for the context on the server. Its boundary is the
  notifications that existed when the server applied the operation; events
  created after that boundary stay unread, so success does not mean a permanent
  zero — the counter in the same result is not `0` in general.

### `markAllRead` after an unknown outcome

The result of `markAllRead` is `{ boundary, unreadCount }`, where `boundary` is
the server moment the operation was applied. That single field decides both
questions an unknown outcome raises (the open question was answered here and the
operation is implemented in Iteration 8):

- Notifications with `createdAt <= boundary` are read; the ones created after it
  are not, so reconciliation compares confirmed rows against the boundary instead
  of assuming the counter is zero.
- The operation is never retried automatically. A later call is a new user
  request applied at a new boundary, which is exactly how a repeat stays honest
  after a lost answer.

### Optimistic actions and unknown outcomes

**The individual actions are implemented in Iteration 7; the bulk operation in
Iteration 8.**

- Optimistic changes are a separate layer above confirmed data. A failure of one
  operation rolls back only that operation's layer; new notifications and other
  successful changes survive.
- Mutations are serialised inside one controller. The bulk operation runs
  separately from the queue of individual changes, and its button is disabled
  while that queue is busy. Individual changes are refused while the bulk
  operation runs.
- A confirmed rejection is distinguished from an unknown outcome by
  `InboxError.outcome` (Iteration 1); an unknown outcome requires reconciliation
  with the server and never triggers an automatic retry of the mutation. A
  successful first page and counter resolve the unknown rows and the unknown bulk
  operation.
- “Mark all as read” runs on the server for the whole context and therefore
  covers notifications that were never loaded. Its server boundary decides which
  loaded rows it covered; events created after the boundary stay unread, so the
  counter that follows is not necessarily zero.

### External updates

**Implemented in Iteration 9** (`packages/core/src/controller.ts`,
`packages/core/src/reducer.ts`, `packages/core/src/derive.ts`). An optional
`subscribe` on the adapter reports that data was invalidated and returns an
unsubscribe function; its signature was fixed in Iteration 1. WebSocket, SSE and
SDK clients stay in the application, an event carries no mandatory delta, and v1
requires no shared server revision.

- **The subscription follows the lifecycle.** `start()` opens it before the first
  request, `stop()` releases it, and a context change or an adapter replacement
  releases the old subscription and opens the one for the new scope. A callback
  that a transport delivers after its subscription was released is ignored by the
  subscription generation. A second `start()` does not open a second one.
- **The counter is refreshed, the open list is kept.** An invalidation bumps the
  generation, raises `state.updatesAvailable` and reads the counter again,
  because the counter describes the whole context and has no list to protect. The
  rows are left exactly as they are: new events must not shift a list the visitor
  is reading.
- **Bursts are coalesced.** A microtask schedules one counter read for any number
  of events that arrive in the same turn. An event that arrives while a counter
  read is in flight is not lost: that answer is treated as stale, and a fresh read
  is sent after it settles. A failed invalidation-driven read is reported once and
  not retried in a loop — the next event or an explicit `refresh()` tries again.
- **An explicit acknowledgement applies the list.** `showUpdates()` does nothing
  while no update is pending and otherwise loads the first page and the counter.
  The flag is cleared by a first page that was requested after the latest
  invalidation; an event that arrives while that page is being loaded keeps the
  flag, so the next acknowledgement is the one that shows it. `refresh()` behaves
  the same way. Reopening the panel is the binding's explicit refresh.
- **The transport is the application's.** If `subscribe` throws or does not return
  an unsubscribe function, the failure is reported through `onError` with phase
  `load` and the controller keeps working without external updates; the next
  `refresh()` retries the subscription. Reconnection, heartbeats and delivery
  guarantees are not implemented by the library.
- **An event does not resolve unknown mutations by itself.** A lost `setRead` or
  `markAllRead` answer is still resolved by the refreshed first page and counter
  that `reconcile()` performs; an invalidation only makes the counter and the list
  flag move.

### Two payloads, one contract

Both examples end at the same types, which is what lets one core serve two
backends without a branch inside it. The first is a REST endpoint that already
speaks the library's vocabulary:

```ts
import { assertInboxPage, assertInboxUnreadCount } from '@nickkupriyanov/inboxline-core';

// { data: [{ id, createdAt, title, isRead, actor: { id, displayName, avatar } }], cursor }
const response = await fetch(`/api/notifications?cursor=${cursor ?? ''}`, { signal });
const raw: unknown = await response.json();
const payload = raw as { data: readonly Record<string, unknown>[]; cursor: string | null };

const page = assertInboxPage({
  items: payload.data.map((row) => {
    const actor = row.actor as { id: unknown; displayName: unknown; avatar?: unknown };
    return {
      id: String(row.id),
      createdAt: row.createdAt,
      title: row.title,
      read: row.isRead === true,
      author: {
        id: String(actor.id),
        name: String(actor.displayName),
        ...(actor.avatar === undefined ? {} : { avatarUrl: String(actor.avatar) }),
      },
    };
  }),
  nextCursor: payload.cursor,
});
```

The second is a GraphQL-ish payload that carries epoch milliseconds and nested
nodes, which the adapter converts at its own boundary:

```ts
// { nodes: [{ nodeId, createdAtMs, headline, seen, actor: { login, name } }], pageInfo }
const payload = raw as {
  nodes: readonly Record<string, unknown>[];
  pageInfo: { hasNextPage: boolean; endCursor: string | null };
};

const page = assertInboxPage({
  items: payload.nodes.map((node) => {
    const actor = node.actor as { login: unknown; name: unknown };
    return {
      id: String(node.nodeId),
      createdAt: new Date(Number(node.createdAtMs)).toISOString(),
      title: node.headline,
      read: node.seen === true,
      author: { id: String(actor.login), name: String(actor.name) },
    };
  }),
  nextCursor: payload.pageInfo.hasNextPage ? payload.pageInfo.endCursor : null,
});
```

The counter is a second, independent call — a page of ten rows says nothing
about it:

```ts
const { unreadCount } = assertInboxUnreadCount(await counterResponse.json());
// unreadCount === 27 while `page.items.length === 10`
```

## 4. React binding

**Implemented in Iterations 12–16** (`packages/react/src/`). The package publishes
the runtime exports and types below. Iteration 15 added the bell; Iteration 16
added the provider-level parts map, class overrides and the default-part exports;
Iteration 17 added the animation kit and its optional Motion entry. Parts keep the
same contract for the bell and the feed because both render one `InboxSurface`.

| Export                                              | Purpose                                                                                                         |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `InboxProvider`                                     | Owns one core controller, starts and stops it, supplies the flow and UI contexts, parts and class overrides.    |
| `Inbox`                                             | The ready-made bell (`<Inbox />`) or feed (`layout="feed"`): header, filters, rows, actions, paging and states. |
| `useInboxFlow`                                      | The headless flow: `{ snapshot, actions }` from the nearest provider.                                           |
| `useInboxUI`                                        | Presentation values, copy and controlled UI state: theme, locale, filter, open, parts, kit and setters.         |
| `DEFAULT_INBOX_COMPONENTS`                          | The complete parts map the widget uses when the application replaces nothing.                                   |
| `DefaultTrigger`, `DefaultHeader`, `DefaultFilters` | Default parts, so an application can wrap one instead of re-implementing it.                                    |
| `DefaultNotificationItem`, `DefaultAvatar`          | Default row and leading tile, usable inside a wrapper.                                                          |
| `DefaultLoading`, `DefaultEmpty`, `DefaultError`, … | Default loading, empty, first-page error and next-page error blocks.                                            |
| `cssAnimations`                                     | The default zero-dependency kit, printable through `animations` like any other.                                 |

The provider props are `adapter`, `context`, `config`, `clock`, `initialData`,
`theme`, `className`, `classNames`, `components`, `animations`, the controlled pairs
`filter`/`defaultFilter`/`onFilterChange` and `open`/`defaultOpen`/`onOpenChange`,
`onNotificationClick`, `markReadOnOpen` (default `true`), `onError` and
`children`. `InboxFlow<TData, TContextData>` and `InboxUI<TData>` are public
types; `InboxUI` exposes the resolved `markReadOnOpen`, `className`, `classNames`
and `components`, so a custom view makes the same decisions as the ready-made
one. The domain types are re-exported from the core so a consumer needs one
import.

### The ready-made feed

`<Inbox layout="feed" />` renders one `layout="feed"` composition from the
nearest provider. It is a consumer of the same public hooks a custom UI uses, not
a second controller: every date, counter, group and availability flag comes from
`snapshot.view`, and every request goes through `actions` or the controlled
`setFilter`.

- The root carries `data-il-layout="feed"`, `data-il-theme` and
  `data-il-filter`. The heading and the list use `listLabel`; the filter group has
  its own accessible name and two native buttons with `aria-pressed`.
- Day groups are consecutive rows of one calendar day. The list itself is a
  labelled `<ul>`; each group is a list item containing its label and a nested
  list of notification rows. It is never presented as a menu.
- A row shows the author avatar or the notification icon, the title, the optional
  body and the time. A broken avatar falls back to the author's initials; a broken
  icon falls back to the bell glyph; a row with neither starts its text at the
  first grid column. Missing optional data is omitted rather than rendered empty.
- Unread is carried by the row surface, the marker and a visually hidden “Unread”
  label. The time stays tabular and the title and body wrap instead of overflowing;
  the feed has no fixed height.
- A row has two independent controls: the activation button (title, body, author
  and time) and the read/unread button next to it. They are siblings, never
  nested; a row without `onNotificationClick` and without an active
  `markReadOnOpen` renders as plain text. The read button has the accessible name
  “Mark as read/unread: {title}”, and its icon is `aria-hidden`.
- Activation calls `onNotificationClick` with the confirmed
  `item.notification`, not the optimistic view. When `markReadOnOpen` is `true`
  and the row is unread, it also calls `actions.setRead(id, true)`; the two do not
  wait for each other, and an exception thrown by the callback is contained and
  never turns a successful request into a failure.
- The action bar appears while the counter is known and non-zero, or while a bulk
  operation or its refusal is on screen. “Mark all as read” uses `aria-disabled`
  plus a guarded handler, so a focused control is not replaced by an unfocusable
  `disabled` button when the individual queue is busy. A bulk refusal leaves the
  rows and the counter untouched.
- Row statuses are text, not colour alone: `Saving…` while the operation is
  queued or in flight, `Checking with the server…` with an amber ring for a lost
  answer, and the localized refusal with a red ring in `role="alert"`. The status
  sits next to the row and does not disable unrelated rows; only the core contract
  blocks individual actions while a bulk operation runs.
- In the unread filter, a row disappears as soon as its read request is queued.
  Focus then moves to the same control of the next row, then the previous row, and
  finally to the active “Unread” filter button. It moves only when the removed
  control still owned focus, so a click elsewhere is not stolen.
- Loading the first page shows three skeleton rows with a status label. The loaded
  empty state uses the filter-specific copy. A failed first page keeps any existing
  rows, shows an alert with a retry, and a failed next page is a smaller strip above
  the unchanged rows.
- The next page is a native button with an explicit “Show more” label; it uses
  `aria-disabled` plus a guarded handler while that page loads, so the focus stays on the
  control, and it disappears at the end of the list. An external invalidation appears as
  an explicit “Show updates” button and does not reorder the open list before it is used.
- The counter is announced through a hidden polite live region with an explicit
  `role="status"` and `aria-atomic`; row and bulk statuses use their own
  `role="status"` / `role="alert"`, so the whole list is not read again after a change.
  The feed does not duplicate the global counter in its header; the bell trigger owns the
  badge.
- Filters, paging and updates work in both controlled and uncontrolled modes
  because they call `useInboxUI().setFilter`; the feed never decides the filter on
  its own. Read actions always go through `actions.setRead` and
  `actions.markAllRead`, so a custom UI and the ready-made feed share one queue.

The feed is rendered through the replaceable parts described below: its root,
header, filters, rows, avatar and state blocks are the defaults, not hard-coded
markup. A replacement and the class slots use the same prepared props.

### The bell and its panel

`<Inbox />` is the bell composition and the default layout. It renders one native
trigger and, while open, the same notification surface in a non-modal dialog
portalled to `document.body`. `layout="feed"` chooses the standalone feed above.
The two layouts can live under one provider: the badge, the list and every action
read the same snapshot and the same controller.

- **Trigger.** A native `type="button"` with a bell glyph, `aria-haspopup="dialog"`,
  `aria-expanded`, and `aria-controls` pointing at the mounted panel. Its accessible
  name is the list label followed by the server counter label — for example
  “Notifications. 3 unread notifications” — or the unknown-counter text while the
  server has not answered. The visible badge repeats the number and is
  `aria-hidden`, so the counter is announced once. A zero or unknown counter renders
  no badge rather than a misleading `0`.
- **Dialog.** The panel is the root card with `role="dialog"`, labelled by its
  heading, and deliberately **not** `aria-modal`: the page behind it stays
  reachable and there is no focus trap. The heading, filters, rows, bulk action,
  updates banner and error states are the shared surface, so the bell cannot drift
  from the feed.
- **Open state.** The panel follows `useInboxUI().open` and calls `setOpen()`, so
  the provider's controlled/uncontrolled rules apply unchanged. Closing only hides
  the panel; it never calls `stop()` and never removes the provider's subscription.
  Reopening the panel calls `actions.refresh()`: the first page and the counter are
  verified against the server, exactly as an explicit refresh would.
- **Placement.** The panel uses `position: fixed`. The available area comes from
  `measureAvailableArea()` / `observeAvailableArea()` in
  `@nickkupriyanov/inboxline-core/dom`, so a scroll of any ancestor, a window
  resize or an anchor resize re-places it. The panel is right-aligned to the
  trigger, shifted left only when the viewport margin requires it, and its width
  is `min(400px, viewport − 2 × 8px)`: on a 320 px screen it is 304 px wide, not a
  source of horizontal scroll. The side with more free space wins; the panel is
  expressed with `top` below the trigger or `bottom` above it, and `max-height` is
  capped to the free space minus an 8 px gap. `data-il-side` exposes the chosen
  side to CSS and tests.
- **Focus.** Opening from the trigger moves focus to the dialog, whose heading is
  announced. The panel does not trap Tab. Escape closes it and returns focus to
  the trigger; the close button does the same. A pointer outside closes it without
  moving focus, so the element the visitor clicked keeps it. An `open` value
  changed by the application does not move focus on its own.
- **Theme and tokens.** The trigger lives in `.il-bell`, which is a token scope like
  `.il-root`; the portalled panel keeps `.il-root` and the same `data-il-theme`, so
  the portal cannot lose the palette. The close action is a native button with the
  localized `closeLabel`.
- **SSR.** The portal is created only after mounting, so a server render and its
  first client render agree; the full SSR contract, including a server-open panel
  and stable IDs, remains Iteration 19. The minute ticker that would keep relative
  labels fresh is not scheduled yet: the application still calls
  `actions.refreshTime()` itself.

Known boundaries of this iteration:

- The provider owns exactly one `open` value, so two bells in one provider open
  together. Two independent bells need two providers, while any number of feeds
  can share either.
- Without a viewport measurement (a server, a DOM without layout) the panel is not
  rendered; the trigger remains a valid collapsed control.
- The panel does not lock page scroll, and the layout viewport is used: browser
  zoom, `visualViewport` and an on-screen keyboard are not compensated.
- A very short viewport lets the card itself scroll; the nested list keeps its
  token cap inside it.

### Replaceable parts and class overrides

**Implemented in Iteration 16** (`packages/react/src/parts.tsx`,
`packages/react/src/components/`). A part is a function component that receives
the data it renders and the actions it triggers; the controller, read queue,
focus hand-off, dialog placement and list structure stay with the library.

`components` is a provider prop, not an `Inbox` prop. The bell and the feed share
one surface, so one override applies to both and the two cannot drift apart. The
map is `InboxComponents<TData>`:

| Part               | Receives                                                                                         | Default draws                               |
| ------------------ | ------------------------------------------------------------------------------------------------ | ------------------------------------------- |
| `Trigger`          | `open`, `unreadCount`, `label`, prepared `slotProps`, default glyph/badge `children`             | Bell button with badge                      |
| `Header`           | `title`, `headingId`, `slotProps`, `headingProps`, prepared `filters` and `close`                | Header, heading, filters and close action   |
| `Filters`          | `label`, `options[]` (`value`, `label`, `selected`, prepared `props`), `slotProps`               | Group with two native filter buttons        |
| `NotificationItem` | `item`, `messages`, `activatable`, `slotProps`, `activateProps`, `readProps`, `avatar`, `status` | Row with activation and read/unread buttons |
| `Avatar`           | `item`, `kind` (`avatar`/`icon`/`none`), `slotProps`                                             | Image or initials, icon, or nothing         |
| `Loading`          | `label`, `slotProps`                                                                             | Three skeleton rows and a status label      |
| `Empty`            | `label`, `slotProps`                                                                             | Filter-specific empty text                  |
| `Error`            | `message`, `retryLabel`, `onRetry`, `slotProps`                                                  | First-page alert with retry                 |
| `PageError`        | same as `Error`                                                                                  | Next-page alert with retry                  |

Every `SlotProps` bundle carries the stable `il-*` class with the consumer's
`classNames` override already merged, the library's `data-il-*` state, the
`role`/`aria-*` contract where applicable, and the handler or `ref` the library
needs back. Button parts also receive their own prepared bundle:

- `TriggerPartProps.slotProps` carries the accessible name, `aria-haspopup`,
  `aria-expanded`, `aria-controls`, the click and the trigger ref.
- `HeaderPartProps.headingProps` must be spread on the heading: the dialog's
  `aria-labelledby` points at its id. `filters` and `close` are already rendered
  through their own parts.
- `FilterOption.props` carries the click that asks the provider for the filter,
  `aria-pressed` and the ref used when focus falls back to the active filter.
- `NotificationItemPartProps.activateProps` and `readProps` carry their clicks,
  `aria-busy`, the read action's accessible name (`Mark as read: {title}` /
  `Mark as unread: {title}`), the disabled mirror and the refs used for focus.
  They are siblings and must not be nested; `avatar` and `status` are rendered
  nodes that a replacement may place anywhere or drop.

`className` is a whole-widget class added to `.il-root` in the feed and to both
`.il-bell` and the portalled `.il-root` in the bell, so a theme declared by that
class reaches the trigger and the panel alike. `classNames` is a
`Partial<Record<IlClassSlot, string>>`: each value is appended after the stable
slot class and before any state class. Omitted slots keep only their base class.
Neither prop replaces the library's classes.

`TData` flows through `InboxComponents<TData>`,
`NotificationItemPartProps<TData>`, `AvatarPartProps<TData>` and `useInboxUI()`;
a custom row reads `item.data` without casting. When the application changes
`components`, `className` or `classNames` on a mounted provider, the controller is
not recreated and the list is not reloaded: only the presentation context
changes. Replacing a part does not disable the standard actions, and an exception
in an application callback remains contained.

The default parts are exported (`DefaultTrigger`, `DefaultHeader`,
`DefaultFilters`, `DefaultNotificationItem`, `DefaultAvatar`, `DefaultLoading`,
`DefaultEmpty`, `DefaultError`, `DefaultPageError`) together with
`DEFAULT_INBOX_COMPONENTS`, so a consumer can wrap the default rather than copy
it. The part props types are public and documented with JSDoc.

Known boundaries: a replacement owns its markup, so it must spread the prepared
props to keep focus, aria and the read flow; the library cannot detect a dropped
`slotProps`. `className` is applied to the bell wrapper and the portalled panel as
two elements, not to a common ancestor, so descendant selectors that expect one
wrapper do not apply. Per-slot overrides describe the ready-made structure; a
fully custom row uses its own classes inside `slotProps`. The three playground
examples are rendered in the real browser during review; jsdom tests cover the
prepared props, class merge, `TData`, state blocks and controller preservation.

### Animations

**Implemented in Iteration 17** (`packages/react/src/animations/`,
`packages/core/src/dom/height.ts`, `packages/core/src/dom/media.ts`,
`packages/core/src/styles/animations.css`). Motion is a replaceable layer, not a
second rendering mode: the markup, the class hooks and the accessibility contract
stay the library's whichever kit is in use.

`AnimationKit` has two primitives, and both are provider-level, like the parts:

| Primitive | Responsibility                                                                                                                                                                                                                                                     |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `Item`    | The `<li>` of a notification row. Receives `index` (zero-based, clamped to 12 for the stagger) and `exiting` (the row is only still mounted for its exit), plus the prepared slot props of `NotificationItem`. It must stay the row element rather than a wrapper. |
| `Height`  | A container that follows the height of the content it holds while that height changes. The binding measures; the kit decides how the change is carried out.                                                                                                        |

The default is `cssAnimations`, exported from the main entry: both primitives are
plain elements, and the movement lives in the stylesheet. The optional
`@nickkupriyanov/inboxline-react/motion` entry exports `motionAnimations` and an
`InboxProvider` that defaults to it. `motion` is an optional peer and the main
entry point never imports it; a test walks the module graph in both directions.
Passing `animations` to either provider still wins over the entry's default.

The CSS hooks are part of the contract a custom kit should keep:

- `.il-row-animated` on every row, with `--il-index` written inline. The stylesheet
  delays the entrance by `--il-stagger-step` (40 ms) per index.
- `data-il-exiting="true"` on a row that is leaving. The stylesheet sets
  `pointer-events: none`, clips it and runs the `il-row-out` collapse for
  `--il-exit-duration`.
- `.il-height` / `.il-height-inner`: the outer element gets an inline `height`
  only while a change is in flight and `data-il-animating="true"` while it clips.
  The inner element is what the binding measures. Both are left to size
  themselves once the transition settles.
- `data-il-motion="true"` marks what a runtime kit animates itself; the stylesheet
  switches its keyframes and transitions off for those elements.

Exit semantics are deliberately narrower than “anything that disappeared”:

- Only a row the visitor made read — the read action, or activation with
  `markReadOnOpen` — is held for its exit. A filter change, a refreshed page, a
  context change and “mark all as read” remove their rows at once, so a bulk
  replacement never plays as a cascade of individual exits.
- The held row is already out of the interaction tree when it appears: it is
  `aria-hidden`, its `data-il-exiting` attribute is set, both prepared button
  bundles lose their handler and ref, and the row leaves the tab order. The
  default row renders no buttons at all while exiting. The animation never extends
  a pending mutation and never changes what core derived.
- Focus moves on the same commit as the removal, to the next row control or to the
  unread filter, before the row is hidden. The held row does not block that move.
- The surface holds the row for `ROW_EXIT_DURATION` (240 ms) and writes the same
  number to `--il-exit-duration`, so the collapse and the unmount cannot drift.
  A filter or context change drops held rows immediately; a row that comes back
  because the server refused the read is rendered live again instead of being
  duplicated.
- The bell keeps its panel mounted for the same exit window, with
  `data-il-closing="true"`, `aria-hidden` and `inert`, and drops it afterwards.
  Reopening during the window cancels the exit rather than stacking a second
  panel. The panel is not a second surface: it uses the placement it had while
  open.

`prefers-reduced-motion: reduce` is honoured twice. The DOM helpers report the
media query and both hooks disable themselves: no height is measured, no row is
held, and the panel unmounts at once on close. The stylesheet also collapses
animations and transitions to 1 ms under the same query, so an application that
loads only the CSS still gets a calm result. A runtime kit uses Motion's own
`useReducedMotion` and skips its enter and exit transitions.

Known boundaries: the surface's exit window is a constant shared with the CSS
tokens; a custom kit that wants a different duration must keep the row mounted
through its own timer or accept the one the surface gives it. jsdom has no layout
engine, so the tests assert the hooks, the attributes and the unmount timing, not
the painted geometry; the visual review covers both themes, the narrow container
and reduced motion in the browser. The `--il-row-max-height` cap means a very tall
row is clipped to `6rem` at the start of its collapse; the cap is a token.

### Lifecycle

- The provider creates exactly one controller during its first render. Creating a
  controller has no side effects, so this is safe under Strict Mode.
- A single effect keeps the adapter, context and configuration in step with the
  props on every render. The controller compares them structurally: an equal
  adapter reference, an equal context key and an equal resolved configuration do
  nothing. Replacing `context.data` under the same key updates the following
  requests without reloading the open list; a different key resets the scope;
  another adapter reloads from the replacement.
- A second effect calls `start()` after mounting and `stop()` on unmount. A
  Strict Mode double mount therefore leaves one active adapter subscription, and
  a late answer of a stopped or replaced source is discarded by the controller.
- Callbacks are read from the latest props on every call. A re-render with a new
  `onError` or `onNotificationClick` never recreates the controller. The ready-made
  feed contains an exception from `onNotificationClick` itself, after the
  independent read request has left; `onError` follows the core rule and is called
  after the state already holds the failure.
- `useSyncExternalStore(controller.subscribe, controller.getSnapshot,
controller.getSnapshot)` is the only subscription. Both hooks under one
  provider receive the same snapshot object; two providers own two controllers
  even when they receive the same adapter.
- The binding still does not schedule `refreshTime()` itself. Relative labels are
  refreshed when the application calls the action; a minute ticker belongs with
  the remaining ready-made-layout work and is listed as a limitation of
  Iteration 15.

### Controlled and uncontrolled UI values

Two values are presentation state, not server data:

- `filter` narrows the list. The core still owns the filter it actually loaded,
  so `useInboxUI().filter` reports the applied value, not the requested one.
- `open` describes the bell panel. It never reaches the core: opening, focus,
  portalling and positioning belong to the UI layer.

Both follow the same rules:

1. Passing `filter` (or `open`) fixes that value in **controlled** mode when the
   provider is created. Passing only `defaultFilter` (or `defaultOpen`) seeds an
   **uncontrolled** value. Passing both warns in development; the controlled
   value wins.
2. In controlled mode `setFilter()`/`setOpen()` call `onFilterChange`/
   `onOpenChange` and wait for the prop. The core changes only when the
   application accepts the value, and an external prop update never echoes a
   change event back. Asking for the value that is already accepted is a no-op.
3. In uncontrolled mode the provider applies the change itself and then reports
   it through the same callback.
4. The mode is fixed at creation. A controlled value that becomes `undefined`
   keeps its last accepted value; a controlled value that appears after an
   uncontrolled start is ignored; changing a `default*` value after creation does
   not re-initialise anything. A mode change and a controlled/`default*` pair
   passed together warn once in development (`[inboxline]`); production keeps the
   initial mode and does nothing.
5. The notification list and the shared counter are deliberately not
   controllable: they are server data owned by the controller.

The provider-level `open` value describes the one bell of that provider. Two
bells need two providers; the feed can share either provider and its counter.

### Playground

`apps/playground/` is a Vite application over the package sources. Its first
section renders the default `<Inbox />` bell, the standalone
`<Inbox layout="feed" />` and a headless counter card under one provider, so the
shared controller is visible in the same snapshot and one open panel does not
disturb the feed. The second pair of providers shows a different context with
controlled filter and open values, and a button simulates an external event
through `addNotification()` + `invalidate()`. Three further sections are the
Iteration 16 examples: a typed row and avatar reading `TData`, an alternative
header with custom filter pills, and a lilac CSS theme declared through
`className`/`classNames` over the published tokens. The theme example shows both
the bell (trigger and portalled panel) and the feed under one provider. A final
section renders the feed through the optional `/motion` provider, so the spring
kit can be compared with the CSS default in the same page. It imports the
published stylesheet path through a source alias. It is started with `pnpm dev`
and built with `pnpm build:playground`; it is not a published package.

### Server rendering and hydration

**Implemented in Iteration 19** (`packages/core/src/controller.ts`,
`packages/react/src/browserPreferences.ts`, `apps/ssr-example/`). The contract is
deliberately small: a server render is an ordinary React render, the first
snapshot is either empty-and-loading or seeded, and hydration uses exactly the
same inputs.

**Deterministic configuration.** `resolveInboxConfig()` falls back to the
constants `en` and `UTC`, never to the machine it runs on, so a server and its
client resolve the same values from the same input. After mounting, the React
provider reads `navigator.languages` / `navigator.language` and
`Intl.DateTimeFormat().resolvedOptions().timeZone` once and merges only the fields
the application omitted; an explicit `locale` or `timeZone` wins, and an
undefined field keeps the constant until the effect runs. Detection happens in
an effect, never during render, so the first client render still matches the
server. It is not a subscription: a language changed in another tab is picked up
on the next mount. A value the application passed but `Intl` rejects is still
passed to `resolveInboxConfig`, which replaces it with the constant rather than
letting detection override the application's intent.

**The seed.** `InboxInitialData<TData>` is public and has exactly three fields:

| Field         | Meaning                                                             |
| ------------- | ------------------------------------------------------------------- |
| `page`        | The first page the server rendered: `{ items, nextCursor }`.        |
| `unreadCount` | The server counter, or `null` when it was unknown.                  |
| `now`         | Epoch milliseconds the server derived relative and day labels from. |

It contains no pending operation, adapter, callback, React element, token or
credential, so `JSON.stringify()` is enough — escape `<` when embedding it in a
script tag. `createInboxController()` validates the seed with the same rules as
an adapter answer and throws `RangeError` for a malformed page, counter or
anchor, because an unpageable first paint is worse than a failed request. The
seed produces confirmed rows and a ready list, plus a ready counter when
`unreadCount` is a number; `null` keeps the counter unknown. The pending layer
is empty.

`initialData` is read only when the controller is created. The rows stay on
screen while `start()` performs the first real request, and its answer replaces
the chain exactly like a refresh. The seed's `now` is the time anchor until
`start()` or `refreshTime()` is called; after that the injected clock is the only
source, so a client clock that disagrees with the server cannot leave relative
labels frozen at the server's minute.

Without a seed, a server render shows the loading skeleton: an `idle` list is
treated as “about to load”, not as an empty inbox. `start()` is still an effect,
so the server itself never sends a request.

**Portal and ids.** The panel is created only after mounting, and the trigger
reports `aria-expanded`/`aria-controls` only once the panel can exist. A server
render of `<Inbox />` therefore always contains the collapsed bell, even with
`defaultOpen`; the expanded state appears after hydration. Heading and panel ids
come from `useId()`, which React keeps stable between the server render and
hydration. The feed renders no portal at all.

**The runnable example.** `apps/ssr-example/` renders the same `<App>` in both
entries. Its server entry reads a first page and the counter from the mock
adapter, builds the seed, renders with `renderToString()` and embeds the seed in
the HTML; the client entry calls `hydrateRoot()` with the same seed and then lets
the provider's `start()` confirm it. Start it with `pnpm ssr` on
<http://localhost:4175>. Vite runs in middleware mode for the example, so the
server entry is compiled on demand; production build, asset serving and caching
belong to the consuming application.

**Boundaries.** The server render is synchronous: streaming, Suspense-based data
fetching and per-request caching are not part of the library. The application
must serialise the seed and pass the same configuration, theme and seed to both
renders; a mismatch is application error and React reports it as a hydration
mismatch. The seed is a first paint, not an authorisation boundary — do not put
tenant secrets or unfiltered data into it. Hydration is verified in jsdom and by
a Chromium run of the example; Firefox and Safari are covered by Iteration 22.

## 5. Visual language

**Implemented in Iteration 11** (`packages/core/src/styles/`, see also
[`visual-reference.md`](./visual-reference.md)). The look follows Slotline and
Soundline:

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

The authored values are adapted from the reference tokens, with three measured
exceptions recorded in `visual-reference.md`: the dark subtle caption is
`#9595a3` instead of `#9292a0` (4.49:1 became 4.67:1 on `--il-control-hover`),
and the focus ring is stronger (90% dark / 98% light) so it reaches 4.15:1 and
3.37:1 instead of 2.41:1 and 1.92:1, and stays at or above 3.19:1 on every row
surface. The palette itself, the 28/22/14/999 radii,
the 400/800 widths and the motion values are unchanged.

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

### Accessibility audit

**Implemented and audited in Iteration 18.** `accessibility.test.tsx` runs axe over
WCAG 2.0/2.1/2.2 A and AA tags on the real states: both themes, both compositions,
loading, empty, first-page failure, pending/refused/unknown reads, the external-update
banner, a refused bulk action and the open portalled dialog. It also drives the whole
flow with the keyboard through `@testing-library/user-event` and checks names,
`aria-pressed`/`aria-expanded`/`aria-controls`, the dialog/heading link, the live region
and focus recovery.

Behaviour fixed by the audit:

- **“Show more” stays focusable while it loads.** It uses `aria-disabled` and a guarded
  click instead of the native `disabled` attribute; the styles read
  `[aria-disabled='true']`. A native disabled button would move focus to `body` at the
  exact moment the visitor asked for the next page.
- **A completed control hands focus on.** When “Mark all as read”, “Show updates”, a
  retry or the last “Show more” removes the focused control, focus moves to the active
  filter instead of being lost. The row-specific hand-off is unchanged: the same control
  of the next row, then the previous row, then the active filter. A deliberate move
  elsewhere is never stolen because the fallback only acts when focus fell to `body`.
- **The live region is an explicit status.** It keeps `aria-live="polite"` and
  `aria-atomic`, adds `role="status"`, and contains only the counter sentence; the rows
  and buttons are never inside it. Row and bulk statuses keep their own roles.
- **The quiet read/unread glyph is still a control.** Its colour is `--il-text-subtle`
  and its opacity is `0.8` instead of `0.6`. At 60% it measured 2.32:1 on the light
  unread surface, below the 3:1 WCAG 1.4.11 requires for a non-text control; at 80% the
  minimum across every row surface is 3.25:1 in the token calculation.

Measured in Chromium 155 through the browser check (CDP, axe-core with
`color-contrast` enabled; the exact JSON and screenshots live in the ignored
`.screenshots/` directory):

| What                                | Dark     | Light    |
| ----------------------------------- | -------- | -------- |
| axe violations, feed                | 0        | 0        |
| axe violations, open panel          | 0        | —        |
| Small caption on the unread surface | 5.75:1   | 5.18:1   |
| Read/unread glyph (opacity 0.8)     | 4.16:1   | 3.46:1   |
| Selected filter text                | 6.33:1   | 7.48:1   |
| Badge count on the accent fill      | 4.83:1   | 4.83:1   |
| Focus ring against the row surfaces | ≥ 3.19:1 | ≥ 3.04:1 |

Every interactive target measured between 28 and 44 px on both axes (WCAG 2.2 asks for
24 px). At a 360 px viewport the feed was 336 px wide, at 640 px (200% zoom of a 1280 px
window) 600 px, and at 320 px 296 px, with no horizontal document overflow in any case.
The reduced-motion pass removed the panel without a closing frame and returned focus to
the trigger immediately. Playground buttons are styled with zero specificity so demo
rules cannot repaint the inbox's own controls and distort these measurements.

Boundaries of the automated checks: jsdom has no layout or paint, so axe runs without
`color-contrast` there and the colour evidence is the token calculation plus the browser
measurement; axe does not check non-text contrast at all, so icons and rings are
calculated rather than axe-approved. The browser pass covers one Chromium; Firefox,
WebKit and repeatable visual regressions are Iteration 22. Zoom is emulated by reducing
the layout viewport, not by driving the browser's own zoom UI. If both ready-made
compositions are mounted under one provider, each keeps its own polite live region, so
the counter may be announced twice; one composition per provider is recommended for
announcement purposes while the state stays shared.

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
- Contract types are checked twice: `tsc` compiles `src/**/*.test.ts`, so the
  `expectTypeOf` assertions in `types.test.ts` fail `pnpm typecheck` when a
  generic stops flowing, and Vitest runs the same files as ordinary tests.
  In Iteration 1 `vitest typecheck` is not configured, so negative assertions
  are written as conditional types rather than as `@ts-expect-error`.
- The stylesheet has no PostCSS or preprocessor step: a Node post-build script
  concatenates the three authored files in a fixed order, and the React package
  copies the result. `sideEffects` lists `**/*.css`, so tree-shaking keeps the
  published file.
- Package `README.md` files, the playground, Storybook, `tools/` and CI belong
  to later iterations and are not part of the scaffold.

## 8. Open questions

These are intentionally unresolved and are decided by the iteration that needs
them:

- How a backend that cannot report a `markAllRead` boundary should express it —
  the v1 contract requires one, and an adapter for such a backend has to
  synthesise it (Iteration 21, with the HTTP example).

Resolved in Iteration 1: the success shape of `markAllRead` is
`{ boundary, unreadCount }` and an unknown outcome is `InboxError` with
`outcome: 'unknown'`, never an automatic retry.

Resolved in Iteration 2: the snapshot stays `{ revision, state, view }` and the
`state` half is `InboxState<TData>` as described in section 2 — confirmed rows and
their server order, one status per load, the counter with its honest `null`, the
optimistic layer and the request generations. The `view` half is fixed by the
derived view model in Iteration 3.

Resolved in Iteration 3: the `view` half is `InboxView<TData>` (section 2), and
its cache key is `stateRevision | configRevision | today | minuteBucket`, built by
`inboxViewKey()`. The day and the minute are the only parts of the time reference
the rendered view depends on — relative labels change when the minute does and
when the day rolls over, and nothing else moves with `nowMs`.

Resolved in Iteration 4: the mock adapter does not generate a data set and has no
seed. Every scenario supplies explicit fixtures, and time is an injected clock.
A generator would hide the data a test asserts on, while a serialisable seed is a
question for server rendering (Iteration 19), not for the mock.

Resolved in Iteration 5: `start()` always performs a fresh first-page and counter
load, so a restart after `stop()` reconciles instead of trusting an interrupted
request. `refresh()` repeats both loads, while `retry()` repeats only the ones in
the error state. A controller keeps a monotonic request token in addition to the
reducer generations, so a context change — which restarts the generations — can
never let an answer of the previous scope match a new request. Replacing
`context.data` under the same key updates future requests without resetting the
data, and `getSnapshot()` reads the injected clock while `refreshTime()` is the
explicit announcement that the rendered minute changed.

Resolved in Iteration 7: an individual change is one operation per notification
id while it is queued, in flight or waiting for reconciliation; a repeated or
opposite click in that window is ignored, and a request for the state the row
already has is not sent. The displayed counter is a projection of pending
operations over the confirmed server number, and an `unknown` operation is left
out of that projection until a refresh resolves it. A transport error that states
no outcome is treated as `unknown`; only an adapter that says the change was
rejected produces a rollback. The `unread` filter removes a row whose effective
state became read, and a successful refresh of the first page and the counter —
including the automatic one after a lost answer — resolves the unknown rows.

Resolved in Iteration 8: the bulk operation is one whole-context request outside
the individual queue. The two kinds of mutation exclude each other; the bulk
layer projects known rows as read and the counter as zero until the server
answers. Its `boundary` is what marks loaded rows read, so events created after
the boundary stay unread and the returned counter is accepted even when it is not
zero. A confirmed answer is followed by a refreshed first page and counter; a
refusal drops the layer; a lost answer stays `unknown`, is reconciled by that
refresh and is never sent again automatically. A context change resets the layer
and an adapter replacement retracts it.

Resolved in Iteration 9: an invalidation is a signal, not a change. It refreshes
the counter and raises `state.updatesAvailable`, but the open list is replaced
only by an explicit `showUpdates()` or `refresh()`. The flag is cleared by a first
page that was requested after the latest invalidation, so an event that arrives
during the load keeps the flag instead of being silently swallowed. Invalidations
are coalesced into one counter read, a counter request that started before the
event is treated as stale rather than trusted, and a failed invalidation-driven
read is surfaced once instead of being retried in a loop. A subscription failure
is reported with phase `load` and retried by the next `refresh()`; transport
reconnection stays the application's responsibility.

Resolved in Iteration 10: the DOM entry point measures, it does not place. The
available area is viewport-relative for `position: fixed`, uses the layout
viewport and clamps free space at zero, while choosing a side and aligning an edge
belong to the binding. Importing the subpath touches no host object; a missing
`ResizeObserver`, `window` or `document` degrades to a single measurement or a
no-op remover instead of an exception. There is no focus trap because the panel
is non-modal; `captureFocus`/`restoreFocus` only remember and return focus, and
the binding decides whether returning it would steal focus from a click outside.

Resolved in Iteration 11: the stylesheet is a public contract, not a theme
preset. Tokens live on `.il-root`; the light theme is the same palette under an
explicit attribute, and no system-preference query is present. Every rule is
scoped, so the consuming page keeps its reset, typography and focus behaviour.
The layout attribute, not the viewport, picks the 400 px popover or the 800 px
feed, and both are capped by the parent. `data-il-*` carries row state; pending
keeps text contrast, unknown is amber plus a textual status, and disabled is
marked programmatically. The authored CSS is concatenated by a post-build step
into `dist/inboxline.css`; the React package copies the same bytes. Trigger,
panel, filters, counter and replaceable parts stay absent until they have a
component. Contrast is recalculated from the tokens in `styles.test.ts`, with
the measured focus-ring and dark-caption adjustments documented in
`visual-reference.md`; a browser measurement remains part of the visual review.

Resolved in Iteration 12: the React provider owns one controller and exposes two
headless hooks. Server data stays under the controller; `filter` and `open` are
the only controlled React values, fixed in mode when the provider is created.
`useInboxUI().filter` reports the filter actually loaded, so a controlled
application that has not accepted a request cannot make the list claim otherwise.
The provider-level `open` belongs to the one bell of that scope; a second bell
needs a second provider, while any number of feeds can share the counter. A
development-only warning names each mode change and each `default*`/controlled
pair passed together; production keeps the initial mode and the last accepted
value. Configuration and callback props are re-supplied on every render and
compared by the core, so changing them never recreates the controller.

Resolved in Iteration 13: the ready-made feed is a consumer of the public hooks,
not a second controller. It renders one labelled list of day groups, uses native
buttons for the filters and paging, and takes every label, row and availability
flag from `snapshot.view`. The feed sets `data-il-layout`, `data-il-theme` and
`data-il-filter` on the root; the selected filter is read from `aria-pressed`, so
the visual selection and the announced state cannot drift. A broken avatar falls
back to initials and a broken icon to an inline glyph, while a row with neither
renders no leading tile. The global counter is announced by the feed's live region
but is not repeated in the header; the bell badge owns that presentation in
Iteration 15.

Resolved in Iteration 14: the row is two sibling native buttons, not one nested
control. Activation calls `onNotificationClick` with the confirmed notification
and optionally starts `setRead` at the same time; neither waits for the other,
and a callback exception is contained after the request has left. `markReadOnOpen`
is resolved by the provider and exposed through `useInboxUI()`. A confirmed
refusal is core state (`actionError`) and appears as localized row or bulk text,
while a lost answer stays `unknown` and is reconciled. The bulk button uses
`aria-disabled` with a guarded handler so focus survives a busy queue. In the
unread filter, the used control's focus moves to the next row, then the previous
one, and finally to the active filter; it is not stolen if focus moved elsewhere.

Resolved in Iteration 15: `<Inbox />` is the bell popover by default and
`<Inbox layout="feed" />` is the standalone list. Both are the same surface over
one controller. The trigger's accessible name joins `listLabel` with the server
counter label and the badge is `aria-hidden`; an unknown counter is never shown as
zero. The panel is a non-modal dialog portalled to the document body, placed with
the measured available area, capped to the viewport and re-placed on scroll,
resize and anchor-size changes. Opening from the trigger focuses the dialog;
Escape and the close button return focus to the trigger, while an outside pointer
closes without stealing focus. Reopening calls `refresh()`, and closing never
stops the provider. One provider still owns one `open` value, so two independent
bells need two providers.

Resolved in Iteration 18: the accessibility contract is verified by axe on the real
DOM states and by keyboard integration tests, while colour is decided by the token
calculation and a browser measurement rather than by jsdom. “Show more” stays
focusable while loading through `aria-disabled` and a guarded handler. When a
control completes its job and leaves the DOM, focus falls back to the active filter
only if it fell to `body`; row hand-off keeps its next/previous/filter order. The
hidden live region is an explicit `role="status"` containing only the counter, and
row/bulk statuses keep their own roles. The read/unread glyph is faded to `0.8`
rather than `0.6`, which brings its minimum non-text contrast from 2.32:1 to
3.25:1 across both themes. Playground button defaults use zero specificity so a
demo rule cannot repaint the widget under measurement. The remaining boundaries —
no non-text contrast from axe, a single Chromium, viewport-based zoom emulation and
two live regions when both compositions share a provider — are listed in section 6.

Resolved in Iteration 19: the server-render seed is `InboxInitialData<TData>` —
`{ page, unreadCount, now }` and nothing else. It is validated like an adapter
answer, applied as confirmed state at controller creation, and used as the time
anchor until `start()` or `refreshTime()`. The provider accepts it as
`initialData`; the same value must reach the hydrating render. Configuration keeps
the deterministic `en`/`UTC` fallback during render, and the binding detects the
visitor's language and zone once after mounting, with explicit fields winning.
Without a seed an idle list renders as loading rather than empty. The bell panel
is still client-only; its trigger only claims to be expanded once the panel can
exist, which keeps a `defaultOpen` server render identical to its hydration.
