---
'@nickkupriyanov/inboxline-core': minor
---

Publish the integration contract.

- **The domain model**: `InboxNotification<TData>` (stable `id`, RFC 3339
  `createdAt` with an explicit offset, `title`, optional `body`/`author`/`icon`,
  the confirmed server `read` state and application `data`), `InboxAuthor`,
  `InboxPage<TData>` with an opaque `nextCursor`, `InboxUnreadCount`,
  `InboxContext<TContextData>` and `InboxFilter`.
- **The adapter contract**: `InboxAdapter<TData, TContextData>` with
  `getNotifications`, `getUnreadCount`, `setReadStatus` and `markAllRead`, each
  receiving the context; loads also receive an `AbortSignal`, and an optional
  `subscribe({ context, onInvalidate })` reports invalidations from a transport
  that stays in the application.
- **The error contract**: `InboxError` with `code` (`ADAPTER_FAILURE`,
  `ADAPTER_CONTRACT_VIOLATION`, `UNAUTHORIZED`, `NOT_FOUND`, `CONFLICT`,
  `UNKNOWN`), `phase` (`load`/`mutation`), `outcome` (`rejected`/`unknown`),
  structural `isInboxError()`, `toInboxError()`, `createUnknownOutcomeError()`
  and the abort helpers. A cancelled request is not an `InboxError`.
- **Boundary checks** for adapter authors: `assertInboxPage`,
  `assertInboxUnreadCount`, `assertInboxReadStatusResult`,
  `assertInboxMarkAllReadResult`, their `is*` predicates, and
  `isInboxTimestamp()`, which rejects an offset-less or rolled-over date instead
  of re-interpreting it.
- **Context and filter helpers**: `DEFAULT_INBOX_CONTEXT`, `DEFAULT_CONTEXT_KEY`,
  `INBOX_FILTERS`, `DEFAULT_FILTER`, `isInboxContext()`,
  `isSameInboxContext()` (key equality) and `isInboxFilter()`.
- **The controller vocabulary, types only** (`InboxActions`, `InboxCallbacks`):
  `setFilter`, `refresh`, `loadMore`, `setRead(id, read)`, `markAllRead`,
  `reconcile`, `setContext`, `setAdapter`, plus `onNotificationClick` and
  `onError`. Nothing runs yet — `createInboxController()` arrives in Iteration 5,
  and the controlled UI values stay in the binding.

Decisions fixed here: `markAllRead` resolves with `{ boundary, unreadCount }`,
where the boundary decides which notifications count as read after an unknown
outcome, and a lost response is an `InboxError` with `outcome: 'unknown'` that is
never retried automatically. Mutations receive no `AbortSignal`, because
cancelling one after the server received it would create exactly that unknown
outcome. No migration is needed: the package had no runtime exports before this
change.
