---
'@nickkupriyanov/inboxline-core': minor
---

Add the state machine: an immutable inbox state and its pure reducer.

- **`InboxState<TData>`** and **`createInboxState()`**: the confirmed rows
  (`byId` indexed by id plus `order` in the server's order, without duplicates),
  the cursor of the next page, the filter, the context key, one status and one
  error per load (first page, next page, counter), the server counter with its
  honest `null` while it is unknown, the optimistic layer, and the generation of
  each request.
- **`inboxReducer(state, action)`** with the transitions `contextChanged`,
  `setFilter`, `listLoading`/`listLoaded`/`listFailed`,
  `pageLoading`/`pageLoaded`/`pageFailed`,
  `countLoading`/`countLoaded`/`countFailed` and
  `readPending`/`readConfirmed`/`readFailed`/`readUnknown`. An action that
  changes nothing returns the same object, so a snapshot stays stable.
- **The optimistic layer** (`InboxPendingState`, `InboxPendingRead`,
  `InboxPendingBulk`) stays separate from confirmed data: a pending read never
  writes `byId` or `unreadCount`, a rejected operation rolls back only its own
  layer, and an operation whose answer was lost stays `unknown` until the
  application reconciles.
- **Documented guarantees**: the server order is never re-sorted, merging a page
  is additive (a repeated id keeps its place and its content), a `nextCursor`
  that does not advance ends the list, and a terminal action whose request
  generation no longer matches is dropped.

No breaking change and no migration: the only runtime exports added are
`createInboxState` and `inboxReducer`. The controller, the derived view model and
the mock adapter are still to come, so nothing runs a request yet.
