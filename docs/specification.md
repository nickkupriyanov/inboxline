# Inboxline — specification

This document records the architecture decisions that are fixed before the
first domain code exists, plus the contract that each iteration has actually
implemented. The roadmap ([`../roadmap.md`](../roadmap.md)) owns the sequence of
work; this file owns the descriptions.

> **Current status: Iteration 1 — the integration contract.** The notification,
> context, filter, page, adapter and error types are implemented in
> `@nickkupriyanov/inboxline-core`, next to the RFC 3339 timestamp check and the
> boundary checks an adapter wraps its payloads in. Nothing runs a request yet:
> the reducer, the derived view model, the controller and the React binding are
> marked **Planned** and are not part of the available API.

## 1. Packages and entry points

| Entry point                                  | State                       | Content                                                                       |
| -------------------------------------------- | --------------------------- | ----------------------------------------------------------------------------- |
| `@nickkupriyanov/inboxline-core`             | Contract only (Iteration 1) | Types, adapter contract, boundary checks, errors, context/filter, timestamps. |
| `@nickkupriyanov/inboxline-core/dom`         | Not built yet               | Browser helpers (focus, size observation, available area) — Iteration 10.     |
| `@nickkupriyanov/inboxline-core/styles.css`  | Not built yet               | Authored stylesheet — Iteration 11.                                           |
| `@nickkupriyanov/inboxline-react`            | Empty placeholder           | Provider, hooks and layouts — Iteration 12 onwards.                           |
| `@nickkupriyanov/inboxline-react/styles.css` | Not built yet               | Copy of the core stylesheet — Iteration 11.                                   |
| `@nickkupriyanov/inboxline-react/motion`     | Not built yet               | Optional Motion entry point — Iteration 17.                                   |

The core publishes values only from `./adapter`, `./context`, `./errors` and
`./time`; `./types` and `./controller` are type-only modules. Modules that
belong to later iterations — `reducer`, `derive`, `i18n`, `mock`, `dom`, the
controller runtime and the `styles/` directory — do not exist yet, and
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

### The action vocabulary

**Fixed in Iteration 1** (`packages/core/src/controller.ts`, types only; the
runtime arrives in Iteration 5). Every action that talks to the server resolves
when the operation has settled, successfully or not, and never rejects: a
failure is reported through `onError` and through the snapshot, so a binding
never needs a `.catch()` to keep a console clean.

| Action                | Meaning                                                                                                        |
| --------------------- | -------------------------------------------------------------------------------------------------------------- |
| `setFilter(filter)`   | Selects the list filter. The global counter is not affected.                                                   |
| `refresh()`           | Reloads the first page and the counter, replacing the loaded list.                                             |
| `loadMore()`          | Appends the next page of the current filter and context, when there is one.                                    |
| `setRead(id, read)`   | Sets a desired read state; the change is queued until the server confirms it. `read` is a state, not a toggle. |
| `markAllRead()`       | Marks every notification of the context read on the server, including the ones never loaded.                   |
| `reconcile()`         | Reads the server state again after an unknown outcome, without retrying the operation.                         |
| `setContext(context)` | Replaces the context; in-flight work of the previous one is abandoned.                                         |
| `setAdapter(adapter)` | Replaces the adapter; in-flight work of the previous one is abandoned.                                         |

Callbacks are `onNotificationClick(notification)` — the application navigates,
the library never opens a link — and `onError(error)`; a cancelled request never
reaches `onError`. The controlled UI values (`open`/`defaultOpen`/`onOpenChange`,
`filter`/`defaultFilter`/`onFilterChange`) belong to the binding and are
described in section 4; they reach the core through these actions.

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
questions an unknown outcome raises (the open question is answered here and in
Iteration 8):

- Notifications with `createdAt <= boundary` are read; the ones created after it
  are not, so reconciliation compares confirmed rows against the boundary instead
  of assuming the counter is zero.
- The operation is never retried automatically. A later call is a new user
  request applied at a new boundary, which is exactly how a repeat stays honest
  after a lost answer.

### Optimistic actions and unknown outcomes

**Planned (Iterations 2 and 7).**

- Optimistic changes are a separate layer above confirmed data. A failure of one
  operation rolls back only that operation's layer; new notifications and other
  successful changes survive.
- Mutations are serialised inside one controller. The bulk operation runs
  separately from the queue of individual changes, and its button is disabled
  while that queue is busy.
- A confirmed rejection is distinguished from an unknown outcome by
  `InboxError.outcome` (Iteration 1); an unknown outcome requires reconciliation
  with the server and never triggers an automatic retry of the bulk operation.
- “Mark all as read” runs on the server for the whole context and therefore
  covers notifications that were never loaded.

### External updates

**Planned (Iteration 9).** An optional `subscribe` on the adapter reports that
data was invalidated and returns an unsubscribe function (its signature is fixed
in Iteration 1). WebSocket, SSE and SDK clients stay in the application; in v1 an
event carries no mandatory delta and requires no shared server revision.

On invalidation the counter is refreshed and an “updates available” flag is
raised. The open list is kept until the user refreshes it explicitly, because
new events must not shift a list that is being read; reopening the bell
reconciles the first page as well. Frequent invalidations are coalesced, and an
invalidation that arrives during a request is not lost.

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

- The precise cache key of the derived view model (Iteration 3).
- Whether the mock adapter should generate a fixed data set or resolve data from
  a seed that a test can control (Iteration 4).
- The exact shape of the snapshot beyond `{ revision, state, view }` (Iteration 2).
- Whether preloading data for server rendering needs a serialisable seed beyond
  the controller contexts (Iteration 19).
- How a backend that cannot report a `markAllRead` boundary should express it —
  the v1 contract requires one, and an adapter for such a backend has to
  synthesise it (Iteration 21, with the HTTP example).

Resolved in Iteration 1: the success shape of `markAllRead` is
`{ boundary, unreadCount }` and an unknown outcome is `InboxError` with
`outcome: 'unknown'`, never an automatic retry.
