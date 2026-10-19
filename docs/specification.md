# Inboxline — specification

This document records the architecture decisions that are fixed before the
first domain code exists, plus the contract that each iteration has actually
implemented. The roadmap ([`../roadmap.md`](../roadmap.md)) owns the sequence of
work; this file owns the descriptions.

> **Current status: Iteration 9 — external updates and reconciliation.** The
> notification, context, filter, page, adapter and error types are implemented in
> `@nickkupriyanov/inboxline-core` (`packages/core/src/`), next to the RFC 3339
> timestamp and calendar-day helpers, the boundary checks an adapter wraps its
> payloads in, the pure reducer with its initial state, the resolved
> configuration with its `en`/`ru` copy and plural rules, the stable class slots,
> the pure `deriveInboxView()` with its snapshot memo, `createMockAdapter()` with
> its simulator controls, and `createInboxController()` with its lifecycle,
> first-page, counter, filter, paging, mutation and external-update behaviour —
> including the server-side bulk operation and the optional invalidation
> subscription. The React binding is marked **Planned** and is not part of the
> available API.

## 1. Packages and entry points

| Entry point                                  | State                                                    | Content                                                                                                                                                                                                                                                                              |
| -------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `@nickkupriyanov/inboxline-core`             | Contract, state, view, mock and controller (Iteration 9) | Types, adapter contract, boundary checks, errors, context/filter, timestamps, the reducer, the configuration, the copy, the class slots, the derived view model, the deterministic mock adapter and the controller lifecycle, filters, paging, mutations and external invalidations. |
| `@nickkupriyanov/inboxline-core/dom`         | Not built yet                                            | Browser helpers (focus, size observation, available area) — Iteration 10.                                                                                                                                                                                                            |
| `@nickkupriyanov/inboxline-core/styles.css`  | Not built yet                                            | Authored stylesheet — Iteration 11.                                                                                                                                                                                                                                                  |
| `@nickkupriyanov/inboxline-react`            | Empty placeholder                                        | Provider, hooks and layouts — Iteration 12 onwards.                                                                                                                                                                                                                                  |
| `@nickkupriyanov/inboxline-react/styles.css` | Not built yet                                            | Copy of the core stylesheet — Iteration 11.                                                                                                                                                                                                                                          |
| `@nickkupriyanov/inboxline-react/motion`     | Not built yet                                            | Optional Motion entry point — Iteration 17.                                                                                                                                                                                                                                          |

The core publishes values from `./adapter`, `./classNames`, `./config`,
`./context`, `./controller`, `./derive`, `./errors`, `./i18n`, `./mock`,
`./reducer` and `./time`; `./types` is a type-only module. Modules that belong to
later iterations — `dom` and the `styles/` directory — do not exist yet, and
`index.test.ts` fails when an undeclared runtime export appears.

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

| Action                                         | Effect                                                                                                                                                                          |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `contextChanged(contextKey)`                   | A different user/workspace: rows, counter, paging, pending, the update flag and generations all start over. The filter is kept.                                                 |
| `externalUpdate`                               | Raises `updatesAvailable` once per burst; the rows, the counter and the layer are untouched.                                                                                    |
| `setFilter(filter)`                            | Empties the rows and the paging, keeps the counter and the pending layer, supersedes the in-flight first page.                                                                  |
| `listLoading` / `listLoaded` / `listFailed`    | Loading, replacing the chain with a first page, or failing while keeping what is on screen. `listLoaded` also states whether an invalidation is still awaiting acknowledgement. |
| `pageLoading` / `pageLoaded` / `pageFailed`    | Appending a page; a failure keeps the rows and the cursor, so the same page can be retried.                                                                                     |
| `countLoading` / `countLoaded` / `countFailed` | Loading the counter; a failure keeps the previous value, including `null`.                                                                                                      |
| `readPending`                                  | Records one desired read state in the layer, without touching `byId` or `unreadCount`.                                                                                          |
| `readConfirmed`                                | Writes the confirmed row (only if it is already loaded) and the server counter, and drops the operation.                                                                        |
| `readFailed`                                   | Rolls back that operation only.                                                                                                                                                 |
| `readUnknown`                                  | Keeps the operation, marked `unknown`.                                                                                                                                          |
| `bulkPending`                                  | Records the whole-context operation in `pending.bulk`, without touching the rows or the counter.                                                                                |
| `bulkConfirmed`                                | Marks loaded rows at or before the server boundary read, installs the server counter and drops the layer.                                                                       |
| `bulkFailed`                                   | Rolls back the bulk layer only.                                                                                                                                                 |
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
  reaches `onError` with `outcome: 'rejected'`.
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
  its previous state. `onError` receives the confirmed `rejected` outcome.
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

| Part       | Contents                                                                                                              |
| ---------- | --------------------------------------------------------------------------------------------------------------------- |
| `settings` | `locale`, `timeZone`, `filter`, `contextKey`.                                                                         |
| `counter`  | `unreadCount` (`null` while unknown), `known`, the plural `label`, the load `status`, `loading`, a localized `error`. |
| `list`     | `status`, `loading`, `error`, `empty`, `emptyLabel`, `loadingLabel`, `label`, `count`, `items`, `groups`.             |
| `page`     | `status`, `loading`, `error`, `hasMore`, `canLoadMore`, `label`, `retryLabel`.                                        |
| `updates`  | `available` (an invalidation is waiting) and `label` (“Show updates”).                                                |
| `actions`  | `canRefresh`, `canLoadMore`, `canMarkAllRead`, `canRetryList`, `canRetryPage`, `canShowUpdates`, `busy`.              |
| `live`     | The polite announcement of the current counter.                                                                       |

Rules the derivation guarantees:

1. **Server order, grouped by day.** Rows follow `state.order`; consecutive rows of
   one calendar day (in `timeZone`) form an `InboxGroupView`, labelled `Today`,
   `Yesterday`, or the formatted day. Nothing is re-sorted, and the row's
   `timeLabel` is relative inside today and an absolute short date otherwise.
2. **The optimistic layer shows.** A row's `read`/`unread` are the effective
   values — a queued operation wins over the confirmed one — and `pending`/
   `unknown` describe that operation. A pending or `unknown` bulk operation makes
   every loaded row read until its boundary or a reconciliation replaces the
   guess. A rolled-back operation is simply absent again, and the confirmed row
   shows through. In the `unread` filter a row whose effective state is read is
   not rendered, so the selection stays honest while the operation settles.
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

Configuration (`resolveInboxConfig`) validates `locale` and `timeZone` against
`Intl` and falls back to deterministic constants (`en`, `UTC`) instead of the
browser, so the same input always resolves the same way — the property SSR and
hydration rely on — and merges per-key message overrides over the built-in
dictionaries. `InboxMessages` holds plain text with `{placeholder}` markers and no
markup; `selectPlural()` chooses the form with `Intl.PluralRules`.

Stable classes are listed by `IL_CLASS` and keyed by `IlClassSlot`. State a
stylesheet reacts to is written as a `data-il-*` attribute (`data-il-unread`,
`data-il-pending`, `data-il-unknown`, `data-il-status`, `data-il-empty`) rather
than as modifier classes; trigger, panel, filter and counter slots arrive with
their components in later iterations.

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
- Contract types are checked twice: `tsc` compiles `src/**/*.test.ts`, so the
  `expectTypeOf` assertions in `types.test.ts` fail `pnpm typecheck` when a
  generic stops flowing, and Vitest runs the same files as ordinary tests.
  In Iteration 1 `vitest typecheck` is not configured, so negative assertions
  are written as conditional types rather than as `@ts-expect-error`.
- Package `README.md` files, the playground, Storybook, `tools/` and CI belong
  to later iterations and are not part of the scaffold.

## 8. Open questions

These are intentionally unresolved and are decided by the iteration that needs
them:

- Whether preloading data for server rendering needs a serialisable seed beyond
  the controller contexts (Iteration 19).
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
